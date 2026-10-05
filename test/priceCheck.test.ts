import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkSavedProducts } from '../src/services/priceCheck.ts';
import { cheapestPerDate } from '../src/services/groupHistory.ts';
import * as priceHistory from '../src/services/priceHistory.ts';
import * as productStore from '../src/services/productStore.ts';
import { ah } from '../src/stores/ah.ts';
import type { Product, SavedProduct, StoreName } from '../src/types.ts';
import { useTempDataDir } from './tempDataDir.ts';
import { BrokenStore, FakeStore, product } from './fakeStore.ts';

await useTempDataDir();

afterEach(async () => {
  mock.timers.reset();
  for (const p of await productStore.getAll()) await productStore.remove(p.id);
});

/** Saves a product, as the user would; the price check loads it from there. */
async function save(store: StoreName, storeProductId: string, title = `Product ${storeProductId}`, productGroup?: string): Promise<SavedProduct> {
  const entry = await productStore.add({ store, storeProductId, title, salesUnitSize: '1 kg' });
  assert.ok(entry);
  return productGroup === undefined ? entry : (await productStore.update(entry.id, { productGroup }))!;
}

const onBonus = (fields: Partial<Product> = {}) =>
  ({ isBonus: true, bonusMechanism: '25%', priceBeforeBonus: 8, currentPrice: 6, ...fields });

test('an observed product not on bonus gets a price snapshot but is not a bonus product', async () => {
  const store = new FakeStore('ah', [
    product('ah', '1', onBonus()),
    product('ah', '2', { currentPrice: 1.5 }),
  ]);

  for (const id of ['1', '2', '404']) await save('ah', id);

  const overview = await checkSavedProducts({ ah: store });

  assert.deepEqual(overview.bonusProducts.map(p => p.savedId), ['ah-1']);
  assert.deepEqual(overview.notFound, ['ah-404']);
  assert.deepEqual((await priceHistory.getHistory('ah-1')).map(s => [s.currentPrice, s.isBonus]), [[6, true]]);
  assert.deepEqual((await priceHistory.getHistory('ah-2')).map(s => [s.currentPrice, s.isBonus]), [[1.5, false]]);
  assert.deepEqual(await priceHistory.getHistory('ah-404'), []);
});

test('an online-only AH bonus is no bonus: left out of the overview, snapshotted without a bonus', async (t) => {
  const [melk, , online] = JSON.parse(await readFile(new URL('fixtures/ah-search.json', import.meta.url), 'utf-8')).products;
  const details: Record<string, unknown> = { '588920': { productCard: melk }, '777': { productCard: online } };
  t.mock.method(globalThis, 'fetch', (url: string) => {
    if (url.includes('/auth/token/')) return Promise.resolve(Response.json({ access_token: 'token', expires_in: 3600 }));
    const id = url.split('/').pop()!;
    return Promise.resolve(details[id] ? Response.json(details[id]) : new Response(null, { status: 404 }));
  });

  await save('ah', '588920');
  await save('ah', '777');

  const overview = await checkSavedProducts({ ah });
  assert.deepEqual(overview.bonusProducts.map(p => p.savedId), ['ah-588920']);
  assert.deepEqual(overview.notFound, []);
  // Observed all the same, at its regular price
  assert.deepEqual((await priceHistory.getHistory('ah-777')).map(s => [s.currentPrice, s.priceBeforeBonus, s.isBonus]), [[10, null, false]]);
  assert.deepEqual((await priceHistory.getHistory('ah-588920')).map(s => [s.currentPrice, s.isBonus]), [[0.9, true]]);
});

test('a store that throws puts its saved products in notFound; the others still count', async () => {
  await save('ah', '21');
  await save('dirk', '22');

  const overview = await checkSavedProducts(
    { ah: new FakeStore('ah', [product('ah', '21', onBonus())]), dirk: new BrokenStore('dirk') },
  );
  assert.deepEqual(overview.bonusProducts.map(p => p.savedId), ['ah-21']);
  assert.deepEqual(overview.notFound, ['dirk-22']);
});

test('bonus products carry their saved product\'s productGroup, joined on savedId', async () => {
  await save('ah', '41', 'Koffie', 'koffie');
  await save('ah', '42', 'Thee');
  // Like an AH detail without a webshopId: the observed productId is not the saved storeProductId
  const store = new FakeStore('ah', [product('ah', 'hq-41', onBonus()), product('ah', '42', onBonus())]);
  store.getProductDetail = id => Promise.resolve(store.products.find(p => p.productId === (id === '41' ? 'hq-41' : id)) ?? null);

  const overview = await checkSavedProducts({ ah: store });
  assert.deepEqual(overview.bonusProducts.map(p => [p.savedId, p.productId, p.productGroup]), [
    ['ah-41', 'hq-41', 'koffie'],
    ['ah-42', '42', null],
  ]);
});

test('a paused product is observed and snapshotted but left out of the bonus overview', async () => {
  await save('ah', '51');
  const paused = await save('ah', '52');
  await productStore.update(paused.id, { paused: true });
  const store = new FakeStore('ah', [
    product('ah', '51', onBonus()),
    product('ah', '52', onBonus({ currentPrice: 5 })),
  ]);

  const overview = await checkSavedProducts({ ah: store });
  assert.deepEqual(overview.bonusProducts.map(p => p.savedId), ['ah-51']);
  assert.deepEqual(overview.notFound, []);
  assert.deepEqual((await priceHistory.getHistory('ah-52')).map(s => [s.currentPrice, s.isBonus]), [[5, true]]);
});

test('group history goes back to the regular price once a bonus ends', async () => {
  const koffie = await save('ah', '31', 'Koffie', 'koffie');
  const thee = await save('dirk', '32', 'Thee', 'koffie');
  const ahStore = new FakeStore('ah', [product('ah', '31', onBonus())]);
  const dirkStore = new FakeStore('dirk', [product('dirk', '32', { currentPrice: 7 })]);
  const check = () => checkSavedProducts({ ah: ahStore, dirk: dirkStore });

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

test('a saved product\'s imageUrl follows the store when its image changes', async () => {
  await productStore.add({ store: 'ah', storeProductId: '51', title: 'Shampoo', imageUrl: 'https://img/old.jpg' });
  await productStore.add({ store: 'ah', storeProductId: '52', title: 'Zeep', imageUrl: 'https://img/zeep.jpg' });
  const store = new FakeStore('ah', [
    product('ah', '51', { imageUrl: 'https://img/new.jpg' }),
    product('ah', '52', { imageUrl: null }),
  ]);

  await checkSavedProducts({ ah: store });

  const images = Object.fromEntries((await productStore.getAll()).map(p => [p.id, p.imageUrl]));
  assert.deepEqual(images, { 'ah-51': 'https://img/new.jpg', 'ah-52': 'https://img/zeep.jpg' });
});
