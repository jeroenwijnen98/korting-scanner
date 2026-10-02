import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupPauseAction } from '../public/js/utils/groupPause.js';
import type { SavedProduct } from '../src/types.ts';

function saved(id: string, productGroup: string | null, paused?: boolean): SavedProduct {
  const [store, storeProductId] = id.split('-');
  return {
    id, store: store as SavedProduct['store'], storeProductId, title: id, brand: '', salesUnitSize: '',
    mainCategory: '', subCategory: '', imageUrl: '', addedAt: '2026-10-02T00:00:00.000Z',
    productGroup, ...(paused === undefined ? {} : { paused }),
  };
}

test('any member unpaused: pause the ones not paused yet', () => {
  const products = [saved('ah-1', 'zon', true), saved('etos-2', 'zon'), saved('kruidvat-3', 'zon', false)];
  assert.deepEqual(groupPauseAction(products, 'zon'), { paused: true, ids: ['etos-2', 'kruidvat-3'] });
});

test('all members paused: resume them all', () => {
  const products = [saved('ah-1', 'zon', true), saved('etos-2', 'zon', true)];
  assert.deepEqual(groupPauseAction(products, 'zon'), { paused: false, ids: ['ah-1', 'etos-2'] });
});

test('members from every store count, other groups and ungrouped do not', () => {
  // A store filter on AH would show only ah-1; the Etos member still decides the label
  const products = [
    saved('ah-1', 'zon', true), saved('etos-2', 'zon'),
    saved('ah-4', 'koffie'), saved('ah-5', null),
  ];
  assert.deepEqual(groupPauseAction(products, 'zon'), { paused: true, ids: ['etos-2'] });
});

test('a product added to a fully paused group is unpaused, so the group pauses again', () => {
  const products = [saved('ah-1', 'zon', true), saved('etos-2', 'zon', true), saved('kruidvat-3', 'zon')];
  assert.deepEqual(groupPauseAction(products, 'zon'), { paused: true, ids: ['kruidvat-3'] });
});
