import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRss, matchingTopics, sourceResult, safeUrl, dayInZone, dateRange } from '../scripts/lib.mjs';
test('an outage preserves the last good payload and its original timestamp', () => {
  const saved={data:{stories:[{title:'Saved story'}]},lastSuccessAt:'2026-10-05T18:00:00Z'};
  const result=sourceResult(saved,null,'HTTP 503','2026-10-06T00:00:00Z');
  assert.equal(result.status,'stale');assert.deepEqual(result.data,saved.data);
  assert.equal(result.lastSuccessAt,saved.lastSuccessAt);assert.equal(result.lastAttemptAt,'2026-10-06T00:00:00Z');
});
test('a valid empty feed is fresh while an initial outage is unavailable', () => {
  assert.equal(sourceResult(null,{stories:[]},null,'2026-10-06T00:00:00Z').status,'fresh');
  assert.equal(sourceResult(null,null,'Timeout','2026-10-06T00:00:00Z').status,'unavailable');
});
test('public links cannot use executable or local URL schemes', () => {
  for(const url of ['javascript:alert(1)','data:text/html,x','file:///secret','not a URL'])assert.equal(safeUrl(url),null);
  assert.equal(safeUrl('https://example.com/story'),'https://example.com/story');
});
test('short interest terms match words rather than substrings', () => {
  const groups={'AI':['AI'],'Folk':['cult','witch']};
  assert.deepEqual(matchingTopics('Daily culture dispatch',groups),[]);
  assert.deepEqual(matchingTopics('AI and a witch ritual',groups),['AI','Folk']);
});
test('RSS normalization drops full article content and unsafe links', () => {
  const xml='<rss><channel><item><title><![CDATA[<b>A cult</b> &amp; a ritual]]></title><link>https://example.com/a</link><pubDate>Tue, 06 Oct 2026 10:00:00 GMT</pubDate><description>Private body is never emitted</description></item><item><title>Unsafe</title><link>javascript:alert(1)</link><pubDate>Tue, 06 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>';
  const records=parseRss(xml,{Folk:['cult','ritual']});
  assert.equal(records.length,1);assert.equal(records[0].title,'A cult & a ritual');
  assert.deepEqual(records[0].topics,['Folk']);assert.ok(!JSON.stringify(records).includes('Private body'));
});
test('unexpected XML and entity declarations fail rather than appearing empty', () => {
  assert.throws(()=>parseRss('<html>Unavailable</html>',{}),/RSS/);
  assert.throws(()=>parseRss('<!DOCTYPE rss [<!ENTITY a "secret">]><rss/>',{}),/declarations/);
});
test('date windows use Central time across midnight and DST changes', () => {
  assert.equal(dayInZone(new Date('2026-10-06T02:00:00Z'),'America/Chicago'),'2026-10-05');
  assert.equal(dayInZone(new Date('2026-12-06T05:30:00Z'),'America/Chicago'),'2026-12-05');
  assert.deepEqual(dateRange('2026-10-31',3),['2026-10-31','2026-11-01','2026-11-02']);
});
