import test from 'node:test';
import assert from 'node:assert/strict';
import { coalitionBalance } from '../public/coalition-balance.js';

const party = (id, seats, abbreviation = id) => ({ id, seats, name: `Party ${id}`, abbreviation });
const fixture = () => [party('16',49,'NAT'),party('17',8,'NZF'),party('5',11,'ACT'),
  party('13',34,'LAB'),party('10',15,'GP'),party('14',6,'TPMAO'),party('24',0,'OPP')];

test('single seat line puts the requested blocs at opposite ends on an overhang-aware scale', () => {
  const data = coalitionBalance(fixture());
  assert.equal(data.parliament,123); assert.equal(data.majority,62);
  assert.deepEqual(data.blocs.map(b=>b.seats),[68,55]);
  assert.deepEqual(data.blocs.map(b=>b.needed),[0,7]);
  assert.deepEqual(data.segments.map(p=>p.id),['16','17','5','14','10','13']);
  assert.ok(Math.abs(data.segments.reduce((sum,p)=>sum+p.percent,0)-100)<1e-8);
  assert.equal(data.segments.some(p=>p.id==='24'),false);
});
test('Opportunity is included with Labour, unknown parties stay neutral in the middle', () => {
  const data = coalitionBalance([party('16',40),party('5',10),party('17',10),party('13',35),party('10',10),party('14',4),party('24',5),party('other',6,'NAT')]);
  assert.deepEqual(data.blocs.map(b=>b.seats),[60,54]);
  assert.equal(data.others[0].seats,6);
  assert.equal(data.segments.find(p=>p.id==='other').colour,'other');
  assert.deepEqual(data.segments.map(p=>p.id),['16','17','5','other','24','14','10','13']);
});
test('incomplete allocations leave a proportional neutral unallocated segment, not an inflated bloc', () => {
  const data = coalitionBalance([party('16',20),party('13',10)]);
  assert.equal(data.parliament,120); assert.equal(data.majority,61);
  assert.equal(data.unallocated,90);
  assert.deepEqual(data.blocs.map(b=>b.needed),[41,51]);
  assert.deepEqual(data.segments.map(p=>p.id),['16','unallocated','13']);
  assert.equal(data.segments[1].percent,75);
});
test('all-zero or unavailable allocations show no fabricated balance', () => {
  assert.equal(coalitionBalance([]),null);
  assert.equal(coalitionBalance([party('16',0),party('13',0)]),null);
  assert.equal(coalitionBalance(undefined),null);
});
test('duplicate IDs, missing seats, fractional and negative counts fail closed', () => {
  for (const parties of [[party('16',-1)],[party('16',1.5)],[party('16',NaN)],[{id:'16'}],[party('16',10),party('16',10)]]) assert.equal(coalitionBalance(parties),null);
});
test('an even split never claims a majority and reaching the threshold needs no more seats', () => {
  let data = coalitionBalance([party('16',60),party('13',60)]);
  assert.deepEqual(data.blocs.map(b=>b.needed),[1,1]);
  data = coalitionBalance([party('16',61),party('13',59)]);
  assert.deepEqual(data.blocs.map(b=>b.needed),[0,2]);
});
test('membership uses stable feed IDs, not source order, party names or abbreviations', () => {
  const source=fixture(),copy=structuredClone(source);
  assert.deepEqual(coalitionBalance([...source].reverse()).blocs.map(b=>b.seats),[68,55]);
  assert.deepEqual(source,copy);
  assert.equal(coalitionBalance([party('unknown',120,'LAB')]).blocs[1].seats,0);
});
