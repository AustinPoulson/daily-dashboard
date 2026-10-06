const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const safeUrl = value => {try {const url = new URL(value); return ['https:','http:'].includes(url.protocol) ? url.href : '#';} catch{return '#';}};
const link = (url, title, cls='') => `<a class="${cls}" href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${esc(title)}</a>`;
let dashboard, forecastMode='daily', mediaMode='horror', topic='all';
const num = value => Number.isFinite(value) ? Math.round(value) : '—';
const date = (value, options={month:'short',day:'numeric'}) => new Intl.DateTimeFormat('en-US',{timeZone:dashboard?.timezone||'America/Chicago',...options}).format(new Date(value.length===10 ? value+'T12:00:00Z' : value));
const relative = value => {
  if (!value) return 'Never refreshed';
  const hours = Math.max(0,(Date.now()-Date.parse(value))/3600000);
  if (hours < 1) return `${Math.max(1,Math.round(hours*60))}m ago`;
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  return `${Math.floor(hours/24)}d ago`;
};
const effectivelyStale = source => source.status !== 'fresh' || Date.now()-Date.parse(source.lastSuccessAt)>12*3600000;
const empty = message => `<p class="empty">${esc(message)}</p>`;
const tags = topics => topics.map(t=>`<span class="tag">${esc(t)}</span>`).join('');
const condition = code => code===0?'Clear sky':code<=3?'Partly cloudy':code<=48?'Foggy':code<=57?'Drizzle':code<=67?'Rain':code<=77?'Snow':code<=82?'Rain showers':code<=86?'Snow showers':'Thunderstorms';
const weatherIcon = code => code===0?'☀':code<=3?'☁':code<=48?'≋':code<=67?'☂':code<=77?'❄':code<=82?'☂':code<=86?'❄':'ϟ';
function svg(content,label,width=560,height=200){return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>${content}</svg>`;}
function forecastChart(data) {
  let labels, highs, lows, rain;
  if (forecastMode==='daily') {
    labels=data.daily.time.map(d=>date(d,{weekday:'short'})); highs=data.daily.temperature_2m_max;lows=data.daily.temperature_2m_min;rain=data.daily.precipitation_probability_max;
  } else {
    let start=data.hourly.time.findIndex(t=>t>=data.current.time);if(start<0)start=0;
    const times=data.hourly.time.slice(start,start+24);
    labels=times.map(t=>{const h=Number(t.slice(11,13));return `${h%12||12}${h<12?'a':'p'}`;});
    highs=data.hourly.temperature_2m.slice(start,start+24);lows=null;rain=data.hourly.precipitation_probability.slice(start,start+24);
  }
  const finite=[...highs,...(lows||[])].filter(Number.isFinite);if(!finite.length)return empty('Forecast temperatures are unavailable.');
  const min=Math.floor((Math.min(...finite)-5)/10)*10,max=Math.ceil((Math.max(...finite)+5)/10)*10;
  const chartWidth=Math.min(560,$('#weather-content').clientWidth||560);
  const left=36,right=chartWidth-44,top=15,bottom=150,width=right-left;
  const x=i=>left+i*width/Math.max(1,labels.length-1),y=n=>bottom-(n-min)/(max-min)*(bottom-top);
  let content='';
  for(let n=min;n<=max;n+=10)content+=`<line class="axis" x1="${left}" x2="${right}" y1="${y(n)}" y2="${y(n)}"/><text x="0" y="${y(n)+4}">${n}°</text>`;
  content+=`<text x="${right+10}" y="${top+4}">100%</text><text x="${right+10}" y="${bottom+4}">0%</text>`;
  rain.forEach((n,i)=>{if(Number.isFinite(n)){const h=n/100*(bottom-top);content+=`<rect x="${x(i)-Math.min(11,width/labels.length*.2)}" y="${bottom-h}" width="${Math.min(22,width/labels.length*.4)}" height="${h}" rx="3" fill="#244464"><title>${esc(labels[i])}: ${n}% precipitation chance</title></rect>`;}});
  const line=(values,color)=>{let path='';values.forEach((n,i)=>{if(Number.isFinite(n)){path+=`${i===0||!Number.isFinite(values[i-1])?'M':'L'}${x(i).toFixed(1)},${y(n).toFixed(1)} `;}});return `<path d="${path}" fill="none" stroke="${color}" stroke-width="2.5"/>`+values.map((n,i)=>Number.isFinite(n)?`<circle cx="${x(i)}" cy="${y(n)}" r="${values.length>7?2:3.5}" fill="${color}"><title>${esc(labels[i])}: ${num(n)}°F</title></circle>`:'').join('');};
  content+=line(highs,'#6ee7b7');if(lows)content+=line(lows,'#7ab9ff');
  labels.forEach((label,i)=>{if(labels.length<=7||i%4===0||i===labels.length-1)content+=`<text x="${x(i)}" y="176" text-anchor="middle">${esc(label)}</text>`;});
  const summary=labels.map((l,i)=>`${l}: ${num(highs[i])} degrees${lows?' high, '+num(lows[i])+' low':''}, ${num(rain[i])}% precipitation chance`).join('; ');
  return svg(content,summary,chartWidth,190)+`<div class="legend"><span><i class="swatch"></i>${lows?'High':'Temperature'}</span>${lows?'<span><i class="swatch blue"></i>Low</span>':''}<span><i class="swatch rain"></i>Precipitation chance</span></div>`;
}
function renderWeather(){
  const source=dashboard.sources.weather,data=source.data;
  $('#weather-content').className='';if(!data){$('#weather-content').innerHTML=empty('Weather is unavailable. The next scheduled refresh will try again.');return;}
  const c=data.current,d=data.daily;
  const todayIndex=Math.max(0,d.time.indexOf(c.time.slice(0,10)));
  const sunset=d.sunset[todayIndex]?.slice(11,16);const hour=Number(sunset?.slice(0,2));
  const sunsetLabel=sunset?`${hour%12||12}:${sunset.slice(3)} ${hour<12?'AM':'PM'}`:'—';
  $('#weather-content').innerHTML=`<div class="weather-now"><div class="temp">${num(c.temperature_2m)}<sup>°F</sup></div><div><p class="condition">${esc(condition(c.weather_code))}</p><span class="subtle">Feels like ${num(c.apparent_temperature)}° · H ${num(d.temperature_2m_max[todayIndex])}° / L ${num(d.temperature_2m_min[todayIndex])}°</span></div><div class="weather-icon" aria-hidden="true">${weatherIcon(c.weather_code)}</div></div><div class="weather-facts"><div><span class="fact-label">Precipitation today</span><span class="fact-value">${num(d.precipitation_probability_max[todayIndex])}%</span></div><div><span class="fact-label">Wind</span><span class="fact-value">${num(c.wind_speed_10m)} mph</span></div><div><span class="fact-label">Humidity</span><span class="fact-value">${num(c.relative_humidity_2m)}%</span></div><div><span class="fact-label">Sunset</span><span class="fact-value">${sunsetLabel}</span></div></div><div class="chart-heading"><span class="chart-title">Temperature & rain</span><div class="segmented" role="group" aria-label="Forecast range"><button data-forecast="daily" aria-pressed="${forecastMode==='daily'}">7 days</button><button data-forecast="hourly" aria-pressed="${forecastMode==='hourly'}">24 hours</button></div></div>${forecastChart(data)}<p class="chart-note">Forecast begins ${date(d.time[0])} · °F on left, rain chance on right</p>`;
  document.querySelectorAll('[data-forecast]').forEach(button=>button.addEventListener('click',()=>{forecastMode=button.dataset.forecast;renderWeather();}));
}
function renderGithub(){
  const data=dashboard.sources.github.data;$('#github-content').className='';
  if(!data){$('#github-content').innerHTML=empty('Public project activity is unavailable.');return;}
  const pulls=data.repositories.reduce((n,r)=>n+r.openPulls,0),max=Math.max(1,...data.activity.map(d=>d.count));
  const chartWidth=Math.min(420,$('#github-content').clientWidth||420),step=chartWidth/28;
  let bars='';data.activity.forEach((d,i)=>{const h=d.count/max*56;bars+=`<rect x="${i*step}" y="${62-h}" width="${step*.67}" height="${d.count?h:3}" rx="2" fill="${d.count?'#6ee7b7':'#263347'}"><title>${d.date}: ${d.count} commits</title></rect>`;});
  bars+=`<text x="0" y="86">${date(data.activity[0].date)}</text><text x="${chartWidth-5}" y="86" text-anchor="end">${date(data.activity.at(-1).date)}</text>`;
  $('#github-content').innerHTML=`<div class="project-metrics"><div><span class="metric">${data.totalCommits}</span><span class="metric-label">commits / 28 days</span></div><div><span class="metric">${pulls}${data.repositories.some(r=>r.pullCountCapped)?'+':''}</span><span class="metric-label">open pull requests</span></div></div><div class="commit-chart">${svg(bars,'Daily commit counts across tracked public repositories: '+data.activity.map(d=>d.date+': '+d.count).join('; '),chartWidth,94)}</div><div class="repo-list">${data.repositories.map(r=>`<div class="repo-row"><div>${link(r.url,r.name,'repo-name')}<div class="repo-meta"><span>${esc(r.language||'Mixed')}</span><span>${r.openIssues}${r.issueCountCapped?'+':''} open issues</span></div></div><div class="repo-count">${r.commits}<small>commits</small></div></div>`).join('')}</div><p class="chart-note">Default branches · all contributors · public repos only</p>`;
}
function renderNews(){
  const data=dashboard.sources.news.data;$('#news-content').className='';
  if(!data){$('#news-content').innerHTML=empty('The developer news feed is unavailable.');return;}
  const max=Math.max(1,...data.topics.map(t=>t.count));const filtered=topic==='all'?data.stories:data.stories.filter(s=>s.topics.includes(topic));
  $('#news-content').innerHTML=`<div class="topic-chart" role="img" aria-label="Topic matches in ${data.sampledCount} sampled top Hacker News stories: ${esc(data.topics.map(t=>t.name+': '+t.count).join('; '))}">${data.topics.map(t=>`<div class="topic-row"><div class="topic-label"><span>${esc(t.name)}</span><span>${t.count}</span></div><div class="topic-track"><div class="topic-fill" style="width:${t.count/max*100}%"></div></div></div>`).join('')}</div><div class="news-controls"><span>${data.matchedCount} matches / ${data.sampledCount} sampled stories</span><select id="topic-filter" aria-label="Filter developer stories by topic"><option value="all">All topics</option>${data.topics.map(t=>`<option${topic===t.name?' selected':''}>${esc(t.name)}</option>`).join('')}</select></div>${filtered.length?`<ol class="story-list">${filtered.slice(0,8).map(s=>`<li class="story">${link(s.url,s.title,'story-title')}<div class="story-meta"><span>${s.score} points</span>${link(s.discussionUrl,s.comments+' comments')}<span>${relative(s.publishedAt)}</span>${tags(s.topics.slice(0,2))}</div></li>`).join('')}</ol>`:empty('No matching stories in this sample. Try another topic.')}<p class="chart-note">Title keyword matches · stories can appear in more than one topic</p>`;
  $('#topic-filter').addEventListener('change',event=>{topic=event.target.value;renderNews();});
}
function renderMedia(){
  const source=dashboard.sources[mediaMode],data=source.data;$('#media-content').className='';
  const badge=$('#screen .source-status');setStatus(badge,source);badge.dataset.source=mediaMode;
  if(!data){$('#media-content').innerHTML=empty('This media feed is unavailable.');return;}
  if(mediaMode==='horror'){
    $('#media-content').innerHTML=`<p class="media-intro">Recent horror coverage, with folk, ritual, tech & identity matches first.</p>${data.stories.length?`<ul class="story-list">${data.stories.slice(0,6).map(s=>`<li class="story">${link(s.url,s.title,'story-title')}<div class="story-meta"><span>${date(s.publishedAt)}</span><span>Bloody Disgusting</span>${tags(s.topics.slice(0,2))}</div></li>`).join('')}</ul>`:empty('No recent horror headlines in the feed.')}<p class="chart-note">Discovery coverage · movie release dates are in the linked articles</p>`;
  }else{
    const groups=new Map();
    for(const episode of data.episodes){const key=[episode.showUrl,episode.date,episode.season,episode.channel].join('|');if(!groups.has(key))groups.set(key,{...episode,count:0,numbers:[]});const group=groups.get(key);group.count++;if(episode.number!=null)group.numbers.push(episode.number);}
    const upcoming=[...groups.values()];
    const max=Math.max(1,...data.days.map(d=>d.count)),chartWidth=Math.min(400,$('#media-content').clientWidth||400),step=chartWidth/7;let chart='';
    data.days.forEach((d,i)=>{const h=d.count/max*60,x=i*step+step/2;chart+=`<rect x="${x-step*.22}" y="${70-h}" width="${step*.44}" height="${d.count?h:2}" rx="3" fill="${d.count?'#7ab9ff':'#263347'}"><title>${d.date}: ${d.count} episodes</title></rect><text x="${x}" y="${Math.max(8,65-h)}" text-anchor="middle">${d.count}</text><text x="${x}" y="94" text-anchor="middle">${esc(date(d.date,{weekday:'short'}))}</text>`;});
    $('#media-content').innerHTML=`<p class="media-intro">Horror, sci-fi & thriller · ${esc((data.languages||[]).join(', ')||'all languages')} · next 7 days</p><div class="tv-chart">${svg(chart,'Upcoming episode counts: '+data.days.map(d=>d.date+': '+d.count).join('; '),chartWidth,105)}</div>${upcoming.length?upcoming.slice(0,10).map(e=>`<div class="episode-row"><div class="episode-date">${date(e.date,{month:'short'})}<strong>${date(e.date,{day:'numeric'})}</strong></div><div class="episode-info">${link(e.count>1?e.showUrl:e.url,e.title,'story-title')}<span class="subtle">${e.season!=null?'S'+e.season:''}${e.count>1?' · '+e.count+' episodes':(e.number!=null?' · E'+e.number:'')+(e.episode?' · '+esc(e.episode):'')}</span><div class="story-meta"><span>${esc(e.channel)}</span><span>${esc(e.scope)}</span></div></div></div>`).join(''):empty('No matching episodes scheduled this week.')}<p class="chart-note">TVmaze schedule · global streaming listings may vary by region. Counts are episodes; batches from one show are grouped below.</p>`;
  }
}
function setStatus(element,source){const stale=effectivelyStale(source);element.className='source-status '+(source.status==='unavailable'?'unavailable':stale?'stale':'');element.textContent=source.status==='unavailable'?'Unavailable':`${stale?'Saved · ':''}${relative(source.lastSuccessAt)}`;}
function render(){
  $('#date-label').textContent=date(new Date().toISOString(),{weekday:'long',month:'long',day:'numeric'}).toUpperCase();
  $('#header-date').textContent=date(new Date().toISOString(),{year:'numeric'});
  $('#refresh-label').textContent='Snapshot '+relative(dashboard.generatedAt);
  const stale=Object.entries(dashboard.sources).filter(([,s])=>effectivelyStale(s));
  $('#notice').hidden=stale.length===0;$('#notice').textContent=stale.length?`Some sources are ${stale.map(([name])=>({github:'projects',news:'tech news',television:'TV schedule',horror:'horror news',weather:'weather'}[name])).join(', ')}. Saved data is shown where available; see Sources & freshness for details.`:'';
  if(stale.length)$('#notice').textContent=`${stale.length} source${stale.length>1?'s are':' is'} overdue or unavailable. Saved data is shown where available; see Sources & freshness for details.`;
  document.querySelectorAll('[data-source]').forEach(el=>setStatus(el,dashboard.sources[el.dataset.source]));
  renderWeather();renderGithub();renderNews();renderMedia();
  $('#source-summary').textContent=`${Object.keys(dashboard.sources).length-stale.length} / ${Object.keys(dashboard.sources).length} fresh`;
  const names={weather:'Open-Meteo · Plymouth weather',github:'GitHub · public projects',news:'Hacker News · developer radar',horror:'Bloody Disgusting · horror news',television:'TVmaze · upcoming episodes'};
  $('#source-details').innerHTML=`<div class="source-table">${Object.entries(names).map(([name,label])=>{const s=dashboard.sources[name];return `<span>${esc(label)} · ${s.status==='unavailable'?'unavailable':effectivelyStale(s)?'saved / overdue':'fresh'}</span><time>${s.lastSuccessAt?date(s.lastSuccessAt,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}):'Never refreshed'}</time>${s.error?`<span class="source-error">Last attempt ${relative(s.lastAttemptAt)}: ${esc(s.error)}</span>`:''}`;}).join('')}</div>`;
}
async function load(){
  const button=$('#reload');button.disabled=true;
  try{
    const response=await fetch(`./data/dashboard.json?t=${Date.now()}`,{cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('Could not load the dashboard snapshot');
    const data=await response.json();if(data.schemaVersion!==1||!data.sources)throw new Error('Invalid dashboard snapshot');dashboard=data;render();
  }catch(error){$('#notice').hidden=false;$('#notice').textContent='The brief could not be loaded. Please refresh in a moment.';$('#refresh-label').textContent='Snapshot unavailable';if(!dashboard)document.querySelectorAll('.loading').forEach(el=>{el.className='';el.innerHTML=empty('The data snapshot could not be loaded.');});}
  finally{button.disabled=false;}
}
$('#reload').addEventListener('click',load);
document.querySelectorAll('[data-media]').forEach(button=>button.addEventListener('click',()=>{mediaMode=button.dataset.media;document.querySelectorAll('[data-media]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));if(dashboard)renderMedia();}));
document.querySelectorAll('.nav-link').forEach(a=>a.addEventListener('click',()=>{document.querySelectorAll('.nav-link').forEach(el=>el.classList.toggle('active',el===a));}));
load();
let resizeTimer;
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(dashboard){renderWeather();renderGithub();if(mediaMode==='television')renderMedia();}},120);});
