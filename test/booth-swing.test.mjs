import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { boothEstimate, matchedBoothSwing } from '../public/booth-swing.js';

const entry = (id, p, q) => ({ currentAddress: `Hall ${id}`, historicalVenueId: `venue-${id}`, totalValidVotes: p + q,
  categories: { advance: { totalValidVotes: p + q, votes: { p, q } } } });
const baseline = () => ({ status: 'estimated-matched-booth-baseline', mappedPartyIds: ['p', 'q'],
  booths: { a: entry('a', 60, 40), b: entry('b', 0, 900) } });
const booth = (id, p, q, extra = {}) => ({ id, file: `${id}.xml`, name: `Hall ${id}`, reported: true,
  partyVotes: p + q, parties: [{ id: 'p', votes: p }, { id: 'q', votes: q }], ...extra });
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-8, `${a} != ${b}`);

test('unmatched current votes affect headline totals but never matched-booth swing', () => {
  const rows = [booth('a', 70, 30), booth('unmatched', 0, 900)];
  const result = matchedBoothSwing(rows, baseline());
  close(rows.reduce((sum,b) => sum + b.parties[0].votes, 0) / rows.reduce((sum,b) => sum + b.partyVotes, 0) * 100, 7);
  assert.equal(result.matchedBooths, 1); assert.equal(result.reportedBooths, 2);
  assert.equal(result.currentVotes, 100); assert.equal(result.previousVotes, 100);
  assert.equal(result.coveragePercent, 10);
  assert.deepEqual(result.comparisons.get('p'), { previousPercent: 60, currentPercent: 70, change: 10 });
});
test('only reporting matched booths enter BOTH denominators; weighting uses vote totals not booth averages', () => {
  const data = baseline();
  let result = matchedBoothSwing([booth('a',70,30), booth('b',0,0,{ reported: false })], data);
  assert.equal(result.previousVotes,100);
  result = matchedBoothSwing([booth('a',70,30), booth('b',20,180)], data);
  assert.equal(result.previousVotes,1000); assert.equal(result.currentVotes,300);
  close(result.comparisons.get('p').previousPercent,6);
  close(result.comparisons.get('p').currentPercent,30);
  close(result.comparisons.get('p').change,24);
});
test('zero, stale, failed and invalid results do not fabricate swing', () => {
  for (const extra of [{ stale: true }, { unavailable: true }, { reported: false }, { partyVotes: 0 }, { partyVotes: 999 }, { parties: [{id:'p',votes:-1}] }]) {
    assert.equal(matchedBoothSwing([booth('a',70,30,extra)],baseline()).comparisons.size,0);
  }
  assert.equal(matchedBoothSwing([booth('a',70,30)],undefined).comparisons.size,0);
});
test('ID reuse, duplicate files and duplicate historical venues never duplicate the reference', () => {
  const data = baseline();
  assert.equal(boothEstimate(booth('a',70,30,{name:'Different address'}),data),null);
  assert.equal(matchedBoothSwing([booth('a',70,30),booth('a',70,30)],data).matchedBooths,1);
  data.booths.b.historicalVenueId = data.booths.a.historicalVenueId;
  assert.equal(matchedBoothSwing([booth('a',70,30),booth('b',10,90)],data).matchedBooths,1);
});
test('absent current parties are not assumed zero; unmapped parties have no swing', () => {
  const result = matchedBoothSwing([booth('a',70,30,{parties:[{id:'p',votes:70},{id:'new',votes:30}]})],baseline());
  assert.equal(result.comparisons.get('q').change,null);
  assert.equal(result.comparisons.has('new'),false);
  assert.equal(result.comparisons.get('p').change,10);
});
test('both historical categories are included, with unmapped votes retained in the denominator', () => {
  const data = baseline();
  data.booths.a.categories['election-day'] = { totalValidVotes: 100, votes: {p:20,q:30} };
  data.booths.a.totalValidVotes = 200;
  const result = matchedBoothSwing([booth('a',70,30)],data);
  assert.equal(result.comparisons.get('p').previousPercent,40);
  assert.equal(result.comparisons.get('p').change,30);
});
test('published baselines reproduce offline without modifying original historical datasets', () => {
  execFileSync(process.execPath,['scripts/build-booth-estimates.mjs','--check'],{cwd:new URL('../',import.meta.url)});
});
test('real estimates preserve historic electorate membership and separate categories', async () => {
  const read = async path => JSON.parse(await readFile(new URL(`../${path}`,import.meta.url),'utf8'));
  const [index,audit] = await Promise.all([read('public/data/2023/index.json'),read('data/booth-matching/report.json')]);
  const groups = new Map(audit.historicalVenues.map(g => [g.id,g]));
  for (const mapping of Object.values(index.currentElectorates)) {
    const data = await read(`public/data/2023/booth-estimates/${mapping.id}.json`);
    assert.equal(data.electorateId,mapping.id);
    const related = new Set(mapping.related2023.map(e=>e.id));
    const seen = new Set();
    for (const estimate of Object.values(data.booths)) {
      assert.ok(!seen.has(estimate.historicalVenueId));seen.add(estimate.historicalVenueId);
      assert.ok(estimate.historicalElectorateIds.every(id=>related.has(id)));
      const records = groups.get(estimate.historicalVenueId).records.filter(r=>related.has(r.electorateId));
      assert.equal(estimate.totalValidVotes,records.reduce((sum,r)=>sum+r.validVotes,0));
      for (const [category, counts] of Object.entries(estimate.categories)) {
        assert.ok(['advance','election-day'].includes(category));
        assert.equal(counts.totalValidVotes,records.filter(r=>r.category===category).reduce((sum,r)=>sum+r.validVotes,0));
      }
    }
  }
});
