import test from 'node:test';
import assert from 'node:assert/strict';
import { boothFiles, normalizeBooth, normalizeParties, createService, RequestError } from '../lib/feed.mjs';
import { respond } from '../lib/http.mjs';
import { boothValue, filterBooths, voteShare } from '../public/model.js';

const meta = {
  parties: [{ id: '16', name: 'National', abbreviation: 'NAT' }],
  candidates: [{ id: '1', name: 'Candidate A', partyId: '16' }],
};
const place = { vp_id: '7', vp_e_no: '10', vp_address: 'Epsom venue' };
const root = () => ({
  e_no: '1', vp_e_no: '10', vp_no: '1', vp_id: '7', updated: '2026-11-06T16:19:53', time_received: '',
  statistics: { total_issued_ballot_papers: '0', total_candidate_informals: '0', total_party_informals: '0' },
  candidatevotes: { candidate: { c_no: '1', votes: '0' } }, partyvotes: { party: { p_no: '16', votes: '0' } },
});

test('booth listing only accepts deduplicated, local files for the requested electorate', () => {
  const html = '<a href="01-10001.xml">a</a><a href="01-10001.xml">a</a><a href="02-10001.xml">b</a><a href="../01-10002.xml">c</a><a href="https://bad/01-10003.xml">d</a>';
  assert.deepEqual(boothFiles(html, '1'), ['01-10001.xml']);
  assert.throws(() => boothFiles('<html>blocked</html>', '1'));
});
test('booths map by global place ID, including a different host electorate', () => {
  const booth = normalizeBooth(root(), '01-10001.xml', '1', meta, [place]);
  assert.equal(booth.name, 'Epsom venue'); assert.equal(booth.hostElectorateId, '10');
  assert.equal(booth.reported, false); assert.equal(booth.candidateVotes, 0);
  assert.equal(booth.candidates[0].party, 'National');
  assert.throws(() => normalizeBooth(root(), '01-10002.xml', '1', meta, [place]));
  assert.throws(() => normalizeBooth(root(), '01-10001.xml', '2', meta, [place]));
  assert.throws(() => normalizeBooth(root(), '01-10001.xml', '1', meta, []));
});
test('reported status uses receipt, issued papers or votes, not file timestamp', () => {
  for (const edit of [r => r.time_received = '2026-11-07T20:00:00', r => r.statistics.total_issued_ballot_papers = '2', r => r.candidatevotes.candidate.votes = '1', r => r.statistics.total_party_informals = '1']) {
    const value = root(); edit(value);
    assert.equal(normalizeBooth(value, '01-10001.xml', '1', meta, [place]).reported, true);
  }
});
test('single-party result normalizes; missing or invalid party votes fail', () => {
  assert.equal(normalizeParties(root().partyvotes, meta).partyVotes, 0);
  assert.throws(() => normalizeParties({}, meta));
  assert.throws(() => normalizeParties({ party: { p_no: '16', votes: '-1' } }, meta));
});

function fixture(fail = []) {
  const requested = [];
  const files = Array.from({ length: 41 }, (_,i) => `01-10${String(i + 1).padStart(3, '0')}.xml`);
  const load = async path => {
    requested.push(path);
    if (path === 'parties.xml') return { parties: { party: { p_no: '16', short_name: 'National', abbrev: 'NAT' } } };
    if (path === 'candidates.xml') return { candidates: { candidate: { c_no: '1', candidate_name: 'Candidate A', party: '16' } } };
    if (path === 'electorates.xml') return { electorates: { electorate: { e_no: '1', electorate_name: 'Auckland Central' } } };
    if (path === 'votingplaces.xml') return { votingplaces: { votingplace: place } };
    if (fail.some(file => path.endsWith(file))) throw new Error('Source down');
    if (path.startsWith('e01/votingplaces/')) return { votingplace: { ...root(), vp_no: String(Number(path.match(/(\d{3})\.xml$/)[1])) } };
    if (path === 'e01/e01.xml') return { electorate: { ...root(), statistics: { ...root().statistics, total_voting_places: '41', total_voting_places_counted: '0', percent_voting_places_counted: '0' } } };
    throw new Error('Unexpected path');
  };
  return { service: createService(load, async () => files.map(f => `<a href="${f}">${f}</a>`).join('')), requested, files };
}
test('electorate detail has separate vote totals and informals', async () => {
  const detail = await fixture().service.electorate('1');
  assert.equal(detail.name, 'Auckland Central'); assert.equal(detail.partyVotes, 0); assert.equal(detail.candidateVotes, 0);
  assert.equal(detail.candidateInformals, 0); assert.equal(detail.parties.length, 1);
});
test('booth service batches 40 files and returns explicit partial failures', async () => {
  const { service, requested } = fixture(['01-10001.xml']);
  const first = await service.booths('1');
  assert.equal(first.total, 41); assert.equal(first.pageCount, 2); assert.equal(first.booths.length, 40);
  assert.deepEqual(first.warnings, ['01-10001.xml']); assert.equal(first.booths[0].unavailable, true);
  assert.equal(requested.includes('e01/votingplaces/01-10041.xml'), false);
  const last = await service.booths('1', '1'); assert.equal(last.booths.length, 1);
  await assert.rejects(service.booths('1', '2'), e => e instanceof RequestError && e.status === 404);
});
test('invalid inputs never reach source; unknown electorate returns 404', async () => {
  const { service, requested } = fixture();
  for (const id of [null, '../1', '01', '1&other=2', '']) await assert.rejects(service.electorate(id), RequestError);
  for (const page of ['-1', '1.5', 'no', '10000']) await assert.rejects(service.booths('1', page), RequestError);
  assert.equal(requested.length, 0);
  await assert.rejects(service.electorate('99'), e => e.status === 404);
});
test('all-booth failures reject; HTTP preserves validation statuses without caching', async () => {
  const { service, files } = fixture();
  await assert.rejects(fixture(files).service.booths('1'));
  const response = await respond(new Request('https://example.test/api/electorate?id=99'), () => service.electorate('99'));
  assert.equal(response.status, 404); assert.equal(response.headers.get('Cache-Control'), 'no-store');
});
test('booth shares use separate contest denominators; zero and absent values remain null', () => {
  const booth = { candidateVotes: 100, partyVotes: 200, candidates: [{ id:'1', votes:60 }], parties: [{ id:'16', votes:40 }] };
  assert.equal(boothValue(booth, '1', 'candidates', 'percent'), 60);
  assert.equal(boothValue(booth, '16', 'parties', 'percent'), 20);
  assert.equal(boothValue(booth, 'missing', 'parties', 'votes'), null);
  assert.equal(voteShare(0, 0), null); assert.equal(voteShare(0,100), 0);
});
test('booth filters handle macrons, reporting state, unavailable rows and numeric sorts', () => {
  const rows = [
    {file:'a', name:'Ōtāhuhu', reported:true, candidateVotes:100, candidates:[{id:'1', votes:10}]},
    {file:'b', name:'Other', reported:false, candidateVotes:0, candidates:[{id:'1',votes:0}]},
    {file:'c', name:'Failed', unavailable:true},
  ];
  const options = { search:'', status:'all', sortKey:'1', direction:-1, voteType:'candidates', metric:'votes' };
  assert.deepEqual(filterBooths(rows, options).map(r=>r.file), ['a','b','c']);
  assert.equal(filterBooths(rows, {...options, search:'otahuhu'})[0].file, 'a');
  assert.deepEqual(filterBooths(rows, {...options, status:'waiting'}).map(r=>r.file), ['b']);
  assert.deepEqual(filterBooths(rows, {...options, status:'reported'}).map(r=>r.file), ['a']);
});
