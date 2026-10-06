import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { asArray, safeUrl, plainText, matchingTopics, dayInZone, dateRange, parseRss, sourceResult, mapLimit } from './lib.mjs';

const config = JSON.parse(await readFile(new URL('../config.json', import.meta.url), 'utf8'));
const output = new URL('../data/dashboard.json', import.meta.url);
let previous = {};
try { previous = JSON.parse(await readFile(output, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const now = new Date(), attemptedAt = now.toISOString();
const today = dayInZone(now, config.timezone);
const dates = dateRange(today, 7);
async function request(url, type = 'json') {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const headers = { 'User-Agent': 'Austin-Daily-Brief/1.0 (https://github.com/AustinPoulson/daily-dashboard)', Accept: type === 'json' ? 'application/json' : 'application/rss+xml, application/xml, text/xml' };
      if (new URL(url).hostname === 'api.github.com') {
        headers.Accept = 'application/vnd.github+json';
        headers['X-GitHub-Api-Version'] = '2022-11-28';
        if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
      }
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
      return type === 'json' ? await response.json() : await response.text();
    } catch (error) {
      if (attempt === 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
}
async function weather() {
  const params = new URLSearchParams({ latitude: config.location.latitude, longitude: config.location.longitude, timezone: config.timezone, temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', precipitation_unit: 'inch', forecast_days: '7', current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day', hourly: 'temperature_2m,precipitation_probability,weather_code', daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset' });
  const data = await request(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!data.current || !Array.isArray(data.daily?.time) || !data.hourly?.time) throw new Error('Incomplete weather response');
  return { location: config.location.name, timezone: data.timezone, current: data.current, units: data.current_units, daily: data.daily, hourly: data.hourly };
}
async function github() {
  const first = dateRange(today, 1)[0];
  const start = new Date(Date.parse(first + 'T00:00:00Z') - 27 * 86400000).toISOString().slice(0,10);
  const days = dateRange(start, 28), counts = Object.fromEntries(days.map(d => [d, 0]));
  const repos = await mapLimit(config.repositories, 2, async name => {
    const base = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(name)}`;
    const repo = await request(base);
    if (repo.private !== false) throw new Error('Tracked repository must be public');
    let commits = [], page = 1;
    while (page <= 10) {
      const batch = await request(`${base}/commits?since=${start}T00:00:00Z&per_page=100&page=${page}`);
      if (!Array.isArray(batch)) throw new Error('Invalid commit list');
      commits.push(...batch);
      if (batch.length < 100) break;
      if (page === 10) throw new Error('Commit pagination limit exceeded');
      page++;
    }
    let inWindow = 0;
    for (const commit of commits) {
      const date = new Date(commit.commit?.committer?.date);
      if (!Number.isFinite(date.getTime())) continue;
      const day = dayInZone(date, config.timezone); if (day in counts) { counts[day]++; inWindow++; }
    }
    const issues = await request(`${base}/issues?state=open&per_page=100`);
    const pulls = await request(`${base}/pulls?state=open&per_page=100`);
    return { name: repo.name, url: repo.html_url, description: plainText(repo.description), language: repo.language, stars: repo.stargazers_count, pushedAt: repo.pushed_at, commits: inWindow, openPulls: pulls.length, openIssues: issues.filter(i => !i.pull_request).length, issueCountCapped: issues.length === 100, pullCountCapped: pulls.length === 100 };
  });
  return { owner: config.owner, repositories: repos, activity: days.map(date => ({date, count: counts[date]})), totalCommits: Object.values(counts).reduce((a,b) => a+b,0), scope: 'Commits on default branches of tracked public repositories; all contributors.' };
}
async function news() {
  const ids = await request('https://hacker-news.firebaseio.com/v0/topstories.json');
  if (!Array.isArray(ids)) throw new Error('Invalid Hacker News response');
  const sampled = await mapLimit(ids.slice(0,60), 5, id => request(`https://hacker-news.firebaseio.com/v0/item/${id}.json`));
  const stories = sampled.filter(item => item && item.type === 'story' && !item.dead && !item.deleted).map(item => {
    const title = plainText(item.title);
    return { id: item.id, title, url: safeUrl(item.url) || `https://news.ycombinator.com/item?id=${item.id}`, discussionUrl: `https://news.ycombinator.com/item?id=${item.id}`, publishedAt: new Date(item.time * 1000).toISOString(), score: item.score ?? 0, comments: item.descendants ?? 0, topics: matchingTopics(title, config.techTopics) };
  });
  const relevant = stories.filter(item => item.topics.length).sort((a,b) => b.topics.length - a.topics.length || b.score - a.score);
  const topics = Object.keys(config.techTopics).map(name => ({ name, count: stories.filter(s => s.topics.includes(name)).length }));
  return { stories: relevant.slice(0,16), topics, sampledCount: stories.length, matchedCount: relevant.length, source: 'Hacker News' };
}
async function horror() {
  const items = parseRss(await request(config.horrorFeed, 'text'), config.mediaTopics);
  if (!items.length) throw new Error('Horror feed contained no usable items');
  const cutoff = now.getTime() - 30 * 86400000;
  const recent = items.filter(i => Date.parse(i.publishedAt) >= cutoff && !/\/(video-games|books|comics|music|toys|collectibles)\//.test(new URL(i.url).pathname));
  recent.sort((a,b) => Number(b.topics.some(t => t !== 'Horror')) - Number(a.topics.some(t => t !== 'Horror')) || Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  return { stories: recent.slice(0,10), source: 'Bloody Disgusting' };
}
async function television() {
  const byDate = await mapLimit(dates, 1, async date => {
    const broadcast = await request(`https://api.tvmaze.com/schedule?country=US&date=${date}`);
    const streaming = await request(`https://api.tvmaze.com/schedule/web?date=${date}`);
    if (!Array.isArray(broadcast) || !Array.isArray(streaming)) throw new Error('Invalid TV schedule response');
    const items = [...broadcast.map(e => ({...e,scope:'US broadcast'})), ...streaming.map(e => ({...e,scope:'Global streaming schedule'}))];
    await new Promise(resolve => setTimeout(resolve, 200));
    return items;
  });
  const seen = new Set();
  const episodes = byDate.flat().filter(episode => {
    const show = episode.show || episode._embedded?.show;
    if (!show || !asArray(show.genres).some(g => config.tvGenres.includes(g)) || (config.tvLanguages?.length && !config.tvLanguages.includes(show.language)) || seen.has(episode.id)) return false;
    seen.add(episode.id); return true;
  }).map(episode => {
    const show = episode.show || episode._embedded.show;
    return { id: episode.id, title: plainText(show.name), episode: plainText(episode.name), season: episode.season, number: episode.number, date: episode.airdate, airstamp: episode.airstamp, url: safeUrl(episode.url) || safeUrl(show.url), showUrl: safeUrl(show.url), genres: show.genres, channel: plainText(show.webChannel?.name || show.network?.name || 'TBA'), scope: episode.scope };
  }).filter(e => e.url).sort((a,b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  return { episodes, days: dates.map(date => ({date,count:episodes.filter(e => e.date === date).length})), genres: config.tvGenres, languages:config.tvLanguages||[], source:'TVmaze' };
}
const fetchers = { weather, github, news, horror, television };
const sources = {};
await Promise.all(Object.entries(fetchers).map(async ([name, fetcher]) => {
  try { sources[name] = sourceResult(previous.sources?.[name], await fetcher(), null, attemptedAt); }
  catch (error) { sources[name] = sourceResult(previous.sources?.[name], null, error.message, attemptedAt); }
  console.log(`${name}: ${sources[name].status}${sources[name].error ? ' — ' + sources[name].error : ''}`);
}));
const dashboard = { schemaVersion: 1, generatedAt: attemptedAt, timezone: config.timezone, displayName: config.displayName, owner: config.owner, location: config.location.name, sources };
await mkdir(new URL('../data/', import.meta.url), {recursive:true});
await writeFile(output, JSON.stringify(dashboard, null, 2) + '\n');
const successful = Object.values(sources).filter(s => s.status === 'fresh').length;
if (!successful) { console.error('No source refreshed; refusing to report a successful refresh.'); process.exitCode = 1; }
