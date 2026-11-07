import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildNationalHistory, sha256, historicalDownloads, fetchHistoricalCsv, validateHistoricalCsv } from '../lib/history.mjs';
import { partyVoteComparison } from '../public/model.js';
import { pp } from '../public/ui.js';

const sourceBytes = await readFile(new URL('../data/2023/source/national-indexed-table.json', import.meta.url));
const mappingBytes = await readFile(new URL('../data/2023/mappings.json', import.meta.url));
const source = JSON.parse(sourceBytes), mappings = JSON.parse(mappingBytes);
const hashes = { sourceSha256: sha256(sourceBytes), mappingsSha256: sha256(mappingBytes) };
const build = () => buildNationalHistory(source, mappings, hashes);

test('saved final national table reconciles exactly, preserves provenance and is reproducible', async () => {
  const data = build();
  assert.equal(data.totalValidVotes, 2851211); assert.equal(data.allParties.length, 17); assert.equal(data.parties.length, 9);
  assert.equal(data.parties.find(p => p.currentId === '16').votes, 1085851);
  assert.equal(data.parties.find(p => p.currentId === '13').votes, 767540);
  assert.match(data.source.method, /indexed/);
  assert.equal(data.coverage, 'official-final-including-special-votes');
  const generated = await readFile(new URL('../public/data/2023/national.json', import.meta.url), 'utf8');
  assert.equal(generated, `${JSON.stringify(data, null, 2)}\n`);
});
test('source builder rejects mismatched totals, invalid counts and duplicate parties/mappings', () => {
  assert.throws(() => buildNationalHistory({...source,totalValidVotes:source.totalValidVotes+1},mappings,hashes));
  assert.throws(() => buildNationalHistory({...source,parties:[...source.parties,{...source.parties[0]}]},mappings,hashes));
  assert.throws(() => buildNationalHistory({...source,parties:[{name:'Bad',votes:-1}]},mappings,hashes));
  assert.throws(() => buildNationalHistory(source,{...mappings,partyMappings:{'1':{name2023:'Missing',basis:'test'}}},hashes));
  assert.throws(() => buildNationalHistory(source,{...mappings,partyMappings:{'1':{name2023:'National Party',basis:'test'},'2':{name2023:'National Party',basis:'test'}}},hashes));
});
test('uncertain renames and alliance parties do not silently acquire historical shares', () => {
  const data=build();
  for(const id of ['20','66','24','34','52','68','69','71']) {
    assert.equal(data.parties.some(p=>p.currentId===id),false);
    assert.ok(data.unmappedCurrentParties[id]);
    assert.deepEqual(partyVoteComparison({id,votes:100},1000,data),{previousPercent:null,change:null});
  }
});
test('national comparison uses exact valid votes, percentage points and null on zero/missing data', () => {
  const data={totalValidVotes:1000,parties:[{currentId:'13',votes:269}]};
  const party={id:'13',votes:300};
  const comparison=partyVoteComparison(party,1000,data);
  assert.ok(Math.abs(comparison.previousPercent-26.9)<1e-10);
  assert.ok(Math.abs(comparison.change-3.1)<1e-10);
  assert.equal(pp(comparison.change),'+3.1 pp');
  assert.equal(pp(partyVoteComparison({...party,votes:200},1000,data).change),'−6.9 pp');
  assert.equal(partyVoteComparison({...party,votes:0},0,data).change,null);
  assert.equal(partyVoteComparison(party,1000,null).change,null);
  assert.equal(partyVoteComparison({...party,votes:1100},1000,data).change,null);
  assert.equal(partyVoteComparison({...party,votes:0},1000,data).change,-comparison.previousPercent);
  assert.equal(pp(-0.0001),'0.0 pp'); assert.equal(pp(null),'—');
});
test('download inventory contains the national export and 72 historical party booth CSVs', () => {
  const entries=historicalDownloads();
  assert.equal(entries.length,73); assert.equal(new Set(entries.map(e=>e.filename)).size,73);
  assert.ok(entries.every(e=>e.url.startsWith('https://archive.electionresults.govt.nz/electionresults_2023/statistics/csv/')));
  assert.equal(entries.at(-1).filename,'party-votes-by-voting-place-72.csv');
});
test('collector accepts CSV bytes unchanged and rejects access blocks and HTML challenges', async () => {
  const text='Party,Party Votes\r\n"Test party",123\r\n';
  const bytes=await fetchHistoricalCsv('https://example.test/results.csv',async()=>new Response(text));
  assert.equal(new TextDecoder().decode(bytes),text);
  await assert.rejects(fetchHistoricalCsv('https://example.test/results.csv',async()=>new Response('blocked',{status:403})),/HTTP 403/);
  await assert.rejects(fetchHistoricalCsv('https://example.test/results.csv',async()=>new Response('<html>Party,challenge\n</html>')),/recognised CSV/);
  assert.throws(()=>validateHistoricalCsv(new TextEncoder().encode('')));
  assert.throws(()=>validateHistoricalCsv(new Uint8Array([0xff,0xff])));
});
