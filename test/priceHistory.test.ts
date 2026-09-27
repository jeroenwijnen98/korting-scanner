import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { recordSnapshot, recordSnapshots, getHistory } from '../src/services/priceHistory.ts';
import * as productStore from '../src/services/productStore.ts';
import { useTempDataDir } from './tempDataDir.ts';

const dir = await useTempDataDir();

beforeEach(async () => {
  await rm(join(dir, 'price-history.json'), { force: true });
  await rm(join(dir, 'products.json'), { force: true });
});

const base = { currentPrice: 2.5, priceBeforeBonus: null, isBonus: false, bonusMechanism: '' };

test('an identical snapshot is not appended', async () => {
  await recordSnapshot('ah-1', base);
  await recordSnapshot('ah-1', { ...base });
  // priceBeforeBonus is not part of the dedup
  await recordSnapshot('ah-1', { ...base, priceBeforeBonus: 3 });
  assert.equal((await getHistory('ah-1')).length, 1);
});

test('a change in price, bonus flag or bonus mechanism is appended, newest first', async () => {
  await recordSnapshot('ah-1', base);
  await recordSnapshot('ah-1', { ...base, currentPrice: 2 });
  await recordSnapshot('ah-1', { ...base, currentPrice: 2, isBonus: true });
  await recordSnapshot('ah-1', { ...base, currentPrice: 2, isBonus: true, bonusMechanism: '25%' });

  const history = await getHistory('ah-1');
  assert.deepEqual(
    history.map(s => [s.currentPrice, s.isBonus, s.bonusMechanism]),
    [[2, true, '25%'], [2, true, ''], [2, false, ''], [2.5, false, '']],
  );
  assert.match(history[0].date, /^\d{4}-\d{2}-\d{2}$/);
});

test('a product without history gives an empty list', async () => {
  assert.deepEqual(await getHistory('ah-unknown'), []);
});

test('recordSnapshots records several products in one go', async () => {
  await recordSnapshots([
    { productId: 'ah-1', data: base },
    { productId: 'dirk-2', data: { ...base, currentPrice: 1 } },
  ]);
  assert.equal((await getHistory('ah-1')).length, 1);
  assert.equal((await getHistory('dirk-2'))[0].currentPrice, 1);
});

// Regression for #13: overlapping writes each read the same old file, and the
// last write won.
test('concurrent snapshots are all kept', async () => {
  const ids = Array.from({ length: 20 }, (_, i) => `ah-${i}`);
  await Promise.all(ids.map(id => recordSnapshot(id, base)));

  const onDisk = JSON.parse(await readFile(join(dir, 'price-history.json'), 'utf-8'));
  assert.deepEqual(Object.keys(onDisk).sort(), [...ids].sort());
});

test('concurrent saves of saved products are all kept', async () => {
  const ids = Array.from({ length: 20 }, (_, i) => String(i));
  await Promise.all(ids.map(id => productStore.add({ store: 'ah', storeProductId: id, title: `P${id}` })));
  assert.equal((await productStore.getAll()).length, 20);
});
