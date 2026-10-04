import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSavedProductList } from '../public/js/savedProducts.js';
import { saved } from './savedProduct.ts';
import type { SavedProduct } from '../src/types.ts';

/** A fake api.js over an in-memory server list; `fail` makes the edits throw. */
function fakeApi(server: SavedProduct[], { fail = false } = {}) {
  const calls: string[] = [];
  return {
    calls,
    async getProducts() {
      return server.map(p => ({ ...p }));
    },
    async updateProduct(id: string, data: { paused?: boolean }) {
      calls.push(`PATCH ${id} ${JSON.stringify(data)}`);
      if (fail) throw new Error('Opslaan mislukt');
      const p = server.find(s => s.id === id);
      if (!p) throw new Error('Product not found');
      Object.assign(p, data);
      return { ...p };
    },
    async removeProduct(id: string) {
      calls.push(`DELETE ${id}`);
      if (fail) throw new Error('Verwijderen mislukt');
      server.splice(server.findIndex(s => s.id === id), 1);
      return { ok: true as const };
    },
  };
}

async function loaded(server: SavedProduct[], options?: { fail?: boolean }) {
  const api = fakeApi(server, options);
  const list = createSavedProductList(api);
  let changes = 0;
  list.onChange(() => { changes++; });
  await list.load();
  return { api, list, changes: () => changes };
}

test('load fetches the saved products and notifies listeners', async () => {
  const { list, changes } = await loaded([saved('ah-1', null), saved('dirk-2', 'koffie')]);
  assert.deepEqual(list.products().map(p => p.id), ['ah-1', 'dirk-2']);
  assert.equal(list.get('dirk-2')?.productGroup, 'koffie');
  assert.equal(list.get('ah-9'), null);
  assert.equal(changes(), 1);
});

test('the list is empty before load', () => {
  const list = createSavedProductList(fakeApi([saved('ah-1', null)]));
  assert.deepEqual(list.products(), []);
});

test('setting paused persists, puts the server answer in the list and notifies', async () => {
  const { api, list, changes } = await loaded([saved('ah-1', null), saved('dirk-2', null)]);
  const updated = await list.setPaused('dirk-2', true);
  assert.deepEqual(api.calls, ['PATCH dirk-2 {"paused":true}']);
  assert.equal(updated.paused, true);
  assert.equal(list.get('dirk-2')?.paused, true);
  assert.equal(list.get('ah-1')?.paused, undefined);
  assert.deepEqual(list.products().map(p => p.id), ['ah-1', 'dirk-2'], 'order kept');
  assert.equal(changes(), 2);

  await list.setPaused('dirk-2', false);
  assert.equal(list.get('dirk-2')?.paused, false);
  assert.equal(changes(), 3);
});

test('remove persists, drops the product and notifies', async () => {
  const { api, list, changes } = await loaded([saved('ah-1', null), saved('dirk-2', null)]);
  await list.remove('ah-1');
  assert.deepEqual(api.calls, ['DELETE ah-1']);
  assert.deepEqual(list.products().map(p => p.id), ['dirk-2']);
  assert.equal(changes(), 2);
});

test('a failed set paused leaves the list unchanged and throws the error', async () => {
  const { list, changes } = await loaded([saved('ah-1', null, false)], { fail: true });
  const before = list.products();
  await assert.rejects(list.setPaused('ah-1', true), { message: 'Opslaan mislukt' });
  assert.equal(list.products(), before);
  assert.equal(list.get('ah-1')?.paused, false);
  assert.equal(changes(), 1);
});

test('a failed remove leaves the list unchanged and throws the error', async () => {
  const { list, changes } = await loaded([saved('ah-1', null)], { fail: true });
  await assert.rejects(list.remove('ah-1'), { message: 'Verwijderen mislukt' });
  assert.deepEqual(list.products().map(p => p.id), ['ah-1']);
  assert.equal(changes(), 1);
});

test('a failed load leaves the list unchanged and throws the error', async () => {
  const { list, changes } = await loaded([saved('ah-1', null)]);
  const failing = createSavedProductList({
    ...fakeApi([]),
    async getProducts() { throw new Error('Kon producten niet laden'); },
  });
  await assert.rejects(failing.load(), { message: 'Kon producten niet laden' });
  assert.deepEqual(failing.products(), []);
  assert.deepEqual(list.products().map(p => p.id), ['ah-1']);
  assert.equal(changes(), 1);
});

test('merge replaces products by id, adds new ones at the end and notifies', async () => {
  const { list, changes } = await loaded([saved('ah-1', null), saved('dirk-2', null)]);
  list.merge([saved('dirk-2', 'koffie'), saved('bol-3', null)]);
  assert.deepEqual(list.products().map(p => [p.id, p.productGroup]), [['ah-1', null], ['dirk-2', 'koffie'], ['bol-3', null]]);
  assert.equal(changes(), 2);
});

test('a stopped listener is no longer called', async () => {
  const list = createSavedProductList(fakeApi([saved('ah-1', null)]));
  let calls = 0;
  const stop = list.onChange(() => { calls++; });
  await list.load();
  stop();
  await list.setPaused('ah-1', true);
  assert.equal(calls, 1);
});
