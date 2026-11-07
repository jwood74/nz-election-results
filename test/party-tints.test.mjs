import test from 'node:test';
import assert from 'node:assert/strict';
import { partyTintClass } from '../public/model.js';

test('party tints map the five requested stable feed IDs', () => {
  for (const [id, colour] of [['13','lab'],['16','nat'],['10','grn'],['5','act'],['17','nzf']]) {
    assert.equal(partyTintClass(id), `party-tint tint-${colour}`);
  }
});

test('other parties and absent affiliations have no tint', () => {
  for (const id of ['14', '24', '0', 'independent', 'constructor', 'toString', undefined, null, '']) assert.equal(partyTintClass(id), '');
});
