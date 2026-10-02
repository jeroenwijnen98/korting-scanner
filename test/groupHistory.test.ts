import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cheapestPerDate } from '../src/services/groupHistory.ts';
import { savedProductId } from '../public/js/utils/savedProductId.js';
import type { PriceSnapshot, SavedProduct, StoreName } from '../src/types.ts';

function saved(store: StoreName, storeProductId: string, title: string, salesUnitSize: string): SavedProduct {
  return {
    id: savedProductId(store, storeProductId), store, storeProductId, title, brand: '', salesUnitSize,
    mainCategory: '', subCategory: '', imageUrl: '', addedAt: '2026-01-01T00:00:00.000Z', productGroup: 'koffie',
  };
}

function snap(date: string, currentPrice: number | null, isBonus = false): PriceSnapshot {
  return { date, currentPrice, priceBeforeBonus: null, isBonus, bonusMechanism: isBonus ? '25%' : '' };
}

test('the cheapest per unit on each date, carrying each product\'s last snapshot forward', () => {
  const a = saved('ah', '1', 'A 500 g', '500 g');   // €/kg: 8, then 6
  const b = saved('dirk', '2', 'B 1 kg', '1 kg');   // €/kg: 7, from its first snapshot on
  const result = cheapestPerDate([
    // newest first, as getHistory gives it
    { saved: a, history: [snap('2026-03-10', 3, true), snap('2026-03-01', 4)] },
    { saved: b, history: [snap('2026-03-05', 7)] },
  ]);

  assert.deepEqual(result.map(r => [r.date, r.title, r.unitPrice]), [
    ['2026-03-10', 'A 500 g', 6],
    ['2026-03-05', 'B 1 kg', 7],
    // B has no snapshot yet on 03-01, so A wins alone
    ['2026-03-01', 'A 500 g', 8],
  ]);
  assert.equal(result[0].isBonus, true);
  assert.equal(result[0].bonusMechanism, '25%');
  assert.equal(result[0].standardUnit, 'kg');
  assert.equal(result[1].store, 'dirk');
});

test('a null price is skipped on its date', () => {
  const a = saved('ah', '1', 'A', '1 kg');
  const b = saved('etos', '2', 'B', 'per pak');
  const result = cheapestPerDate([
    { saved: a, history: [snap('2026-03-02', 5), snap('2026-03-01', null)] },
    { saved: b, history: [snap('2026-03-01', 6)] },
  ]);

  assert.deepEqual(result.map(r => [r.date, r.title, r.unitPrice, r.currentPrice]), [
    ['2026-03-02', 'A', 5, 5],
    // A's null price on 03-01 leaves B, per piece ("per pak" parses as 1 stuk)
    ['2026-03-01', 'B', 6, 6],
  ]);
});

test('a date where no product has a price gives no entry', () => {
  const a = saved('ah', '1', 'A', '1 kg');
  assert.deepEqual(cheapestPerDate([{ saved: a, history: [snap('2026-03-01', null)] }]), []);
  assert.deepEqual(cheapestPerDate([]), []);
});
