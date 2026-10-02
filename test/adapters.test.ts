import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ah } from '../src/stores/ah.ts';
import { dirk } from '../src/stores/dirk.ts';
import { kruidvat } from '../src/stores/kruidvat.ts';
import { trekpleister } from '../src/stores/trekpleister.ts';
import type { SavedProduct } from '../src/types.ts';

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

function savedDirk(storeProductId: string): SavedProduct {
  return {
    id: `dirk-${storeProductId}`, store: 'dirk', storeProductId, title: '', brand: '', salesUnitSize: '',
    mainCategory: '', subCategory: '', imageUrl: '', addedAt: '2026-01-01T00:00:00.000Z',
  };
}

test('Dirk observe: every found saved product, on offer or not; the rest in notFound', async (t) => {
  const listProducts = await fixture('dirk-list-products.json');
  const assortment = await fixture('dirk-assortment.json');
  const queries: string[] = [];
  // The fixtures answer the batch queries: assortment for 101 and 202 only
  // (none for 303), then the details of the products that have one.
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://web-gateway.dirk.nl/graphql');
    const { query } = JSON.parse(init.body as string);
    queries.push(query);
    if (query.includes('productAssortment')) {
      assert.match(query, /productId: 303/);
      return Response.json(assortment);
    }
    assert.match(query, /listProducts\(productIds: \[101,202\]\)/);
    return Response.json(listProducts);
  });

  const { observed, notFound } = await dirk.observe(
    [savedDirk('101'), savedDirk('202'), savedDirk('303'), savedDirk('geen-id')],
  );

  assert.deepEqual(observed.map(p => [p.savedId, p.productId, p.isBonus, p.currentPrice]), [
    ['dirk-101', '101', true, 1.79],
    ['dirk-202', '202', false, 1.99],
  ]);
  assert.deepEqual(notFound.sort(), ['dirk-303', 'dirk-geen-id']);
  assert.equal(queries.length, 2);
  assert.deepEqual(observed.filter(p => dirk.countsAsBonus(p)).map(p => p.savedId), ['dirk-101']);
});

test('Dirk observe: no valid ids means no request', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('no request expected');
  });
  assert.deepEqual(await dirk.observe([savedDirk('x')]), { observed: [], notFound: ['dirk-x'] });
  assert.equal(fetch.mock.callCount(), 0);
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

test('Trekpleister: a detail promotion title gives the mechanism without the brand, priced by it', async () => {
  assert.deepEqual(trekpleister.normalize(await fixture('trekpleister-detail.json')), {
    productId: '4567890',
    title: 'Aquafresh Tandpasta Triple Protection',
    salesUnitSize: '75 ml',
    bonusMechanism: '2+2 gratis',
    priceBeforeBonus: 2.39,
    currentPrice: 1.2,
    bonusStartDate: '2026-09-28T00:00:00+0200',
    bonusEndDate: '2026-10-11T23:59:59+0200',
    mainCategory: 'Verzorging',
    subCategory: 'Mondverzorging',
    brand: 'Aquafresh',
    isBonus: true,
    imageUrl: 'https://www.trekpleister.nl/medias/aquafresh-primary.jpg',
    store: 'trekpleister',
  });
});

test('Trekpleister: a detail without a promotion title is not a bonus', async () => {
  const p = trekpleister.normalize(await fixture('trekpleister-detail-no-promotion.json'));
  assert.equal(p.isBonus, false);
  assert.equal(p.bonusMechanism, '');
  assert.equal(p.priceBeforeBonus, null);
  assert.equal(p.currentPrice, 1.19);
  assert.equal(p.bonusStartDate, '');
  assert.equal(p.bonusEndDate, '');
});

test('Trekpleister: a "gratis artikel" promotion is not a bonus', async () => {
  const p = trekpleister.normalize(await fixture('trekpleister-detail-gratis-artikel.json'));
  assert.equal(p.isBonus, false);
  assert.equal(p.bonusMechanism, '');
  assert.equal(p.priceBeforeBonus, null);
  assert.equal(p.currentPrice, 4.99);
});

test('Trekpleister: a title without a mechanism falls back to the percentage reward', async () => {
  const p = trekpleister.normalize(await fixture('trekpleister-detail-percentage.json'));
  assert.equal(p.isBonus, true);
  assert.equal(p.bonusMechanism, '25%');
  assert.equal(p.priceBeforeBonus, 3.49);
  assert.equal(p.currentPrice, 2.62);
  assert.equal(p.bonusEndDate, '2026-10-11T23:59:59+0200');
});

test('Trekpleister: search results carry a promotion stub, so none is a bonus', async () => {
  const [aquafresh, watten] = (await fixture('trekpleister-search.json')).products;
  assert.deepEqual(trekpleister.normalize(aquafresh), {
    productId: '4567890',
    title: 'Aquafresh Tandpasta Triple Protection',
    salesUnitSize: '75 ml',
    bonusMechanism: '',
    priceBeforeBonus: null,
    currentPrice: 2.39,
    bonusStartDate: '',
    bonusEndDate: '',
    mainCategory: 'Verzorging',
    subCategory: 'Mondverzorging',
    brand: 'Aquafresh',
    isBonus: false,
    imageUrl: 'https://www.trekpleister.nl/medias/aquafresh-primary.jpg',
    store: 'trekpleister',
  });
  const w = trekpleister.normalize(watten);
  assert.equal(w.isBonus, false);
  assert.equal(w.imageUrl, 'https://cdn.trekpleister.nl/wattenstaafjes.jpg');
});

test('Trekpleister: search and detail use the kvtp site on the Kruidvat app host', async t => {
  const urls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    urls.push(String(url));
    const body = url.includes('/search') ? await fixture('trekpleister-search.json') : await fixture('trekpleister-detail.json');
    return new Response(JSON.stringify(body));
  });
  const results = await trekpleister.searchProducts('tand pasta');
  assert.deepEqual(results.map(p => p.isBonus), [false, false]);
  assert.equal((await trekpleister.getProductDetail('4567890')).bonusMechanism, '2+2 gratis');
  assert.deepEqual(urls, [
    'https://app.kruidvat.nl/api/v2/kvtp/search?fields=FULL&lang=nl&query=tand%20pasta',
    'https://app.kruidvat.nl/api/v2/kvtp/products/4567890?fields=FULL&lang=nl',
  ]);
});
