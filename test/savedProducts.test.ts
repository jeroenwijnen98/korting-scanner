import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSavedProductList } from '../public/js/savedProducts.js';
import { saved } from './savedProduct.ts';
import type { SavedProduct } from '../src/types.ts';

/**
 * A fake api.js over an in-memory server list; `fail` makes the edits throw,
 * `failIds` only the PATCHes for those ids.
 */
function fakeApi(server: SavedProduct[], { fail = false, failIds = [] as string[] } = {}) {
  const calls: string[] = [];
  return {
    calls,
    async getProducts() {
      return server.map(p => ({ ...p }));
    },
    async updateProduct(id: string, data: { productGroup?: string | null, paused?: boolean }) {
      calls.push(`PATCH ${id} ${JSON.stringify(data)}`);
      if (fail || failIds.includes(id)) throw new Error('Opslaan mislukt');
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

async function loaded(server: SavedProduct[], options?: { fail?: boolean, failIds?: string[] }) {
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

test('setting the product group persists, puts the server answer in the list and notifies', async () => {
  const { api, list, changes } = await loaded([saved('ah-1', null), saved('dirk-2', 'koffie')]);
  const updated = await list.setProductGroup('ah-1', 'thee');
  assert.deepEqual(api.calls, ['PATCH ah-1 {"productGroup":"thee"}']);
  assert.equal(updated.productGroup, 'thee');
  assert.equal(list.get('ah-1')?.productGroup, 'thee');
  assert.equal(changes(), 2);

  await list.setProductGroup('dirk-2', '');
  assert.equal(api.calls[1], 'PATCH dirk-2 {"productGroup":null}', 'an empty name is no product group');
  assert.equal(list.get('dirk-2')?.productGroup, null);
});

test('a failed set product group leaves the list unchanged and throws the error', async () => {
  const { list, changes } = await loaded([saved('ah-1', 'koffie')], { fail: true });
  await assert.rejects(list.setProductGroup('ah-1', 'thee'), { message: 'Opslaan mislukt' });
  assert.equal(list.get('ah-1')?.productGroup, 'koffie');
  assert.deepEqual(list.productGroups(), ['koffie']);
  assert.equal(changes(), 1);
});

test('a product group set by one view is seen by a second listener (the other view)', async () => {
  const { list } = await loaded([saved('ah-1', null), saved('dirk-2', 'koffie')]);
  const seen: (string | null | undefined)[] = [];
  list.onChange(() => { seen.push(list.get('ah-1')?.productGroup); });
  await list.setProductGroup('ah-1', 'koffie');
  assert.deepEqual(seen, ['koffie']);
  assert.deepEqual(list.productGroups(), ['koffie']);
});

test('unavailable ids are none before a bonus check and reported after being set', async () => {
  const { list, changes } = await loaded([saved('ah-1', null), saved('dirk-2', null)]);
  assert.deepEqual(list.unavailableIds(), []);
  assert.equal(list.isUnavailable('dirk-2'), false);

  list.setUnavailable(['dirk-2']);
  assert.deepEqual(list.unavailableIds(), ['dirk-2']);
  assert.equal(list.isUnavailable('dirk-2'), true);
  assert.equal(list.isUnavailable('ah-1'), false);
  assert.equal(changes(), 2, 'listeners re-render the unavailable indicators');

  list.setUnavailable([]);
  assert.equal(list.isUnavailable('dirk-2'), false, 'the next bonus check replaces them');
});

test('unavailable ids survive a reload of the list', async () => {
  const { list } = await loaded([saved('ah-1', null)]);
  list.setUnavailable(['ah-1']);
  await list.load();
  assert.equal(list.isUnavailable('ah-1'), true);
});

test('product groups are the ones in use, each once, in list order', async () => {
  const { list } = await loaded([
    saved('ah-1', 'zon'), saved('ah-2', null), saved('dirk-3', 'koffie'), saved('bol-4', 'zon'),
  ]);
  assert.deepEqual(list.productGroups(), ['zon', 'koffie']);

  await list.setProductGroup('ah-2', 'thee');
  await list.setProductGroup('dirk-3', 'zon');
  assert.deepEqual(list.productGroups(), ['zon', 'thee']);
});

test('group pause, any member unpaused: pauses the ones not paused yet', async () => {
  const { api, list, changes } = await loaded([saved('ah-1', 'zon', true), saved('trekpleister-2', 'zon'), saved('kruidvat-3', 'zon', false)]);
  assert.equal(list.isGroupPaused('zon'), false);
  const result = await list.toggleGroupPause('zon');
  assert.deepEqual(api.calls, ['PATCH trekpleister-2 {"paused":true}', 'PATCH kruidvat-3 {"paused":true}']);
  assert.equal(result.paused, true);
  assert.deepEqual(result.updated.map(p => p.id), ['trekpleister-2', 'kruidvat-3']);
  assert.deepEqual(result.failed, []);
  assert.deepEqual(list.products().map(p => p.paused), [true, true, true]);
  assert.equal(list.isGroupPaused('zon'), true);
  assert.equal(changes(), 2);
});

test('group pause, all members paused: resumes them all', async () => {
  const { api, list } = await loaded([saved('ah-1', 'zon', true), saved('trekpleister-2', 'zon', true)]);
  assert.equal(list.isGroupPaused('zon'), true);
  const result = await list.toggleGroupPause('zon');
  assert.equal(result.paused, false);
  assert.deepEqual(api.calls, ['PATCH ah-1 {"paused":false}', 'PATCH trekpleister-2 {"paused":false}']);
  assert.equal(list.isGroupPaused('zon'), false);
});

test('group pause counts members from every store, not other groups or ungrouped', async () => {
  // A store filter on AH would show only ah-1; the Trekpleister member still decides the label
  const { api, list } = await loaded([
    saved('ah-1', 'zon', true), saved('trekpleister-2', 'zon'),
    saved('ah-4', 'koffie'), saved('ah-5', null),
  ]);
  assert.equal(list.isGroupPaused('zon'), false);
  await list.toggleGroupPause('zon');
  assert.deepEqual(api.calls, ['PATCH trekpleister-2 {"paused":true}']);
  assert.equal(list.get('ah-4')?.paused, undefined);
  assert.equal(list.get('ah-5')?.paused, undefined);
});

test('a product added to a fully paused group is unpaused, so the group pauses again', async () => {
  const { api, list } = await loaded([saved('ah-1', 'zon', true), saved('trekpleister-2', 'zon', true), saved('kruidvat-3', 'zon')]);
  assert.equal(list.isGroupPaused('zon'), false);
  const result = await list.toggleGroupPause('zon');
  assert.equal(result.paused, true);
  assert.deepEqual(api.calls, ['PATCH kruidvat-3 {"paused":true}']);
});

test('a group pause where one PATCH fails keeps the others, notifies and reports the failure', async () => {
  const { list, changes } = await loaded(
    [saved('ah-1', 'zon'), saved('trekpleister-2', 'zon'), saved('kruidvat-3', 'zon')],
    { failIds: ['trekpleister-2'] },
  );
  const result = await list.toggleGroupPause('zon');
  assert.equal(result.paused, true);
  assert.deepEqual(result.updated.map(p => p.id), ['ah-1', 'kruidvat-3']);
  assert.deepEqual(result.failed.map(f => f.id), ['trekpleister-2']);
  assert.equal((result.failed[0].error as Error).message, 'Opslaan mislukt');
  assert.deepEqual(list.products().map(p => [p.id, p.paused]), [['ah-1', true], ['trekpleister-2', undefined], ['kruidvat-3', true]]);
  assert.equal(list.isGroupPaused('zon'), false, 'the failed member still makes the button pause');
  assert.equal(changes(), 2);
});

test('a group pause where every PATCH fails leaves the list unchanged and does not notify', async () => {
  const { list, changes } = await loaded([saved('ah-1', 'zon'), saved('dirk-2', 'zon')], { fail: true });
  const before = list.products();
  const result = await list.toggleGroupPause('zon');
  assert.deepEqual(result.failed.map(f => f.id), ['ah-1', 'dirk-2']);
  assert.deepEqual(result.updated, []);
  assert.equal(list.products(), before);
  assert.equal(changes(), 1);
});
