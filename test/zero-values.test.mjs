import test from 'node:test';
import assert from 'node:assert/strict';
import { isZeroValue } from '../public/ui.js';

test('recognises displayed zeros in counts and percentages', () => {
  for (const value of [0, '0', '0.0', '0.0%', '0%', '+0.0%', '−0.0%', '-0.0%']) {
    assert.equal(isZeroValue(value), true, String(value));
  }
});

test('non-zero, missing and descriptive values are not muted', () => {
  for (const value of [null, undefined, '', '—', 10, '0.1%', '−1.0%', '2023', '0 / 10 places', 'Party 0']) {
    assert.equal(isZeroValue(value), false, String(value));
  }
});
