import { XMLParser } from 'fast-xml-parser';

export const asArray = value => value == null ? [] : Array.isArray(value) ? value : [value];
export function safeUrl(value) {
  try { const url = new URL(String(value)); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
export function plainText(value) {
  const text = typeof value === 'object' ? value?.['#text'] ?? '' : value ?? '';
  const entities = { amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“',hellip:'…',ndash:'–',mdash:'—' };
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity.startsWith('#')) { const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2),16) : parseInt(entity.slice(1),10); return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''; }
    return entities[entity.toLowerCase()] ?? match;
  }).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 300);
}
export function matchingTopics(title, groups) {
  return Object.entries(groups).filter(([, terms]) => terms.some(term => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(title);
  })).map(([name]) => name);
}
export function dayInZone(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
export function dateRange(first, days) {
  return Array.from({length: days}, (_, i) => new Date(Date.parse(first + 'T12:00:00Z') + i * 86400000).toISOString().slice(0,10));
}
export function parseRss(xml, topics) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Unsupported XML declarations');
  const feed = new XMLParser({ ignoreAttributes: false, parseTagValue: false, processEntities: true, htmlEntities: true }).parse(xml);
  if (!feed.rss?.channel) throw new Error('Response is not an RSS feed');
  return asArray(feed.rss.channel.item).map(item => {
    const title = plainText(item.title), url = safeUrl(item.link), date = new Date(item.pubDate);
    return { id: plainText(item.guid) || url, title, url, publishedAt: Number.isFinite(date.getTime()) ? date.toISOString() : null, topics: matchingTopics(title, topics), source: 'Bloody Disgusting' };
  }).filter(item => item.url && item.title && item.publishedAt);
}
export function sourceResult(previous, data, error, attemptedAt) {
  return error ? { status: previous?.data ? 'stale' : 'unavailable', lastAttemptAt: attemptedAt, lastSuccessAt: previous?.lastSuccessAt ?? null, error: String(error).slice(0, 180), data: previous?.data ?? null }
    : { status: 'fresh', lastAttemptAt: attemptedAt, lastSuccessAt: attemptedAt, error: null, data };
}
export async function mapLimit(items, limit, worker) {
  const results = new Array(items.length); let next = 0;
  await Promise.all(Array.from({length: Math.min(limit, items.length)}, async () => {
    while (next < items.length) { const index = next++; results[index] = await worker(items[index], index); }
  }));
  return results;
}
