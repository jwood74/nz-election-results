import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {auditBoothMatches} from '../lib/booth-matching.mjs';
import {backtestBoothMatching,boothReviewQueue} from '../lib/booth-backtest.mjs';

const row=(key,venue,category,votes)=>({key,venue,locality:'Town',category,votes,validVotes:votes.reduce((a,b)=>a+b,0)});
const old=(id,name,rows,choices=[{name:'P'},{name:'Q'}])=>({id,name,party:{choices,rows}});
function fixture() {
  const electorates=[old('1','Old One',[
    row('1:a','Alpha Hall, 1 Main Road','advance',[60,40]),
    row('1:b','Alpha Hall, 1 Main Road','election-day',[40,60]),
    row('1:c','Beta Hall, 2 Queen Road','advance',[0,100]),
    row('1:s','Special Votes ON Polling Day - Old One','special-on',[1000,0]),
  ]),old('2','Old Two',[row('2:a','Alpha Hall, 1 Main Road','advance',[10,90])],[{name:'Q'},{name:'P'}]),
  old('66','Māori seat',[row('66:a','Alpha Hall, 1 Main Road','advance',[20,0])])];
  const audit=auditBoothMatches([
    {vp_id:'a',vp_e_no:'1',vp_address:'Alpha Hall, 1 Main Road, Town'},
    {vp_id:'b',vp_e_no:'1',vp_address:'Beta Hall, Annex, 2 Queen Road, Town'},
  ],electorates);
  const index={currentElectorates:{'1':{id:'1',name:'Current One',canCompare:true,boundaryStatus:'unchanged',related2023:[{id:'1',name:'Old One'}]},
    '65':{id:'65',name:'Māori seat',canCompare:true,boundaryStatus:'unchanged',related2023:[{id:'66',name:'Māori seat'}]},
    '2':{id:'2',name:'Changed seat',canCompare:false,boundaryStatus:'changed-or-reconfigured',related2023:[{id:'2',name:'Old Two'}]}}};
  const review={currentPlaceId:'b',historicalVenueId:audit.historicalVenues.find(g=>g.venue.startsWith('Beta')).id,basis:'Same named hall and street address; current label adds Annex. Label review only.'};
  return {electorates,audit,index,review};
}
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);

test('known-population cohort exposes missing-venue bias without adding special or foreign votes',()=>{
  const {audit,electorates,index}=fixture(),report=backtestBoothMatching(audit,electorates,index);
  const c=report.seats[0].categories['ordinary-combined'].knownPopulationCohort;
  assert.equal(c.referenceVotes,300);assert.equal(c.sampleVotes,200);close(c.coveragePercent,200/3);
  close(c.parties.find(p=>p.name==='P').referenceShare,100/3);assert.equal(c.parties.find(p=>p.name==='P').sampleShare,50);
  close(c.maxAbsPartyErrorPp,50-100/3);assert.equal(report.seats.length,2);
  assert.equal(report.status,'research-backtest-not-production-validation');
  assert.ok(!report.seats.some(s=>s.id==='2'));
});
test('advance/day denominators remain separate; pooled suppressed ordinary votes remain in combined reference',()=>{
  const {audit,electorates,index}=fixture();
  electorates[0].party.rows.push(row('1:small','Voting places where less than 6 votes were taken','suppressed-ordinary',[0,5]));
  const c=backtestBoothMatching(audit,electorates,index).seats[0].categories;
  assert.equal(c.advance.knownPopulationCohort.referenceVotes,200);assert.equal(c.advance.knownPopulationCohort.sampleVotes,100);
  assert.equal(c['election-day'].knownPopulationCohort.referenceVotes,100);assert.equal(c['election-day'].knownPopulationCohort.coveragePercent,100);
  assert.equal(c['ordinary-combined'].knownPopulationCohort.referenceVotes,305);
});
test('host-location proxy reports imported populations, uses names not column positions and never mixes Māori/general rolls',()=>{
  const {audit,electorates,index}=fixture(),report=backtestBoothMatching(audit,electorates,index);
  const proxy=report.seats[0].categories['ordinary-combined'].hostLocationProxy;
  assert.equal(proxy.sampleVotes,300);assert.equal(proxy.ownElectorateVotes,200);assert.equal(proxy.otherElectorateVotes,100);
  close(proxy.otherElectorateSharePercent,100/3);assert.equal(proxy.parties.find(p=>p.name==='P').sampleVotes,190);
  assert.equal(proxy.proxyToReferenceVoteMassPercent,100); // Matching total mass does not mean matching populations.
  const maori=report.seats[1].categories['ordinary-combined'];
  assert.equal(maori.knownPopulationCohort.coveragePercent,100);assert.equal(maori.hostLocationProxy.status,'unavailable');
  assert.equal(maori.hostLocationProxy.maxAbsPartyErrorPp,null);
});
test('explicit label-only reviews are a separate sensitivity scenario; no suggestion auto-accepts',()=>{
  const {audit,electorates,index,review}=fixture();
  const before=backtestBoothMatching(audit,electorates,index),after=backtestBoothMatching(audit,electorates,index,[review]);
  assert.equal(before.summary.reviewedVenueLabelsUsed,0);assert.equal(after.summary.reviewedVenueLabelsUsed,1);
  assert.equal(after.seats[0].categories['ordinary-combined'].knownPopulationCohort.coveragePercent,100);
  assert.equal(after.seats[0].categories['ordinary-combined'].knownPopulationCohort.maxAbsPartyErrorPp,0);
  close(after.seats[0].categories['ordinary-combined'].hostLocationProxy.proxyToReferenceVoteMassPercent,400/3);
  assert.equal(audit.places.find(p=>p.id==='b').approval,'unreviewed');
  assert.throws(()=>backtestBoothMatching(audit,electorates,index,[{...review,currentPlaceId:'missing'}]),/unknown current/);
  assert.throws(()=>backtestBoothMatching(audit,electorates,index,[review,review]),/duplicate/);
});
test('empty cohorts mean unavailable accuracy, not a perfect score or fabricated losses',()=>{
  const {audit,electorates,index}=fixture();audit.places.forEach(p=>p.status='unmatched');
  const c=backtestBoothMatching(audit,electorates,index).seats[0].categories['ordinary-combined'];
  assert.equal(c.knownPopulationCohort.coveragePercent,0);assert.equal(c.knownPopulationCohort.maxAbsPartyErrorPp,null);
  assert.ok(c.knownPopulationCohort.parties.every(p=>p.errorPp===null));
  assert.equal(c.hostLocationProxy.status,'unavailable');
});
test('duplicate assignments, source mismatches, invalid counts and unverified boundaries fail closed',()=>{
  for(const edit of [
    f=>f.audit.historicalVenues.find(g=>g.venue.startsWith('Alpha')).records[0].validVotes++,
    f=>f.audit.places.push({...f.audit.places[0],id:'duplicate'}),
    f=>f.audit.places.push({...f.audit.places[0]}),
    f=>f.electorates[0].party.rows[0].votes[0]=-1,
    f=>f.index.currentElectorates['1'].boundaryStatus='changed-or-reconfigured',
    f=>f.index.currentElectorates['1'].related2023.push({id:'2',name:'Old Two'}),
  ]){const f=fixture();edit(f);assert.throws(()=>backtestBoothMatching(f.audit,f.electorates,f.index));}
});
test('review priority uses missing historical vote volume and excludes already-used current labels/venues',()=>{
  const {audit,index,review}=fixture();
  const queue=boothReviewQueue(audit,index);
  assert.equal(queue.length,1);assert.equal(queue[0].historicalOrdinaryVotesInUnchangedSeats,100);
  assert.equal(queue[0].currentCandidates[0].currentPlaceId,'b');
  assert.equal(boothReviewQueue(audit,index,[review]).length,0);
});
test('saved real-world backtest reproduces its exact-only and explicitly reviewed scenarios',async()=>{
  const root=new URL('../',import.meta.url),read=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));
  const [audit,index,stored,reviews]=await Promise.all([read('data/booth-matching/report.json'),read('public/data/2023/index.json'),read('data/booth-matching/backtest.json'),read('data/booth-matching/venue-label-reviews.json')]);
  const electorates=await Promise.all(Array.from({length:72},(_,i)=>read(`public/data/2023/electorates/${i+1}.json`)));
  const exact=backtestBoothMatching(audit,electorates,index),reviewed=backtestBoothMatching(audit,electorates,index,reviews.matches);
  assert.deepEqual(stored.summary,exact.summary);assert.deepEqual(stored.seats,exact.seats);
  assert.deepEqual(stored.reviewedLabelScenario,reviewed);
  assert.equal(exact.seats.length,19);assert.equal(reviewed.summary.reviewedVenueLabelsUsed,9);
});
