import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseVenue, historicalVenueGroups, auditBoothMatches } from '../lib/booth-matching.mjs';

const record=(venue='St Mary’s Hall, 12 Queen Street',locality='Ōtāhuhu',category='election-day',key='1:party:5')=>({venue,locality,category,key,validVotes:100});
const old=(rows,id='1')=>({id,name:`Historic ${id}`,party:{rows}});
const current=(address,id='7')=>({vp_id:id,vp_e_no:'1',vp_address:address,vp_lat:'-36.8',vp_lon:'174.7'});

test('venue normalisation tolerates macrons/punctuation, preserves street numbers and room qualifiers',()=>{
  assert.equal(normaliseVenue('St Mary’s Hall, 12 Queen Street, Ōtāhuhu'),normaliseVenue("ST MARY'S HALL / 12 Queen Street / Otahuhu"));
  assert.notEqual(normaliseVenue('Hall, 12 Queen Street'),normaliseVenue('Hall, 21 Queen Street'));
  assert.notEqual(normaliseVenue('School, Room 1, 12 Queen Street'),normaliseVenue('School, Room 2, 12 Queen Street'));
  assert.equal(normaliseVenue('St John&#39;s Hall, 2 St Johns Street'),normaliseVenue("St John's Hall, 2 St Johns Street"));
  assert.equal(normaliseVenue('St John&amp;#x27;s Hall &amp; Centre'),normaliseVenue("St John's Hall & Centre"));
  assert.equal(normaliseVenue('Hall&nbsp;12 Road'),normaliseVenue('Hall 12 Road'));
});
test('venue grouping preserves historic electorate populations, Māori votes and advance/day records',()=>{
  const built=historicalVenueGroups([old([record(),record(undefined,undefined,'advance','1:party:6')]),old([record(undefined,undefined,'advance','2:party:8')],'2'),old([record(undefined,undefined,'advance','66:party:9')],'66')]);
  assert.equal(built.groups.length,1);assert.equal(built.groups[0].records.length,4);
  assert.equal(built.groups[0].records.filter(r=>r.electorateType==='maori').length,1);
  assert.equal(built.groups[0].records.filter(r=>r.category==='advance').length,3);
});
test('special/pooled/mobile historical records are not assigned to physical venues',()=>{
  const built=historicalVenueGroups([old([record(),record('Special Votes BEFORE Polling Day',null,'special-before'),record('Care Homes, Team 1','Taken in Test','advance')])]);
  assert.equal(built.groups.length,1);assert.equal(built.excludedPooledRecords,1);assert.equal(built.excludedMobileRecords,1);
});
test('unique exact-label candidates handle locality suffix/prefix without being approved',()=>{
  const result=auditBoothMatches([current("St Mary's Hall, 12 Queen Street, Otahuhu")],[old([record()])]);
  assert.equal(result.places[0].status,'exact-label-candidate');assert.equal(result.places[0].approval,'unreviewed');
  assert.equal(result.summary.approvedMatches,0);assert.equal(result.status,'audit-only-no-reconstructed-results');
  assert.equal(auditBoothMatches([current("Otahuhu, St Mary's Hall, 12 Queen Street")],[old([record()])]).places[0].status,'exact-label-candidate');
});
test('ambiguous bare addresses and multiple current IDs never become a one-to-one approved match',()=>{
  const ambiguous=auditBoothMatches([current('Community Hall, 12 Main Street')],[old([record('Community Hall, 12 Main Street','Town A'),record('Community Hall, 12 Main Street','Town B')])]);
  assert.equal(ambiguous.places[0].status,'ambiguous-exact-label');assert.equal(ambiguous.places[0].matches.length,2);
  const split=auditBoothMatches([current("St Mary's Hall, 12 Queen Street, Otahuhu",'1'),current("Otahuhu, St Mary's Hall, 12 Queen Street",'2')],[old([record()])]);
  assert.ok(split.places.every(p=>p.status==='current-split-or-duplicate'));assert.equal(split.summary['exact-label-candidate'],0);
});
test('fuzzy/abbreviated labels are only suggestions; differing numbered addresses are rejected',()=>{
  const suggested=auditBoothMatches([current("St Mary's Hall, 12 Queen St, Otahuhu")],[old([record()])]);
  assert.equal(suggested.places[0].status,'possible-label-candidates');assert.equal(suggested.places[0].matches[0].method,'token-similarity-review-only');
  const wrongAddress=auditBoothMatches([current("St Mary's Hall, 99 Queen St, Otahuhu")],[old([record()])]);
  assert.equal(wrongAddress.places[0].status,'unmatched');
});
test('mobile current records are excluded and duplicate metadata IDs fail closed',()=>{
  const result=auditBoothMatches([current('Mobile Team, Team 1, Taken in Test')],[old([record()])]);
  assert.equal(result.places[0].status,'mobile-or-pooled-excluded');
  assert.throws(()=>auditBoothMatches([current('A'),current('B')],[old([record()])]),/duplicate/);
  assert.equal(auditBoothMatches([current('Care Homes, South, Taken in Test')],[old([record()])]).places[0].status,'mobile-or-pooled-excluded');
});
test('generic school/road tokens and a shared street number do not suggest a distant unrelated venue',()=>{
  const result=auditBoothMatches([current('Okiwi School, 1 Mabey Road, Okiwi')],[old([record('Silverstream School, 1 Whitemans Road','Silverstream')])]);
  assert.equal(result.places[0].status,'unmatched');
});
test('coverage counts are place counts and statuses sum exactly to the metadata population',()=>{
  const result=auditBoothMatches([current("St Mary's Hall, 12 Queen Street, Otahuhu",'1'),current('Unrelated venue, 999 New Road','2'),current('Mobile Team 1','3')],[old([record()])]);
  assert.equal(result.summary.currentPlaces,3);assert.equal(result.hostElectorates[0].places,3);
  assert.equal(result.summary['exact-label-candidate']+result.summary.unmatched+result.summary['mobile-or-pooled-excluded'],3);
  assert.ok(result.limitations.some(s=>s.includes('not necessarily the electorate of the voters')));
});
