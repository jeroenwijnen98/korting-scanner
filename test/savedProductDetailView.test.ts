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
  const answer = { saved: saved('ah-1', 'koffie', true), check: { status: 'observed' } as const, product: live, history: [snapshot], groupHistory: [groupEntry] };

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
  const view = savedProductDetailView({ saved: saved('ah-1', null), check: { status: 'observed' }, product: live, history: [], groupHistory: [] }, null);
  assert.equal(view?.showBonus, false);
});

test('an observed product has no notice', () => {
  const live = product('ah', '1');
  const view = savedProductDetailView({ saved: saved('ah-1', null), check: { status: 'observed' }, product: live, history: [], groupHistory: [] }, null);
  assert.equal(view?.notice, null);
});

const unobserved = [
  { name: 'a store that is down', check: { status: 'storeDown', store: 'dirk' }, notice: { kind: 'storeDown', text: 'Dirk is niet bereikbaar' } },
  { name: 'a product that is gone', check: { status: 'gone' }, notice: { kind: 'gone', text: 'Niet meer beschikbaar' } },
] as const;

for (const c of unobserved) {
  test(`${c.name}: the saved fields stand in, the histories still show, and a notice says why`, () => {
    const answer = { saved: saved('dirk-5', 'pasta'), check: c.check, product: null, history: [snapshot], groupHistory: [groupEntry] };

    const view = savedProductDetailView(answer, null);
    assert.equal(view?.product, answer.saved);
    assert.equal(view?.saved, answer.saved);
    assert.equal(view?.showBonus, false);
    assert.deepEqual(view?.history, [snapshot]);
    assert.deepEqual(view?.groupHistory, [groupEntry]);
    assert.deepEqual(view?.notice, c.notice);
  });
}

test('without an answer the list\'s saved product is shown, with no history', () => {
  const listed = saved('ah-1', 'koffie', true);

  const view = savedProductDetailView(null, listed);
  assert.equal(view?.product, listed);
  assert.equal(view?.saved, listed);
  assert.equal(view?.showBonus, false);
  assert.deepEqual(view?.history, []);
  assert.deepEqual(view?.groupHistory, []);
  // A failed request says nothing about the store
  assert.equal(view?.notice, null);
});

test('without an answer or a saved product in the list there is nothing to show', () => {
  assert.equal(savedProductDetailView(null, null), null);
});
