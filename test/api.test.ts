import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.ts';
import { getHistory } from '../src/services/priceHistory.ts';
import { useTempDataDir } from './tempDataDir.ts';
import { BrokenStore, FakeStore, product } from './fakeStore.ts';

const dir = await useTempDataDir();

const ah = new FakeStore('ah', [
  product('ah', '1', { title: 'Koffie bonen', salesUnitSize: '500 g', isBonus: true, bonusMechanism: '25%', priceBeforeBonus: 8, currentPrice: 6 }),
  product('ah', '2', { title: 'Thee', currentPrice: 1.5 }),
  product('ah', '3', { title: 'Melk', isBonus: true, bonusMechanism: '2e halve prijs', currentPrice: 1 }),
  product('ah', '4', { title: 'Kaas', currentPrice: 4, imageUrl: 'https://img/new.jpg' }),
  product('ah', '6', { title: 'Brood', currentPrice: 3 }),
  product('ah', '7', { title: 'Eieren', isBonus: true, bonusMechanism: '1+1 gratis', currentPrice: 2.5 }),
  product('ah', '8', { title: 'Boter', currentPrice: 2 }),
  product('ah', '9', { title: 'Jam', currentPrice: 2.2 }),
  product('ah', '20', { title: 'Pasta 500 g', salesUnitSize: '500 g', currentPrice: 1, imageUrl: 'https://img/pasta.jpg' }),
]);
const dirk = new BrokenStore('dirk');

let server: Server;
let base: string;

before(async () => {
  server = createApp({ stores: { ah, dirk }, idleShutdown: { enabled: false }, grocerUrl: null }).app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}/api`;
});

after(() => new Promise(resolve => server.close(resolve)));

async function api(method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(base + path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

const koffie = { store: 'ah', storeProductId: '1', title: 'Koffie bonen', salesUnitSize: '500 g' };

test('saved products: save, duplicate, list, patch, delete', async () => {
  assert.deepEqual((await api('GET', '/products')).json, []);

  const saved = await api('POST', '/products', koffie);
  assert.equal(saved.status, 201);
  assert.equal(saved.json.id, 'ah-1');
  assert.equal(saved.json.salesUnitSize, '500 g');

  assert.equal((await api('POST', '/products', koffie)).status, 409);

  const list = await api('GET', '/products');
  assert.equal(list.status, 200);
  assert.deepEqual(list.json.map((p: any) => p.id), ['ah-1']);

  const patched = await api('PATCH', '/products/ah-1', { productGroup: 'koffie' });
  assert.equal(patched.status, 200);
  assert.equal(patched.json.productGroup, 'koffie');
  // Omitted: a PATCH without productGroup (or without a body) leaves the group
  assert.equal((await api('PATCH', '/products/ah-1', {})).json.productGroup, 'koffie');
  assert.equal((await api('PATCH', '/products/ah-1')).json.productGroup, 'koffie');
  // Keys outside the editable fields are ignored
  const ignored = await api('PATCH', '/products/ah-1', { title: 'Anders', id: 'ah-9', addedAt: 'gisteren' });
  assert.equal(ignored.status, 200);
  assert.equal(ignored.json.title, 'Koffie bonen');
  assert.equal(ignored.json.id, 'ah-1');
  assert.notEqual(ignored.json.addedAt, 'gisteren');
  assert.equal(ignored.json.productGroup, 'koffie');
  // null clears the group
  assert.equal((await api('PATCH', '/products/ah-1', { productGroup: null })).json.productGroup, null);
  assert.equal((await api('GET', '/products')).json[0].productGroup, null);
  // A string sets it again
  assert.equal((await api('PATCH', '/products/ah-1', { productGroup: 'thee' })).json.productGroup, 'thee');
  assert.equal((await api('GET', '/products')).json[0].productGroup, 'thee');
  assert.equal((await api('PATCH', '/products/ah-404', { productGroup: 'x' })).status, 404);

  // Pause: missing means not paused; set, kept by other edits, written to disk, cleared
  assert.equal((await api('GET', '/products')).json[0].paused, undefined);
  assert.equal((await api('PATCH', '/products/ah-1', { paused: true })).json.paused, true);
  assert.equal((await api('PATCH', '/products/ah-1', { productGroup: 'koffie' })).json.paused, true);
  const onDisk = JSON.parse(await readFile(join(dir, 'products.json'), 'utf8'));
  assert.deepEqual(onDisk.map((p: any) => [p.id, p.paused, p.productGroup]), [['ah-1', true, 'koffie']]);
  assert.equal((await api('PATCH', '/products/ah-1', { paused: false })).json.paused, false);
  assert.equal((await api('GET', '/products')).json[0].paused, false);

  // A product added to a fully paused group starts out unpaused
  await api('PATCH', '/products/ah-1', { paused: true });
  await api('POST', '/products', { store: 'ah', storeProductId: '5', title: 'Koffie 2' });
  const joined = await api('PATCH', '/products/ah-5', { productGroup: 'koffie' });
  assert.equal(joined.json.paused, undefined);
  assert.equal((await api('GET', '/products')).json[0].paused, true);
  await api('DELETE', '/products/ah-5');

  assert.deepEqual((await api('DELETE', '/products/ah-1')).json, { ok: true });
  assert.equal((await api('DELETE', '/products/ah-1')).status, 404);
  assert.deepEqual((await api('GET', '/products')).json, []);
});

test('a malformed JSON body is a 400 with a JSON error', async () => {
  const res = await fetch(`${base}/products`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
  });
  assert.equal(res.status, 400);
  assert.ok(((await res.json()) as { error?: string }).error);
});

test('search: missing params, unknown store, a store that throws, results', async () => {
  assert.equal((await api('GET', '/search?q=koffie')).status, 400);
  assert.equal((await api('GET', '/search?store=ah')).status, 400);

  const unknown = await api('GET', '/search?store=jumbo&q=koffie');
  assert.equal(unknown.status, 400);
  assert.equal(unknown.json.error, 'Unknown store: jumbo');
  // Not a store, though an own property of every object
  assert.equal((await api('GET', '/search?store=constructor&q=x')).status, 400);

  const broken = await api('GET', '/search?store=dirk&q=koffie');
  assert.equal(broken.status, 500);
  assert.equal(broken.json.error, 'store down');

  const found = await api('GET', '/search?store=ah&q=koffie');
  assert.equal(found.status, 200);
  assert.deepEqual(found.json.map((p: any) => p.productId), ['1']);
});

test('bonus: one throwing store does not sink the others', async () => {
  await api('POST', '/products', koffie);
  await api('POST', '/products', { store: 'ah', storeProductId: '2', title: 'Thee' });
  await api('POST', '/products', { store: 'ah', storeProductId: '999', title: 'Weg' });
  await api('POST', '/products', { store: 'dirk', storeProductId: '5', title: 'Dirk ding' });

  const { status, json } = await api('GET', '/bonus');
  assert.equal(status, 200);
  assert.deepEqual(json.bonusProducts.map((p: any) => [p.savedId, p.currentPrice]), [['ah-1', 6]]);
  assert.deepEqual(json.summary, { storesDown: ['dirk'], unchecked: ['dirk-5'], gone: ['ah-999'] });

  // The bonus check recorded a snapshot for every observed product, on bonus or not
  const history = await getHistory('ah-1');
  assert.deepEqual(history.map(s => [s.currentPrice, s.isBonus]), [[6, true]]);
  const regular = await getHistory('ah-2');
  assert.deepEqual(regular.map(s => [s.currentPrice, s.isBonus]), [[1.5, false]]);

  for (const id of ['ah-1', 'ah-2', 'ah-999', 'dirk-5']) await api('DELETE', `/products/${id}`);
});

test('bonus: each bonus product carries its saved product\'s productGroup', async () => {
  await api('POST', '/products', koffie);
  await api('POST', '/products', { store: 'ah', storeProductId: '3', title: 'Melk' });
  await api('PATCH', '/products/ah-1', { productGroup: 'koffie' });

  const { status, json } = await api('GET', '/bonus');
  assert.equal(status, 200);
  assert.deepEqual(json.bonusProducts.map((p: any) => [p.savedId, p.productGroup]), [
    ['ah-1', 'koffie'],
    ['ah-3', null],
  ]);

  for (const id of ['ah-1', 'ah-3']) await api('DELETE', `/products/${id}`);
});

test('bonus: a paused product on bonus is left out, and back once resumed', async () => {
  await api('POST', '/products', koffie);
  await api('POST', '/products', { store: 'ah', storeProductId: '3', title: 'Melk' });
  await api('PATCH', '/products/ah-1', { paused: true });

  const paused = await api('GET', '/bonus');
  assert.deepEqual(paused.json.bonusProducts.map((p: any) => p.savedId), ['ah-3']);
  assert.deepEqual(paused.json.summary.gone, []);

  await api('PATCH', '/products/ah-1', { paused: false });
  const resumed = await api('GET', '/bonus');
  assert.deepEqual(resumed.json.bonusProducts.map((p: any) => p.savedId), ['ah-1', 'ah-3']);

  for (const id of ['ah-1', 'ah-3']) await api('DELETE', `/products/${id}`);
});

test('bonus: the answer carries GROCER_URL, or null without it', async () => {
  await api('POST', '/products', koffie);

  assert.equal((await api('GET', '/bonus')).json.grocerUrl, null);

  const grocer = createApp({ stores: { ah }, idleShutdown: { enabled: false }, grocerUrl: 'https://grocer.example.nl' }).app.listen(0);
  await new Promise(resolve => grocer.once('listening', resolve));
  try {
    const res = await fetch(`http://localhost:${(grocer.address() as AddressInfo).port}/api/bonus`);
    const json: any = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.grocerUrl, 'https://grocer.example.nl');
    assert.deepEqual(json.bonusProducts.map((p: any) => p.savedId), ['ah-1']);
  } finally {
    await new Promise(resolve => grocer.close(resolve));
  }

  await api('DELETE', '/products/ah-1');
});

test('product detail: an unknown store is a 400, an unknown product a 404', async () => {
  assert.equal((await api('GET', '/product/jumbo/1')).status, 400);
  assert.equal((await api('GET', '/product/ah/404')).status, 404);

  // A saved product the store does not know is a 404 as well
  await api('POST', '/products', { store: 'ah', storeProductId: '404', title: 'Weg' });
  assert.equal((await api('GET', '/product/ah/404')).status, 404);
  assert.deepEqual(await getHistory('ah-404'), []);
  await api('DELETE', '/products/ah-404');
});

test('product detail: viewing a saved product snapshots it and syncs its image', async () => {
  await api('POST', '/products', { store: 'ah', storeProductId: '4', title: 'Kaas', imageUrl: 'https://img/old.jpg' });

  const detail = await api('GET', '/product/ah/4');
  assert.equal(detail.status, 200);
  assert.equal(detail.json.title, 'Kaas');
  assert.equal(detail.json.currentPrice, 4);
  assert.equal(detail.json.savedId, undefined);

  const history = await getHistory('ah-4');
  assert.deepEqual(history.map(s => [s.currentPrice, s.isBonus]), [[4, false]]);
  const [kaas] = (await api('GET', '/products')).json;
  assert.equal(kaas.imageUrl, 'https://img/new.jpg');

  await api('DELETE', '/products/ah-4');
});

test('product detail: viewing an unsaved product writes no history', async () => {
  const historyBefore = await readFile(join(dir, 'price-history.json'), 'utf8').catch(() => null);

  const detail = await api('GET', '/product/ah/6');
  assert.equal(detail.status, 200);
  assert.equal(detail.json.title, 'Brood');

  assert.deepEqual(await getHistory('ah-6'), []);
  assert.equal(await readFile(join(dir, 'price-history.json'), 'utf8').catch(() => null), historyBefore);
});

test('image backfill: a missing image is filled and the saved products returned', async () => {
  await api('POST', '/products', { store: 'ah', storeProductId: '4', title: 'Kaas' });
  await api('POST', '/products', { store: 'ah', storeProductId: '2', title: 'Thee', imageUrl: 'https://img/thee.jpg' });
  await api('POST', '/products', { store: 'ah', storeProductId: '6', title: 'Brood' });

  const { status, json } = await api('POST', '/products/sync-images');
  assert.equal(status, 200);
  // Kaas takes the store's image; Brood has none at the store; Thee keeps its own
  assert.deepEqual(json.map((p: any) => [p.id, p.imageUrl]), [
    ['ah-4', 'https://img/new.jpg'],
    ['ah-2', 'https://img/thee.jpg'],
    ['ah-6', ''],
  ]);
  assert.deepEqual((await api('GET', '/products')).json, json);

  for (const id of ['ah-4', 'ah-2', 'ah-6']) await api('DELETE', `/products/${id}`);
});

test('image backfill: each observed product gets a price snapshot', async () => {
  await api('POST', '/products', { store: 'ah', storeProductId: '7', title: 'Eieren' });
  await api('POST', '/products', { store: 'ah', storeProductId: '8', title: 'Boter' });
  await api('POST', '/products', { store: 'ah', storeProductId: '999', title: 'Weg' });
  await api('POST', '/products', { store: 'ah', storeProductId: '9', title: 'Jam', imageUrl: 'https://img/jam.jpg' });

  assert.equal((await api('POST', '/products/sync-images')).status, 200);

  const eieren = await getHistory('ah-7');
  assert.deepEqual(eieren.map(s => [s.currentPrice, s.isBonus]), [[2.5, true]]);
  const boter = await getHistory('ah-8');
  assert.deepEqual(boter.map(s => [s.currentPrice, s.isBonus]), [[2, false]]);
  // Not found at the store, so not observed
  assert.deepEqual(await getHistory('ah-999'), []);
  // Jam has its image, so the backfill does not observe it
  assert.deepEqual(await getHistory('ah-9'), []);

  for (const id of ['ah-7', 'ah-8', 'ah-999', 'ah-9']) await api('DELETE', `/products/${id}`);
});

const snap = (date: string, currentPrice: number) =>
  ({ date, currentPrice, priceBeforeBonus: null, isBonus: false, bonusMechanism: '' });
const today = () => new Date().toISOString().slice(0, 10);

test('saved product detail: the observed product, its history, its group history and saved fields', async () => {
  await api('POST', '/products', { store: 'ah', storeProductId: '20', title: 'Pasta 500 g', salesUnitSize: '500 g' });
  await api('POST', '/products', { store: 'ah', storeProductId: '21', title: 'Pasta 1 kg', salesUnitSize: '1 kg' });
  await api('PATCH', '/products/ah-20', { productGroup: 'pasta', paused: true });
  await api('PATCH', '/products/ah-21', { productGroup: 'pasta' });
  await writeFile(join(dir, 'price-history.json'), JSON.stringify({
    'ah-20': [snap('2026-03-01', 1.2)], // €/kg 2.4
    'ah-21': [snap('2026-03-05', 1.8)], // €/kg 1.8
  }));

  const { status, json } = await api('GET', '/products/ah-20/detail');
  assert.equal(status, 200);
  assert.equal(json.product.title, 'Pasta 500 g');
  assert.equal(json.product.currentPrice, 1);
  assert.equal(json.product.savedId, undefined);
  // Observing recorded today's snapshot, so the history holds it
  assert.deepEqual(json.history.map((s: any) => [s.date, s.currentPrice]), [[today(), 1], ['2026-03-01', 1.2]]);
  // ...and the group history counts it too: €/kg 2 today, still above ah-21
  assert.deepEqual(json.groupHistory.map((e: any) => [e.date, e.title, e.unitPrice]), [
    [today(), 'Pasta 1 kg', 1.8],
    ['2026-03-05', 'Pasta 1 kg', 1.8],
    ['2026-03-01', 'Pasta 500 g', 2.4],
  ]);
  // The saved fields, with the image the observation synced
  assert.equal(json.saved.id, 'ah-20');
  assert.equal(json.saved.productGroup, 'pasta');
  assert.equal(json.saved.paused, true);
  assert.equal(json.saved.imageUrl, 'https://img/pasta.jpg');

  for (const id of ['ah-20', 'ah-21']) await api('DELETE', `/products/${id}`);
});

test('saved product detail: an unknown saved id is a 404', async () => {
  const { status, json } = await api('GET', '/products/ah-404/detail');
  assert.equal(status, 404);
  assert.equal(json.error, 'Product not found');
});

test('saved product detail: without a product group the group history is empty', async () => {
  await api('POST', '/products', { store: 'ah', storeProductId: '20', title: 'Pasta 500 g', salesUnitSize: '500 g' });

  const { status, json } = await api('GET', '/products/ah-20/detail');
  assert.equal(status, 200);
  assert.equal(json.saved.productGroup, undefined);
  assert.deepEqual(json.groupHistory, []);
  assert.equal(json.product.currentPrice, 1);

  await api('DELETE', '/products/ah-20');
});

test('saved product detail: a failing group history keeps the product and its own history', async () => {
  await api('POST', '/products', { store: 'ah', storeProductId: '20', title: 'Pasta 500 g', salesUnitSize: '500 g' });
  await api('POST', '/products', { store: 'ah', storeProductId: '21', title: 'Pasta 1 kg', salesUnitSize: '1 kg' });
  await api('PATCH', '/products/ah-20', { productGroup: 'pasta' });
  await api('PATCH', '/products/ah-21', { productGroup: 'pasta' });
  // ah-21's history is corrupt, so reading the group's history throws
  await writeFile(join(dir, 'price-history.json'), JSON.stringify({ 'ah-20': [snap('2026-03-01', 1.2)], 'ah-21': 5 }));

  const { status, json } = await api('GET', '/products/ah-20/detail');
  assert.equal(status, 200);
  assert.deepEqual(json.groupHistory, []);
  assert.equal(json.product.currentPrice, 1);
  assert.deepEqual(json.history.map((s: any) => s.currentPrice), [1, 1.2]);
  assert.equal(json.saved.productGroup, 'pasta');

  for (const id of ['ah-20', 'ah-21']) await api('DELETE', `/products/${id}`);
});

test('saved product detail: a failing store call keeps the histories and saved fields', async () => {
  await api('POST', '/products', { store: 'dirk', storeProductId: '5', title: 'Dirk pasta', salesUnitSize: '500 g' });
  await api('POST', '/products', { store: 'ah', storeProductId: '21', title: 'Pasta 1 kg', salesUnitSize: '1 kg' });
  await api('PATCH', '/products/dirk-5', { productGroup: 'pasta' });
  await api('PATCH', '/products/ah-21', { productGroup: 'pasta' });
  await writeFile(join(dir, 'price-history.json'), JSON.stringify({
    'dirk-5': [snap('2026-03-01', 1.2)],
    'ah-21': [snap('2026-03-05', 1.8)],
  }));

  // dirk is the BrokenStore: its every call throws
  const { status, json } = await api('GET', '/products/dirk-5/detail');
  assert.equal(status, 200);
  assert.equal(json.product, null);
  assert.deepEqual(json.history.map((s: any) => [s.date, s.currentPrice]), [['2026-03-01', 1.2]]);
  assert.deepEqual(json.groupHistory.map((e: any) => [e.date, e.title]), [
    ['2026-03-05', 'Pasta 1 kg'],
    ['2026-03-01', 'Dirk pasta'],
  ]);
  assert.equal(json.saved.title, 'Dirk pasta');

  for (const id of ['dirk-5', 'ah-21']) await api('DELETE', `/products/${id}`);
});
