import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseVotingPlaceCsv, buildCurrentElectorateMappings, compileCsvHistory } from '../lib/import-history.mjs';
import { sha256 } from '../lib/history.mjs';
import { parseXml, list } from '../lib/feed.mjs';
import { electoratePartyHistory, partyVoteComparison } from '../public/model.js';

const encode = records => new TextEncoder().encode(records.map(row=>row.map(value=>/[",\n]/.test(String(value)) ? `"${String(value).replaceAll('"','""')}"` : String(value)).join(',')).join('\r\n'));
function fixture(contest='party', cancelled=false) {
  const type=contest==='party'?'Party':'Candidate';
  const choices=contest==='party'?['National Party','Labour Party']:['CANDIDATE, One','CANDIDATE, Two'];
  return [
    ['Party and Electorate Candidate Votes Recorded at each Voting Place'],
    [`Test seat 1${cancelled?'\n(Poll Cancelled)':''}`,`${type} Vote Details`],
    ['', '', ...choices,`Total Valid ${type} Votes`,`Informal ${type} Votes`],
    ['Advance Voting Places'],['Host electorate'],['Town','Test Hall, 1 Road',5,2,7,1],
    ['Voting Places'],['Town','Test Hall, 1 Road',3,4,7,1],
    ['', 'Special Votes ON Polling Day - Test seat',2,0,2,1],
    ['', 'Test seat Total',10,6,16,3],
    ['', `Valid ${type} Votes plus Informal ${type} Votes`,'',19],
    [`Electorate ${type} Valid Votes`,...(contest==='candidate'?['Party']:[])],
    ...choices.map((name,i)=>contest==='party'?[name,i===0?10:6,'0.00']:[name,i===0?'National Party':'Labour Party',i===0?10:6,'0.00']),
  ];
}
test('CSV parser handles quotes, multiline titles, host subheadings, categories and candidate affiliations',()=>{
  const party=parseVotingPlaceCsv(encode(fixture()),'1','party');
  assert.equal(party.totals.validVotes,16);assert.equal(party.rows.length,3);
  assert.equal(party.rows[0].venue,'Test Hall, 1 Road');assert.equal(party.rows[0].hostElectorateName,'Host electorate');
  assert.equal(party.rows[1].hostElectorateName,null);
  assert.deepEqual(Object.keys(party.categories),['advance','election-day','special-on']);
  assert.equal(party.categories.advance.validVotes,7);assert.equal(party.categories['special-on'].validVotes,2);
  const candidate=parseVotingPlaceCsv(encode(fixture('candidate',true)),'1','candidate');
  assert.equal(candidate.pollCancelled,true);assert.equal(candidate.name,'Test seat');
  assert.equal(candidate.choices[0].party,'National Party');
});
test('CSV parser fails closed on wrong IDs, contests, votes, totals, footers and categories',()=>{
  assert.throws(()=>parseVotingPlaceCsv(encode(fixture()),'2','party'));
  assert.throws(()=>parseVotingPlaceCsv(encode(fixture()),'1','candidate'));
  for(const change of [
    rows=>rows[5][2]='-1',rows=>rows[5][4]=8,rows=>rows[9][2]=11,
    rows=>rows[10][3]=20,rows=>rows[12][1]=99,
    rows=>rows[8][1]='Special Votes UNKNOWN - Test seat',
    rows=>rows.push(['National Party',10,'0.00']),
  ]){const rows=fixture();change(rows);assert.throws(()=>parseVotingPlaceCsv(encode(rows),'1','party'));}
});
test('boundary mappings distinguish a pure rename from redrawn/split electorates and ID changes',()=>{
  const historical=[{id:'9',name:'East Coast'},{id:'60',name:'Wellington Central'},{id:'19',name:'Kelston'},{id:'53',name:'Te Atatū'}];
  const current=[{id:'8',name:'East Cape'},{id:'59',name:'Wellington North'},{id:'11',name:'Glendene'},{id:'42',name:'Kelston'}];
  const review={unchangedCurrentNames:['East Cape'],related2023NamesForRenamedSeats:{'East Cape':['East Coast'],'Wellington North':['Wellington Central'],'Glendene':['Kelston','Te Atatū']}};
  const result=buildCurrentElectorateMappings(current,historical,review);
  assert.equal(result['8'].canCompare,true);assert.equal(result['8'].related2023[0].id,'9');
  assert.equal(result['59'].canCompare,false);assert.equal(result['11'].related2023.length,2);
  assert.equal(result['42'].canCompare,false); // Same name is not enough.
  assert.throws(()=>buildCurrentElectorateMappings(current,historical,{...review,unchangedCurrentNames:['Missing']}));
});

const root=new URL('../',import.meta.url), read=path=>readFile(new URL(path,root));
const [mappingBytes,reviewBytes,currentBytes,seatBytes]=await Promise.all([read('data/2023/mappings.json'),read('data/2023/source/boundary-review.json'),read('data/2023/source/current-electorates.xml'),read('data/2023/source/seat-baseline.json')]);
const files=new Map(await Promise.all(Array.from({length:72},(_,i)=>['party','candidate'].map(async contest=>{
  const name=`${contest}-votes-by-voting-place-${i+1}.csv`;return [name,await read(`data/2023/raw/${name}`)];
})).flat()));
const current=list(parseXml(currentBytes.toString()).electorates.electorate).map(e=>({id:String(e.e_no),name:e.electorate_name}));
const hashes={mappingsSha256:sha256(mappingBytes),boundaryReviewSha256:sha256(reviewBytes),currentElectoratesSha256:sha256(currentBytes),seatBaselineSha256:sha256(seatBytes)};
const compiled=compileCsvHistory(files,JSON.parse(mappingBytes),current,JSON.parse(reviewBytes),hashes,JSON.parse(seatBytes));
test('all 144 originals reconcile; generated national/index/electorate files reproduce byte-for-byte',async()=>{
  assert.equal(compiled.historical.length,72);assert.equal(compiled.national.totalValidVotes,2851211);
  assert.equal(JSON.parse(compiled.manifestText).files.length,144);
  assert.equal(await readFile(new URL('data/2023/source/csv-manifest.json',root),'utf8'),compiled.manifestText);
  assert.equal(await readFile(new URL('public/data/2023/national.json',root),'utf8'),`${JSON.stringify(compiled.national,null,2)}\n`);
  assert.equal(await readFile(new URL('public/data/2023/index.json',root),'utf8'),`${JSON.stringify(compiled.index,null,2)}\n`);
  for(const item of compiled.historical)assert.equal(await readFile(new URL(`public/data/2023/electorates/${item.id}.json`,root),'utf8'),`${JSON.stringify(item)}\n`);
  assert.equal(Object.values(compiled.index.currentElectorates).filter(e=>e.canCompare).length,19);
  const cats=compiled.national.categoryTotals;
  assert.equal(Object.values(cats).reduce((sum,c)=>sum+c.validVotes,0),2851211);
  for(const category of ['advance','election-day','special-before','special-on','overseas-special','overseas-party-only','suppressed-ordinary','party-only-unspecified'])assert.ok(cats[category]);
});
test('Port Waikato cancellation and Māori host groupings survive import without invented candidate results',()=>{
  const port=compiled.historical.find(e=>e.name==='Port Waikato');
  assert.equal(port.candidate.pollCancelled,true);assert.equal(port.candidate.totals.validVotes,0);assert.ok(port.party.totals.validVotes>0);
  const maori=compiled.historical.find(e=>e.name==='Hauraki-Waikato');
  assert.equal(maori.id,'66');assert.equal(compiled.index.currentElectorates['65'].related2023[0].id,'66');
  assert.ok(maori.party.rows.some(row=>row.hostElectorateName==='Hamilton East'));
});
test('unchanged-electorate party shares use exact original totals and explicit party mappings',()=>{
  const old=compiled.historical.find(e=>e.name==='East Coast');
  const history=electoratePartyHistory(old,compiled.index.partyMappings);
  const labour=history.parties.find(p=>p.currentId==='13');
  const result=partyVoteComparison({id:'13',votes:labour.votes},history.totalValidVotes,history);
  assert.equal(result.change,0);assert.equal(history.totalValidVotes,old.party.totals.validVotes);
  assert.deepEqual(partyVoteComparison({id:'24',votes:100},1000,history),{previousPercent:null,change:null});
});
test('incomplete source collections fail rather than silently producing partial national totals',()=>{
  const incomplete=new Map(files);incomplete.delete('party-votes-by-voting-place-72.csv');
  assert.throws(()=>compileCsvHistory(incomplete,JSON.parse(mappingBytes),current,JSON.parse(reviewBytes),hashes),/Missing original/);
});
