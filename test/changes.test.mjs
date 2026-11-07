import test from 'node:test';
import assert from 'node:assert/strict';
import { createChangeTracker, nationalSignature, electorateSignature, boothSignature, filterRaces } from '../public/model.js';

test('national changes have no first-load highlights, ignore timestamps and support corrections', () => {
  const track = createChangeTracker(nationalSignature);
  const row = { id:'16', votes:100, seats:50, listSeats:30, electorateSeats:20 };
  assert.equal(track([row]).size, 0);
  assert.equal(track([{...row,updated:'later'}]).size, 0);
  const correction = {...row,votes:95};
  assert.equal(track([correction]).get('16').votes, 100);
  assert.equal(track([{...correction,seats:51}]).get('16').seats, 50);
  assert.equal(track([{...correction,seats:51}]).size, 0);
});
test('missing, stale and unavailable rows do not reset the last-good baseline', () => {
  const track=createChangeTracker(row=>row.votes);
  track([{id:'1',votes:100}]);
  assert.equal(track([{id:'1',unavailable:true}]).size,0);
  assert.equal(track([{id:'1',votes:90,stale:true}]).size,0);
  track([]);
  assert.equal(track([{id:'1',votes:110}]).get('1').votes,100);
  assert.equal(track([{id:'new',votes:99}]).size,0);
});
test('electorate changes ignore array order and timestamps, detect votes and progress', () => {
  const track=createChangeTracker(electorateSignature);
  const row={id:'1',candidates:[{id:'a',votes:10},{id:'b',votes:5}],placesCounted:1,placesTotal:10,percentPlacesCounted:10};
  track([row]);
  assert.equal(track([{...row,updated:'later',candidates:[...row.candidates].reverse()}]).size,0);
  assert.equal(track([{...row,placesCounted:2}]).size,1);
  assert.equal(track([{...row,candidates:[{id:'a',votes:11},{id:'b',votes:5}],placesCounted:2}]).size,1);
});
test('booth tracker keys by result file and compares both contests, informals and receipt status', () => {
  const track=createChangeTracker(boothSignature,'file');
  const row={file:'01-01001.xml',candidates:[{id:'a',votes:0}],parties:[{id:'p',votes:0}],reported:false,issued:0,candidateInformals:0,partyInformals:0};
  track([row]);
  assert.equal(track([{...row,updated:'later'}]).size,0);
  assert.equal(track([{...row,reported:true}]).size,1);
  assert.equal(track([{...row,reported:true,partyInformals:1}]).size,1);
  assert.equal(track([{...row,reported:true,partyInformals:1,parties:[{id:'p',votes:10}]}]).size,1);
});
test('Last Updated sorts actual instants, invalid/missing last in both directions', () => {
  const rows=[
    {id:'1',name:'Old',updated:'2026-11-07T20:00:00'},
    {id:'2',name:'Latest',updated:'2026-11-07T07:30:00Z'},
    {id:'3',name:'No timestamp'},
    {id:'4',name:'Bad timestamp',updated:'invalid'},
    {id:'5',name:'Equal',updated:'2026-11-07T20:00:00'},
  ];
  const options={view:'all',search:'',watchlist:new Set(),sortKey:'updated',direction:-1};
  assert.deepEqual(filterRaces(rows,options).map(r=>r.id),['2','5','1','4','3']);
  assert.deepEqual(filterRaces(rows,{...options,direction:1}).map(r=>r.id),['5','1','2','4','3']);
});
