import test from 'node:test';
import assert from 'node:assert/strict';
import { pp, changeClass } from '../public/ui.js';

test('vote-share changes show signed percentages with matching colours', () => {
  assert.equal(pp(2.5), '+2.5%');
  assert.equal(changeClass(2.5), 'change-positive');
  assert.equal(pp(-2.5), '−2.5%');
  assert.equal(changeClass(-2.5), 'change-negative');
});

test('zero, rounded-zero and missing changes remain neutral', () => {
  for (const value of [0, 0.01, -0.01]) {
    assert.equal(pp(value), '0.0%');
    assert.equal(changeClass(value), '');
  }
  for (const value of [null, undefined]) {
    assert.equal(pp(value), '—');
    assert.equal(changeClass(value), '');
  }
});
