import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.ts';
import { useTempDataDir } from './tempDataDir.ts';
import { BrokenStore, FakeStore, product } from './fakeStore.ts';

const dir = await useTempDataDir();

const ah = new FakeStore('ah', [
  product('ah', '1', { title: 'Koffie bonen', salesUnitSize: '500 g', isBonus: true, bonusMechanism: '25%', priceBeforeBonus: 8, currentPrice: 6 }),
  product('ah', '2', { title: 'Thee', currentPrice: 1.5 }),
  product('ah', '3', { title: 'Melk', isBonus: true, bonusMechanism: '2e halve prijs', currentPrice: 1 }),
]);
const dirk = new BrokenStore('dirk');

let server: Server;
let base: string;

before(async () => {
  server = createApp({ stores: { ah, dirk }, idleShutdown: { enabled: false } }).listen(0);
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
  assert.deepEqual(json.notFound.sort(), ['ah-999', 'dirk-5']);

  // The bonus check recorded a snapshot for every observed product, on bonus or not
  const history = await api('GET', '/history/ah-1');
  assert.deepEqual(history.json.map((s: any) => [s.currentPrice, s.isBonus]), [[6, true]]);
  const regular = await api('GET', '/history/ah-2');
  assert.deepEqual(regular.json.map((s: any) => [s.currentPrice, s.isBonus]), [[1.5, false]]);

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
  assert.deepEqual(paused.json.notFound, []);

  await api('PATCH', '/products/ah-1', { paused: false });
  const resumed = await api('GET', '/bonus');
  assert.deepEqual(resumed.json.bonusProducts.map((p: any) => p.savedId), ['ah-1', 'ah-3']);

  for (const id of ['ah-1', 'ah-3']) await api('DELETE', `/products/${id}`);
});

test('product detail: unknown store, not found, and a price snapshot', async () => {
  assert.equal((await api('GET', '/product/jumbo/1')).status, 400);
  assert.equal((await api('GET', '/product/ah/404')).status, 404);

  const detail = await api('GET', '/product/ah/2');
  assert.equal(detail.status, 200);
  assert.equal(detail.json.title, 'Thee');

  const history = await api('GET', '/history/ah-2');
  assert.deepEqual(history.json.map((s: any) => s.currentPrice), [1.5]);
  assert.deepEqual((await api('GET', '/history/ah-unknown')).json, []);
});

test('group history: the cheapest per unit per date, across the group', async () => {
  await api('POST', '/products', { ...koffie, storeProductId: '10' });
  await api('POST', '/products', { store: 'ah', storeProductId: '11', title: 'Koffie 1 kg', salesUnitSize: '1 kg' });
  await api('POST', '/products', { store: 'ah', storeProductId: '12', title: 'Ander', salesUnitSize: '1 kg' });
  await api('PATCH', '/products/ah-10', { productGroup: 'koffie' });
  await api('PATCH', '/products/ah-11', { productGroup: 'koffie' });

  const snap = (date: string, currentPrice: number) =>
    ({ date, currentPrice, priceBeforeBonus: null, isBonus: false, bonusMechanism: '' });
  await writeFile(join(dir, 'price-history.json'), JSON.stringify({
    'ah-10': [snap('2026-03-01', 4), snap('2026-03-08', 3)], // €/kg 8, then 6
    'ah-11': [snap('2026-03-05', 7)],
    'ah-12': [snap('2026-03-01', 0.5)], // not in the group
  }));

  const { status, json } = await api('GET', '/group-history/koffie');
  assert.equal(status, 200);
  assert.deepEqual(json.map((e: any) => [e.date, e.title, e.unitPrice]), [
    ['2026-03-08', 'Koffie bonen', 6],
    ['2026-03-05', 'Koffie 1 kg', 7],
    ['2026-03-01', 'Koffie bonen', 8],
  ]);
  assert.deepEqual((await api('GET', '/group-history/leeg')).json, []);
});
