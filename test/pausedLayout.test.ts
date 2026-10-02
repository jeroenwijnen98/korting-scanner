import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitPaused, sectionLayout } from '../public/js/utils/pausedLayout.js';
import { productCount } from '../public/js/utils/format.js';
import type { SavedProduct } from '../src/types.ts';
import { saved } from './savedProduct.ts';

const ids = (products: SavedProduct[]) => products.map(p => p.id);

test('a group with an unpaused member stays in the list, whole', () => {
  const products = [saved('ah-1', 'zon', true), saved('ah-2', 'zon')];
  const { listed, paused } = splitPaused(products);
  assert.deepEqual(ids(listed), ['ah-1', 'ah-2']);
  assert.deepEqual(ids(paused), []);
});

test('a group whose members are all paused goes to Gepauzeerd', () => {
  const products = [saved('ah-1', 'zon', true), saved('ah-2', 'koffie'), saved('ah-3', 'zon', true)];
  const { listed, paused } = splitPaused(products);
  assert.deepEqual(ids(listed), ['ah-2']);
  assert.deepEqual(ids(paused), ['ah-1', 'ah-3']);
});

test('a paused product without a group always goes to Gepauzeerd', () => {
  // "Niet gecategoriseerd" is not a product group: an unpaused neighbour keeps nothing listed
  const products = [saved('ah-1', null, true), saved('ah-2', null), saved('ah-3', '', true)];
  const { listed, paused } = splitPaused(products);
  assert.deepEqual(ids(listed), ['ah-2']);
  assert.deepEqual(ids(paused), ['ah-1', 'ah-3']);
});

test('only the products the store filter shows decide whether a group stays listed', () => {
  const all = [saved('ah-1', 'zon', true), saved('trekpleister-2', 'zon')];
  const ahOnly = all.filter(p => p.store === 'ah');
  assert.deepEqual(ids(splitPaused(all).paused), []);
  assert.deepEqual(ids(splitPaused(ahOnly).paused), ['ah-1']);
});

test('a mixed group hides its paused members behind a row until it is expanded', () => {
  // Given in unit-price order, cheapest first
  const members = [saved('ah-1', 'zon', true), saved('ah-2', 'zon'), saved('ah-3', 'zon', true), saved('ah-4', 'zon', false)];
  const collapsed = sectionLayout(members, false);
  assert.deepEqual(ids(collapsed.shown), ['ah-2', 'ah-4']);
  assert.equal(collapsed.rowLabel, '2 gepauzeerd');
  assert.deepEqual(ids(collapsed.underRow), []);
  assert.deepEqual(ids(members), ['ah-1', 'ah-2', 'ah-3', 'ah-4'], 'the input is left as it is');
});

test('an expanded mixed group shows its paused members under the row, in order', () => {
  const members = [saved('ah-1', 'zon', true), saved('ah-2', 'zon'), saved('ah-3', 'zon', true)];
  const expanded = sectionLayout(members, true);
  assert.deepEqual(ids(expanded.shown), ['ah-2']);
  assert.equal(expanded.rowLabel, '2 gepauzeerd');
  assert.deepEqual(ids(expanded.underRow), ['ah-1', 'ah-3']);
});

test('a mixed group counts its unpaused members, then its paused ones', () => {
  const members = [saved('ah-1', 'zon'), saved('ah-2', 'zon', true), saved('ah-3', 'zon')];
  assert.equal(sectionLayout(members, false).countLabel, '2 producten · 1 gepauzeerd');
});

test('a group without paused members, or with only paused members, has no row', () => {
  for (const expanded of [false, true]) {
    const unpaused = sectionLayout([saved('ah-1', 'zon'), saved('ah-2', 'zon', false)], expanded);
    assert.deepEqual(ids(unpaused.shown), ['ah-1', 'ah-2']);
    assert.equal(unpaused.rowLabel, null);
    assert.deepEqual(ids(unpaused.underRow), []);
    assert.equal(unpaused.countLabel, '2 producten');

    // Under Gepauzeerd every member is paused, and all of them show
    const allPaused = sectionLayout([saved('ah-1', 'zon', true)], expanded);
    assert.deepEqual(ids(allPaused.shown), ['ah-1']);
    assert.equal(allPaused.rowLabel, null);
    assert.deepEqual(ids(allPaused.underRow), []);
    assert.equal(allPaused.countLabel, '1 product');
  }
});

test('productCount says product or producten', () => {
  assert.equal(productCount(1), '1 product');
  assert.equal(productCount(0), '0 producten');
  assert.equal(productCount(3), '3 producten');
});
