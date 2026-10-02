import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAllBonuses } from '../src/services/bonusCheck.ts';
import { cheapestPerDate } from '../src/services/groupHistory.ts';
import * as priceHistory from '../src/services/priceHistory.ts';
import { ah } from '../src/stores/ah.ts';
import type { Product, SavedProduct, StoreName } from '../src/types.ts';
import { useTempDataDir } from './tempDataDir.ts';
import { BrokenStore, FakeStore, product } from './fakeStore.ts';

await useTempDataDir();

afterEach(() => mock.timers.reset());

function saved(store: StoreName, storeProductId: string, fields: Partial<SavedProduct> = {}): SavedProduct {
  return {
    id: `${store}-${storeProductId}`, store, storeProductId, title: `Product ${storeProductId}`, brand: '',
    salesUnitSize: '1 kg', mainCategory: '', subCategory: '', imageUrl: '', addedAt: '2026-01-01T00:00:00.000Z',
    ...fields,
  };
}

const onBonus = (fields: Partial<Product> = {}) =>
  ({ isBonus: true, bonusMechanism: '25%', priceBeforeBonus: 8, currentPrice: 6, ...fields });

test('an observed product not on bonus gets a price snapshot but is not a bonus product', async () => {
  const store = new FakeStore('ah', [
    product('ah', '1', onBonus()),
    product('ah', '2', { currentPrice: 1.5 }),
  ]);

  const overview = await checkAllBonuses([saved('ah', '1'), saved('ah', '2'), saved('ah', '404')], { ah: store });

  assert.deepEqual(overview.bonusProducts.map(p => p.savedId), ['ah-1']);
  assert.deepEqual(overview.notFound, ['ah-404']);
  assert.deepEqual((await priceHistory.getHistory('ah-1')).map(s => [s.currentPrice, s.isBonus]), [[6, true]]);
  assert.deepEqual((await priceHistory.getHistory('ah-2')).map(s => [s.currentPrice, s.isBonus]), [[1.5, false]]);
  assert.deepEqual(await priceHistory.getHistory('ah-404'), []);
});

test('the store adapter\'s countsAsBonus filters the overview: AH leaves out online-only bonuses', async () => {
  assert.equal(ah.countsAsBonus(product('ah', '1', onBonus())), true);
  assert.equal(ah.countsAsBonus(product('ah', '1', onBonus({ isOnlineOnly: true }))), false);
  assert.equal(ah.countsAsBonus(product('ah', '1')), false);

  const store = new FakeStore('ah', [
    product('ah', '11', onBonus()),
    product('ah', '12', onBonus({ isOnlineOnly: true, currentPrice: 5 })),
  ]);
  store.countsAsBonus = ah.countsAsBonus;

  const overview = await checkAllBonuses([saved('ah', '11'), saved('ah', '12')], { ah: store });
  assert.deepEqual(overview.bonusProducts.map(p => p.savedId), ['ah-11']);
  // Observed all the same
  assert.deepEqual((await priceHistory.getHistory('ah-12')).map(s => s.currentPrice), [5]);
});

test('a store that throws puts its saved products in notFound; the others still count', async () => {
  const overview = await checkAllBonuses(
    [saved('ah', '21'), saved('dirk', '22')],
    { ah: new FakeStore('ah', [product('ah', '21', onBonus())]), dirk: new BrokenStore('dirk') },
  );
  assert.deepEqual(overview.bonusProducts.map(p => p.savedId), ['ah-21']);
  assert.deepEqual(overview.notFound, ['dirk-22']);
});

test('group history goes back to the regular price once a bonus ends', async () => {
  const koffie = saved('ah', '31', { title: 'Koffie', productGroup: 'koffie' });
  const thee = saved('dirk', '32', { title: 'Thee', productGroup: 'koffie' });
  const ahStore = new FakeStore('ah', [product('ah', '31', onBonus())]);
  const dirkStore = new FakeStore('dirk', [product('dirk', '32', { currentPrice: 7 })]);
  const check = () => checkAllBonuses([koffie, thee], { ah: ahStore, dirk: dirkStore });

  mock.timers.enable({ apis: ['Date'], now: new Date('2026-03-01T12:00:00Z') });
  await check();

  // The bonus ends: the next check sees the regular price
  ahStore.products = [product('ah', '31', { currentPrice: 8 })];
  mock.timers.setTime(new Date('2026-03-08T12:00:00Z').getTime());
  const overview = await check();
  assert.deepEqual(overview.bonusProducts, []);

  const entries = await Promise.all(
    [koffie, thee].map(async s => ({ saved: s, history: await priceHistory.getHistory(s.id) })),
  );
  assert.deepEqual(cheapestPerDate(entries).map(e => [e.date, e.title, e.currentPrice, e.isBonus]), [
    ['2026-03-08', 'Thee', 7, false],
    ['2026-03-01', 'Koffie', 6, true],
  ]);
});
