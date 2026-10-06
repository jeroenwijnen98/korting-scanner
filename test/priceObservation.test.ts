import { test } from 'node:test';
import assert from 'node:assert/strict';
import { observeSavedProducts } from '../src/services/priceObservation.ts';
import * as priceHistory from '../src/services/priceHistory.ts';
import * as productStore from '../src/services/productStore.ts';
import type { Product, SavedProduct } from '../src/types.ts';
import { useTempDataDir } from './tempDataDir.ts';
import { BrokenStore, FakeStore, product } from './fakeStore.ts';

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
  { name: 'an unknown product goes to notFound, unsnapshotted', savedImage: OLD, observed: null, snapshots: [], image: OLD },
  { name: 'a throwing store sends only its products to notFound', savedImage: OLD, observed: 'throws', snapshots: [], image: OLD },
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

    const found = c.observed !== null && c.observed !== 'throws';
    assert.deepEqual(result.observed.map(p => p.savedId), found ? [ahSaved.id, dirkSaved.id] : [dirkSaved.id]);
    assert.deepEqual(result.notFound, found ? [] : [ahSaved.id]);
    assert.deepEqual((await priceHistory.getHistory(ahSaved.id)).map(s => [s.currentPrice, s.isBonus]), c.snapshots);
    assert.deepEqual((await priceHistory.getHistory(dirkSaved.id)).map(s => [s.currentPrice, s.isBonus]), [[3, false]]);
    const images = new Map((await productStore.getAll()).map(p => [p.id, p.imageUrl]));
    assert.equal(images.get(ahSaved.id), c.image);
    assert.equal(images.get(dirkSaved.id), OLD);
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
