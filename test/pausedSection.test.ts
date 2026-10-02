import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitPaused, pausedLast } from '../public/js/utils/pausedSection.js';
import type { SavedProduct } from '../src/types.ts';

function saved(id: string, productGroup: string | null, paused?: boolean): SavedProduct {
  const [store, storeProductId] = id.split('-');
  return {
    id, store: store as SavedProduct['store'], storeProductId, title: id, brand: '', salesUnitSize: '',
    mainCategory: '', subCategory: '', imageUrl: '', addedAt: '2026-10-02T00:00:00.000Z',
    productGroup, ...(paused === undefined ? {} : { paused }),
  };
}

const ids = (products: SavedProduct[]) => products.map(p => p.id);

test('a group with an unpaused member stays above, whole', () => {
  const products = [saved('ah-1', 'zon', true), saved('ah-2', 'zon')];
  const { above, paused } = splitPaused(products);
  assert.deepEqual(ids(above), ['ah-1', 'ah-2']);
  assert.deepEqual(ids(paused), []);
});

test('a group whose members are all paused goes to Gepauzeerd', () => {
  const products = [saved('ah-1', 'zon', true), saved('ah-2', 'koffie'), saved('ah-3', 'zon', true)];
  const { above, paused } = splitPaused(products);
  assert.deepEqual(ids(above), ['ah-2']);
  assert.deepEqual(ids(paused), ['ah-1', 'ah-3']);
});

test('a paused product without a group always goes to Gepauzeerd', () => {
  // "Niet gecategoriseerd" is not a product group: an unpaused neighbour keeps nothing above
  const products = [saved('ah-1', null, true), saved('ah-2', null), saved('ah-3', '', true)];
  const { above, paused } = splitPaused(products);
  assert.deepEqual(ids(above), ['ah-2']);
  assert.deepEqual(ids(paused), ['ah-1', 'ah-3']);
});

test('only the products the store filter shows decide whether a group stays above', () => {
  const all = [saved('ah-1', 'zon', true), saved('etos-2', 'zon')];
  const ahOnly = all.filter(p => p.store === 'ah');
  assert.deepEqual(ids(splitPaused(all).paused), []);
  assert.deepEqual(ids(splitPaused(ahOnly).paused), ['ah-1']);
});

test('pausedLast puts paused members after the unpaused ones, each kept in order', () => {
  // Given in unit-price order, cheapest first
  const members = [saved('ah-1', 'zon', true), saved('ah-2', 'zon'), saved('ah-3', 'zon', true), saved('ah-4', 'zon', false)];
  assert.deepEqual(ids(pausedLast(members)), ['ah-2', 'ah-4', 'ah-1', 'ah-3']);
  assert.deepEqual(ids(members), ['ah-1', 'ah-2', 'ah-3', 'ah-4'], 'the input is left as it is');
});
