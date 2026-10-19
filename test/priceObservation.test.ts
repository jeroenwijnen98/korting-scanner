import { test } from 'node:test';
import assert from 'node:assert/strict';
import { observeSavedProducts, summarize } from '../src/services/priceObservation.ts';
import * as priceHistory from '../src/services/priceHistory.ts';
import * as productStore from '../src/services/productStore.ts';
import type { CheckStatus, CheckSummary, Product, SavedProduct } from '../src/types.ts';
import { useTempDataDir } from './tempDataDir.ts';
import { BrokenStore, FakeStore, product, statusesOf } from './fakeStore.ts';

await useTempDataDir();

const OLD = 'https://img/old.jpg';
const NEW = 'https://img/new.jpg';

/**
 * One AH saved product per case, observed as `observed` (null: the store does
 * not know it; 'throws': the whole store fails), next to a Dirk saved product
 * whose store works, which every case must leave untouched.
 */
const cases: {
  name: string;
  savedImage: string;
  observed: Partial<Product> | null | 'throws';
  snapshots: [number | null, boolean][];
  image: string;
}[] = [
  { name: 'a bonus is snapshotted', savedImage: OLD, observed: { isBonus: true, bonusMechanism: '25%', priceBeforeBonus: 8, currentPrice: 6, imageUrl: OLD }, snapshots: [[6, true]], image: OLD },
  { name: 'a regular price is snapshotted all the same', savedImage: OLD, observed: { currentPrice: 1.5, imageUrl: OLD }, snapshots: [[1.5, false]], image: OLD },
  { name: 'a changed image replaces the saved one', savedImage: OLD, observed: { imageUrl: NEW }, snapshots: [[2, false]], image: NEW },
  { name: 'a missing saved image is filled in', savedImage: '', observed: { imageUrl: NEW }, snapshots: [[2, false]], image: NEW },
  { name: 'no observed image keeps the saved one', savedImage: OLD, observed: { imageUrl: null }, snapshots: [[2, false]], image: OLD },
  { name: 'an unknown product is gone, unsnapshotted', savedImage: OLD, observed: null, snapshots: [], image: OLD },
  { name: 'a throwing store marks only its products store down', savedImage: OLD, observed: 'throws', snapshots: [], image: OLD },
];

for (const [i, c] of cases.entries()) {
  test(`observing a saved product: ${c.name}`, async () => {
    const ahId = `${i}`;
    const dirkId = `${100 + i}`;
    const ahSaved = await productStore.add({ store: 'ah', storeProductId: ahId, title: 'Shampoo', imageUrl: c.savedImage });
    const dirkSaved = await productStore.add({ store: 'dirk', storeProductId: dirkId, title: 'Zeep', imageUrl: OLD });
    assert.ok(ahSaved && dirkSaved);
    const ah = c.observed === 'throws'
      ? new BrokenStore('ah')
      : new FakeStore('ah', c.observed ? [product('ah', ahId, c.observed)] : []);
    const dirk = new FakeStore('dirk', [product('dirk', dirkId, { currentPrice: 3, imageUrl: OLD })]);

    const result = await observeSavedProducts({ ah, dirk }, [ahSaved, dirkSaved]);

    let ahStatus = 'observed';
    if (c.observed === null) ahStatus = 'gone';
    if (c.observed === 'throws') ahStatus = 'storeDown';
    assert.deepEqual(statusesOf(result), [[ahSaved.id, ahStatus], [dirkSaved.id, 'observed']]);
    assert.deepEqual((await priceHistory.getHistory(ahSaved.id)).map(s => [s.currentPrice, s.isBonus]), c.snapshots);
    assert.deepEqual((await priceHistory.getHistory(dirkSaved.id)).map(s => [s.currentPrice, s.isBonus]), [[3, false]]);
    const images = new Map((await productStore.getAll()).map(p => [p.id, p.imageUrl]));
    assert.equal(images.get(ahSaved.id), c.image);
    assert.equal(images.get(dirkSaved.id), OLD);
  });
}

test('every saved product comes back with one status, in the order asked, an observed one with its product', async () => {
  const saved = [
    (await productStore.add({ store: 'dirk', storeProductId: '401', title: 'A' }))!,
    (await productStore.add({ store: 'ah', storeProductId: '402', title: 'B' }))!,
    (await productStore.add({ store: 'kruidvat', storeProductId: '403', title: 'C' }))!,
    (await productStore.add({ store: 'dirk', storeProductId: '404', title: 'D' }))!,
  ];
  // Kruidvat has no store adapter here: its saved product could not be checked
  const statuses = await observeSavedProducts({
    ah: new BrokenStore('ah'),
    dirk: new FakeStore('dirk', [product('dirk', '401', { currentPrice: 4 })]),
  }, saved);

  assert.deepEqual(statuses, [
    { status: 'observed', savedId: 'dirk-401', product: { ...product('dirk', '401', { currentPrice: 4 }), savedId: 'dirk-401' } },
    { status: 'storeDown', savedId: 'ah-402', store: 'ah' },
    { status: 'storeDown', savedId: 'kruidvat-403', store: 'kruidvat' },
    { status: 'gone', savedId: 'dirk-404' },
  ]);
});

const observed = (savedId: string): CheckStatus =>
  ({ status: 'observed', savedId, product: { ...product('ah', savedId), savedId } });

/** What each mix of check statuses tells the user. */
const summaries: { name: string; statuses: CheckStatus[]; summary: CheckSummary }[] = [
  {
    name: 'all fine',
    statuses: [observed('ah-1'), observed('dirk-2')],
    summary: { storesDown: [], unchecked: [], gone: [] },
  },
  {
    name: 'store down',
    statuses: [
      { status: 'storeDown', savedId: 'ah-1', store: 'ah' },
      { status: 'storeDown', savedId: 'ah-2', store: 'ah' },
    ],
    summary: { storesDown: ['ah'], unchecked: ['ah-1', 'ah-2'], gone: [] },
  },
  {
    name: 'product gone',
    statuses: [observed('ah-1'), { status: 'gone', savedId: 'ah-2' }],
    summary: { storesDown: [], unchecked: [], gone: ['ah-2'] },
  },
  {
    name: 'mixed',
    statuses: [
      { status: 'storeDown', savedId: 'dirk-1', store: 'dirk' },
      observed('ah-2'),
      { status: 'gone', savedId: 'ah-3' },
      { status: 'storeDown', savedId: 'bol-4', store: 'bol' },
      { status: 'storeDown', savedId: 'dirk-5', store: 'dirk' },
    ],
    summary: { storesDown: ['dirk', 'bol'], unchecked: ['dirk-1', 'bol-4', 'dirk-5'], gone: ['ah-3'] },
  },
];

for (const c of summaries) {
  test(`summarizing a check: ${c.name}`, () => {
    assert.deepEqual(summarize(c.statuses), c.summary);
  });
}

test('each store observes its own saved products in one call', async () => {
  const calls: string[][] = [];
  class CountingStore extends FakeStore {
    observe(savedProducts: SavedProduct[]) {
      calls.push(savedProducts.map(p => p.id));
      return super.observe(savedProducts);
    }
  }
  const saved = [
    (await productStore.add({ store: 'dirk', storeProductId: '201', title: 'A' }))!,
    (await productStore.add({ store: 'ah', storeProductId: '202', title: 'B' }))!,
    (await productStore.add({ store: 'dirk', storeProductId: '203', title: 'C' }))!,
  ];
  await observeSavedProducts({
    ah: new CountingStore('ah', [product('ah', '202')]),
    dirk: new CountingStore('dirk', [product('dirk', '201'), product('dirk', '203')]),
  }, saved);
  assert.deepEqual(calls, [['ah-202'], ['dirk-201', 'dirk-203']]);
});

test('a detail that fails is store down, not gone; the store\'s other products still count', async () => {
  const saved = [
    (await productStore.add({ store: 'ah', storeProductId: '301', title: 'A' }))!,
    (await productStore.add({ store: 'ah', storeProductId: '302', title: 'B' }))!,
    (await productStore.add({ store: 'ah', storeProductId: '303', title: 'C' }))!,
  ];
  const ah = new FakeStore('ah', [product('ah', '301')]);
  const known = ah.getProductDetail.bind(ah);
  ah.getProductDetail = id => (id === '302' ? Promise.reject(new Error('AH API error: 503')) : known(id));

  const result = await observeSavedProducts({ ah }, saved);

  assert.deepEqual(statusesOf(result), [['ah-301', 'observed'], ['ah-302', 'storeDown'], ['ah-303', 'gone']]);
});
