import { test } from 'node:test';
import assert from 'node:assert/strict';
import { savedProductDetailView } from '../public/js/utils/savedProductDetailView.js';
import { product } from './fakeStore.ts';
import { saved } from './savedProduct.ts';
import type { GroupHistoryEntry, PriceSnapshot } from '../src/types.ts';

const snapshot: PriceSnapshot = { date: '2026-10-01', currentPrice: 2, priceBeforeBonus: null, isBonus: false, bonusMechanism: '' };
const groupEntry: GroupHistoryEntry = {
  date: '2026-10-01', title: 'ah-1', store: 'ah', salesUnitSize: '', currentPrice: 2, priceBeforeBonus: null,
  isBonus: false, bonusMechanism: '', unitPrice: 2, standardUnit: 'stuk',
};

test('the detail shows the store\'s product, its histories and the saved fields from the answer', () => {
  const live = product('ah', '1', { title: 'Koffie', isBonus: true, currentPrice: 6, priceBeforeBonus: 8 });
  const answer = { saved: saved('ah-1', 'koffie', true), product: live, history: [snapshot], groupHistory: [groupEntry] };

  const view = savedProductDetailView(answer, saved('ah-1', null));
  assert.equal(view?.product, live);
  assert.equal(view?.showBonus, true);
  // The answer's saved fields, not the list's (which may lag)
  assert.equal(view?.saved, answer.saved);
  assert.deepEqual(view?.history, [snapshot]);
  assert.deepEqual(view?.groupHistory, [groupEntry]);
});

test('the bonus shows only when the store says it is on bonus now', () => {
  const live = product('ah', '1', { isBonus: false, currentPrice: 2 });
  const view = savedProductDetailView({ saved: saved('ah-1', null), product: live, history: [], groupHistory: [] }, null);
  assert.equal(view?.showBonus, false);
});

test('without the store\'s product the saved fields stand in, and the histories still show', () => {
  const answer = { saved: saved('dirk-5', 'pasta'), product: null, history: [snapshot], groupHistory: [groupEntry] };

  const view = savedProductDetailView(answer, null);
  assert.equal(view?.product, answer.saved);
  assert.equal(view?.showBonus, false);
  assert.deepEqual(view?.history, [snapshot]);
  assert.deepEqual(view?.groupHistory, [groupEntry]);
});

test('without an answer the list\'s saved product is shown, with no history', () => {
  const listed = saved('ah-1', 'koffie', true);

  const view = savedProductDetailView(null, listed);
  assert.equal(view?.product, listed);
  assert.equal(view?.saved, listed);
  assert.equal(view?.showBonus, false);
  assert.deepEqual(view?.history, []);
  assert.deepEqual(view?.groupHistory, []);
});

test('without an answer or a saved product in the list there is nothing to show', () => {
  assert.equal(savedProductDetailView(null, null), null);
});
