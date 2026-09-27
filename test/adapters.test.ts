import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ah } from '../src/stores/ah.ts';
import { dirk } from '../src/stores/dirk.ts';
import { kruidvat } from '../src/stores/kruidvat.ts';

// Raw responses; see fixtures/README.md. `any`, as the adapters' own
// `res.json()` is before its cast.
async function fixture(name: string): Promise<any> {
  return JSON.parse(await readFile(new URL(`fixtures/${name}`, import.meta.url), 'utf-8'));
}

test('AH: a bonus from a search result, priced by its bonus mechanism', async () => {
  const [melk, koffie, online] = (await fixture('ah-search.json')).products;

  assert.deepEqual(ah.normalize(melk), {
    productId: '588920', // webshopId, not hqId (0 for bundles)
    title: 'AH Halfvolle melk',
    salesUnitSize: '1,5 l',
    bonusMechanism: '1+1 gratis',
    priceBeforeBonus: 1.8,
    currentPrice: 0.9,
    bonusStartDate: '2026-09-21',
    bonusEndDate: '2026-09-27',
    mainCategory: 'Zuivel, eieren',
    subCategory: 'Melk',
    brand: 'AH',
    isBonus: true,
    imageUrl: 'https://static.ah.nl/melk.jpg',
    isOnlineOnly: false,
    store: 'ah',
  });

  const plain = ah.normalize(koffie);
  assert.equal(plain.productId, '123456');
  assert.equal(plain.isBonus, false);
  assert.equal(plain.bonusMechanism, '');
  assert.equal(plain.currentPrice, 7.49);
  assert.equal(plain.priceBeforeBonus, 7.49);
  assert.equal(plain.imageUrl, null);

  assert.equal(ah.normalize(online).isOnlineOnly, true);
});

test('AH: a detail, unwrapped from productCard', async () => {
  const { productCard } = await fixture('ah-detail.json');
  const product = ah.normalize(productCard);
  assert.equal(product.productId, '588920');
  assert.equal(product.bonusMechanism, '2 voor 5 euro');
  assert.equal(product.priceBeforeBonus, 2.99);
  assert.equal(product.currentPrice, 2.5);
  assert.equal(product.bonusStartDate, '2026-09-21');
  assert.equal(product.bonusEndDate, '2026-09-27');
});

test('Dirk: offerPrice is the bonus price; no offer means the normal price', async () => {
  const products = (await fixture('dirk-list-products.json')).data.listProducts.products;
  const assortments = Object.values((await fixture('dirk-assortment.json')).data) as any[];
  const assortmentOf = (id: number) => assortments.find(a => a.productId === id);
  const [cola, brood] = products.map((p: any) => dirk.normalizeProduct(p, assortmentOf(p.productId)));

  assert.deepEqual(cola, {
    productId: '101',
    title: 'Coca-Cola Regular',
    salesUnitSize: 'Fles 1,5 liter',
    bonusMechanism: '2 VOOR 3,58',
    priceBeforeBonus: 2.49,
    currentPrice: 1.79,
    bonusStartDate: '2026-09-23',
    bonusEndDate: '2026-09-29',
    mainCategory: 'Frisdrank, sappen',
    subCategory: 'Cola',
    brand: 'Coca-Cola',
    isBonus: true,
    imageUrl: 'https://web-fileserver.dirk.nl/artikelen%2F101%20cola.png',
    store: 'dirk',
  });

  assert.equal(brood.isBonus, false);
  assert.equal(brood.bonusMechanism, '');
  assert.equal(brood.priceBeforeBonus, null);
  assert.equal(brood.currentPrice, 1.99);
  assert.equal(brood.brand, '');
  assert.equal(brood.imageUrl, null);
});

test('Dirk: a product without assortment has no price', async () => {
  const [cola] = (await fixture('dirk-list-products.json')).data.listProducts.products;
  const product = dirk.normalizeProduct(cola, undefined);
  assert.equal(product.currentPrice, null);
  assert.equal(product.isBonus, false);
});

test('Kruidvat: a bonus priced by its mechanism, the primary image made absolute', async () => {
  const [tandpasta] = (await fixture('kruidvat-search.json')).products;
  assert.deepEqual(kruidvat.normalize(tandpasta), {
    productId: '2780321',
    title: 'Kruidvat Tandpasta Fresh',
    salesUnitSize: '75 ml',
    bonusMechanism: '1+1 gratis',
    priceBeforeBonus: 2.49,
    currentPrice: 1.25,
    bonusStartDate: '2026-09-22',
    bonusEndDate: '2026-10-05',
    mainCategory: 'Verzorging',
    subCategory: 'Mondverzorging',
    brand: 'Kruidvat',
    isBonus: true,
    imageUrl: 'https://www.kruidvat.nl/medias/primary.jpg',
    store: 'kruidvat',
  });
});

test('Kruidvat: a "gratis artikel" promotion is not a bonus; a missing price stays null', async () => {
  const [, shampoo, watten] = (await fixture('kruidvat-search.json')).products;

  const s = kruidvat.normalize(shampoo);
  assert.equal(s.isBonus, false);
  assert.equal(s.bonusMechanism, '');
  assert.equal(s.priceBeforeBonus, null);
  assert.equal(s.currentPrice, 4.99);
  assert.equal(s.imageUrl, 'https://cdn.kruidvat.nl/shampoo.jpg');

  const w = kruidvat.normalize(watten);
  assert.equal(w.currentPrice, null);
  assert.equal(w.title, 'Kruidvat Wattenschijfjes');
  assert.equal(w.imageUrl, null);
});
