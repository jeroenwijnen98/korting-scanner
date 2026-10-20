import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSavedProductDetail } from '../src/services/savedProductDetail.ts';
import * as productStore from '../src/services/productStore.ts';
import { useTempDataDir } from './tempDataDir.ts';
import { BrokenStore, FakeStore, product } from './fakeStore.ts';

await useTempDataDir();

const ah = new FakeStore('ah', [product('ah', '1', { title: 'Koffie', currentPrice: 6 })]);
const dirk = new BrokenStore('dirk');

const cases = [
  { name: 'an observed product carries it', storeProductId: '1', store: 'ah', check: { status: 'observed' }, title: 'Koffie' },
  { name: 'a product the store no longer knows is gone', storeProductId: '2', store: 'ah', check: { status: 'gone' }, title: null },
  { name: 'a store that fails is store down, with the store', storeProductId: '3', store: 'dirk', check: { status: 'storeDown', store: 'dirk' }, title: null },
] as const;

for (const c of cases) {
  test(`the saved-product detail: ${c.name}`, async () => {
    const added = await productStore.add({ store: c.store, storeProductId: c.storeProductId, title: 'Opgeslagen' });
    assert.ok(added);

    const detail = await getSavedProductDetail({ ah, dirk }, added.id);

    assert.deepEqual(detail?.check, c.check);
    assert.equal(detail?.product?.title ?? null, c.title);
    // The saved fields come along whatever the check said
    assert.equal(detail?.saved.id, added.id);
    assert.equal(detail?.saved.title, 'Opgeslagen');
  });
}

test('the saved-product detail: an unknown saved id has none', async () => {
  assert.equal(await getSavedProductDetail({ ah, dirk }, 'ah-404'), null);
});
