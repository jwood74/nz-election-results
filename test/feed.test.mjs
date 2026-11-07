import test from 'node:test';
import assert from 'node:assert/strict';
import { parseXml, createXmlLoader, normalizeNational, normalizeElectorate, createService, mapLimit } from '../lib/feed.mjs';
import { respond } from '../lib/http.mjs';
import { coalition, filterRaces, sourceTime } from '../public/model.js';

const meta = {
  parties: [{ id: '16', name: 'National Party', abbreviation: 'NAT' }, { id: '13', name: 'Labour Party', abbreviation: 'LAB' }],
  candidates: [{ id: '1', name: 'Candidate A', partyId: '16' }, { id: '2', name: 'Candidate B', partyId: '13' }],
};
const national = (seats = 0) => ({ updated: '2026-11-06T16:19:53', statistics: { total_votes_cast: '0', total_voting_places_counted: '0', percent_voting_places_counted: '0' }, partystatus: { party: { p_no: '16', votes: '0', percent_votes: '0', party_seats: '0', candidate_seats: '0', total_seats: String(seats) } } });
const electorate = (a = 0, b = 0) => ({ e_no: '1', final: 'true', updated: '2026-11-06T16:19:53', statistics: { total_voting_places: '20', total_voting_places_counted: '0', percent_voting_places_counted: '0' }, candidatevotes: { candidate: [{ c_no: '1', votes: String(a) }, { c_no: '2', votes: String(b) }] } });

test('XML preserves attributes and decodes entities', () => {
  assert.deepEqual(parseXml('<party p_no="16"><name>A &amp; B</name></party>').party, { p_no: '16', name: 'A & B' });
  assert.throws(() => parseXml('<bad>'));
  assert.throws(() => parseXml('<!DOCTYPE x><x/>'));
});
test('zero national feed has no invented seat allocation; majority handles overhang', () => {
  const result = normalizeNational(national(), meta);
  assert.equal(result.majority, null);
  assert.equal(result.parties[0].name, 'National Party');
  assert.equal(normalizeNational(national(1), meta).majority, 61);
  assert.equal(normalizeNational(national(123), meta).majority, 62);
});
test('invalid numbers fail instead of being shown as zero', () => {
  const value = national(); value.statistics.total_votes_cast = 'bad';
  assert.throws(() => normalizeNational(value, meta));
});
test('zero electorate is not called, even with final=true; ties have no sole leader', () => {
  const normalize = (a, b) => normalizeElectorate(electorate(a,b), { id: '1', name: 'Test' }, meta);
  assert.equal(normalize(0,0).leader, null);
  assert.equal(normalize(0,0).margin, null);
  assert.equal(normalize(5,5).tied, true);
  assert.equal(normalize(5,5).leader, null);
  assert.equal(normalize(60,40).margin, 20);
  assert.equal(normalize(60,40).marginPercent, 20);
  assert.equal(normalize(60,40).leader.party, 'National Party');
  assert.throws(() => normalizeElectorate(electorate(), { id: '2' }, meta));
});
test('loader caches, coalesces concurrent requests and retries failed refreshes', async () => {
  let calls = 0, now = 0;
  const load = createXmlLoader(async () => { calls++; return new Response('<election/>'); }, () => now);
  await Promise.all([load('election.xml'), load('election.xml')]);
  assert.equal(calls, 1);
  await load('election.xml'); assert.equal(calls, 1);
  now = 60_000; await load('election.xml'); assert.equal(calls, 2);
  const broken = createXmlLoader(async () => { calls++; return new Response('blocked', { status: 403 }); });
  await assert.rejects(broken('election.xml')); await assert.rejects(broken('election.xml'));
  assert.equal(calls, 4);
});
test('bounded mapping keeps order', async () => {
  let active = 0, peak = 0;
  const values = await mapLimit([1,2,3,4], 2, async x => { active++; peak = Math.max(peak,active); await Promise.resolve(); active--; return x*2; });
  assert.deepEqual(values, [2,4,6,8]); assert.equal(peak, 2);
});
test('service supports single-element metadata and reports partial failures', async () => {
  const load = async path => {
    if (path === 'parties.xml') return { parties: { party: { p_no: '16', short_name: 'National', abbrev: 'NAT' } } };
    if (path === 'candidates.xml') return { candidates: { candidate: { c_no: '1', candidate_name: 'A', party: '16' } } };
    if (path === 'electorates.xml') return { electorates: { electorate: [{ e_no: '1', electorate_name: 'One' }, { e_no: '2', electorate_name: 'Two' }] } };
    if (path === 'e01/e01.xml') return { electorate: electorate(10, 2) };
    throw new Error('unavailable');
  };
  const result = await createService(load).electorates();
  assert.deepEqual(result.warnings, ['Two']); assert.equal(result.electorates[1].unavailable, true);
});
test('HTTP errors are not cached; only GET is accepted; success has CDN caching', async () => {
  const request = new Request('https://example.test/api/national');
  const ok = await respond(request, async () => ({ votes: 0 }));
  assert.equal(ok.status, 200); assert.match(ok.headers.get('Netlify-CDN-Cache-Control'), /s-maxage=55/);
  const bad = await respond(request, async () => { throw new Error('test failure'); });
  assert.equal(bad.status, 502); assert.equal(bad.headers.get('Cache-Control'), 'no-store');
  const partial = await respond(request, async () => ({ warnings: ['One'] }));
  assert.equal(partial.headers.get('Netlify-CDN-Cache-Control'), 'no-store');
  assert.equal((await respond(new Request(request, { method: 'POST' }), async () => null)).status, 405);
});
test('coalition adds only selected parties and never invents a majority', () => {
  const parties = [{ id: '1', seats: 50 }, { id: '2', seats: 15 }];
  assert.deepEqual(coalition(parties, new Set(['1','2']), 61), { seats: 65, needed: 0 });
  assert.equal(coalition(parties, new Set(['1']), null).needed, null);
});
test('race views handle ties, unreported seats, macrons, watchlists and null-last sorting', () => {
  const rows = [{ id:'1', name:'Ōtāhuhu', margin:10 }, { id:'2', name:'Other', margin:null }, { id:'3', name:'Tie', margin:0 }];
  const options = { view:'closest', search:'', watchlist:new Set(), sortKey:'margin', direction:1 };
  assert.deepEqual(filterRaces(rows, options).map(r=>r.id), ['3','1']);
  assert.equal(filterRaces(rows, {...options, search:'otahuhu'})[0].id, '1');
  assert.equal(filterRaces(rows, {...options, view:'all', direction:-1}).at(-1).id, '2');
  assert.equal(filterRaces(rows, {...options, view:'watchlist', watchlist:new Set(['2'])})[0].id, '2');
});
test('NZ source timestamps use daylight saving, not the server timezone', () => {
  assert.equal(new Date(sourceTime('2026-11-06T16:19:53')).toISOString(), '2026-11-06T03:19:53.000Z');
  assert.equal(new Date(sourceTime('2026-06-06T16:19:53')).toISOString(), '2026-06-06T04:19:53.000Z');
  assert.equal(sourceTime('2026-11-06T03:19:53Z'), Date.parse('2026-11-06T03:19:53Z'));
});
