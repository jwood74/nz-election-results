import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { applySeatBaseline } from '../lib/history.mjs';
import { seatChange } from '../public/model.js';

const baseline=JSON.parse(await readFile(new URL('../data/2023/source/seat-baseline.json',import.meta.url),'utf8'));
const history=JSON.parse(await readFile(new URL('../public/data/2023/national.json',import.meta.url),'utf8'));
test('seat baseline is the completed 123-seat 2023 Parliament, not the 122-seat October result',()=>{
  assert.equal(baseline.totalSeats,123);assert.equal(baseline.parties.reduce((sum,p)=>sum+p.seats,0),123);
  assert.equal(history.parties.find(p=>p.currentId==='16').seats2023,49);
  assert.equal(history.parties.find(p=>p.currentId==='13').seats2023,34);
  assert.equal(history.parties.find(p=>p.currentId==='10').seats2023,15);
  assert.match(history.seatComparison.label,/Port Waikato/);
});
test('seat deltas handle gains, losses, unchanged and loss of all seats',()=>{
  assert.deepEqual(seatChange({id:'16',seats:52},120,history),{previous:49,change:3});
  assert.deepEqual(seatChange({id:'13',seats:30},120,history),{previous:34,change:-4});
  assert.deepEqual(seatChange({id:'10',seats:15},120,history),{previous:15,change:0});
  assert.deepEqual(seatChange({id:'17',seats:0},120,history),{previous:8,change:-8});
  assert.deepEqual(seatChange({id:'36',seats:1},120,history),{previous:0,change:1});
});
test('zeroed or missing allocations and unverified party mappings never show misleading losses',()=>{
  assert.equal(seatChange({id:'16',seats:0},0,history),null);
  assert.equal(seatChange({id:'16',seats:null},120,history),null);
  assert.equal(seatChange({id:'16',seats:-1},120,history),null);
  assert.equal(seatChange({id:'24',seats:2},120,history),null);
  assert.equal(seatChange({id:'16',seats:50},120,null),null);
});
test('invalid historical seat totals, duplicate parties and unknown parties are rejected',()=>{
  assert.throws(()=>applySeatBaseline(history,{...baseline,totalSeats:122}));
  assert.throws(()=>applySeatBaseline(history,{...baseline,parties:[...baseline.parties,baseline.parties[0]]}));
  assert.throws(()=>applySeatBaseline(history,{...baseline,parties:[{name:'Unknown',seats:123}]}));
});
