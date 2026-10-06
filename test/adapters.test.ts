import { after, before, test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ah } from '../src/stores/ah.ts';
import { dirk } from '../src/stores/dirk.ts';
import { kruidvat } from '../src/stores/kruidvat.ts';
import { trekpleister } from '../src/stores/trekpleister.ts';
import { createApp } from '../src/app.ts';
import { useTempDataDir } from './tempDataDir.ts';
import type { SavedProduct } from '../src/types.ts';

// Raw responses; see fixtures/README.md. `any`, as the adapters' own
// `res.json()` is before its cast.
async function fixture(name: string): Promise<any> {
  return JSON.parse(await readFile(new URL(`fixtures/${name}`, import.meta.url), 'utf-8'));
}

/**
 * Stubs fetch for one test: each store request goes to `answer`, which gives
 * the body (sent as JSON) or a Response; anything else (the test's own server)
 * goes out.
 */
const realFetch = globalThis.fetch;
function stubStore(t: TestContext, host: string, answer: (url: string, init?: RequestInit) => unknown): string[] {
  const urls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith(host)) return realFetch(input, init);
    urls.push(url);
    const body = await answer(url, init);
    return body instanceof Response ? body : Response.json(body);
  });
  return urls;
}

const notFound = () => new Response(null, { status: 404 });

/** AH: the anonymous token, the search fixture and details by webshopId. */
function stubAH(t: TestContext, details: Record<string, unknown>): string[] {
  return stubStore(t, 'https://api.ah.nl/', url => {
    if (url.includes('/auth/token/')) return { access_token: 'token', expires_in: 3600 };
    if (url.includes('/product/search/')) return fixture('ah-search.json');
    const id = url.match(/\/product\/detail\/v4\/fir\/(.+)$/)?.[1] ?? '';
    return id in details ? details[id] : notFound();
  });
}

test('AH search: a bonus priced by its bonus mechanism; no bonus means no before price; online-only left out', async (t) => {
  stubAH(t, {});
  const [melk, koffie, ...rest] = await ah.searchProducts('melk');
  assert.deepEqual(rest, []);

  assert.deepEqual(melk, {
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

  assert.equal(koffie.productId, '123456');
  assert.equal(koffie.isBonus, false);
  assert.equal(koffie.bonusMechanism, '');
  assert.equal(koffie.currentPrice, 7.49);
  assert.equal(koffie.priceBeforeBonus, null);
  assert.equal(koffie.bonusStartDate, '');
  assert.equal(koffie.bonusEndDate, '');
  assert.equal(koffie.imageUrl, null);
});

test('AH detail: unwrapped from productCard, or the body itself; an online-only bonus is no bonus', async (t) => {
  const online = (await fixture('ah-search.json')).products[2];
  const urls = stubAH(t, { '588920': await fixture('ah-detail.json'), '777': online });

  const product = await ah.getProductDetail('588920');
  assert.equal(product?.productId, '588920');
  assert.equal(product?.title, 'AH Pindakaas');
  assert.equal(product?.bonusMechanism, '2 voor 5 euro');
  assert.equal(product?.priceBeforeBonus, 2.99);
  assert.equal(product?.currentPrice, 2.5);
  assert.equal(product?.bonusStartDate, '2026-09-21');
  assert.equal(product?.bonusEndDate, '2026-09-27');
  assert.ok(urls.includes('https://api.ah.nl/mobile-services/product/detail/v4/fir/588920'));

  const onlineOnly = await ah.getProductDetail('777');
  assert.equal(onlineOnly?.isOnlineOnly, true);
  assert.equal(onlineOnly?.isBonus, false);
  assert.equal(onlineOnly?.bonusMechanism, '');
  assert.equal(onlineOnly?.priceBeforeBonus, null);
  assert.equal(onlineOnly?.currentPrice, 10);
});

test('AH detail: an unknown product is null; another failure throws', async (t) => {
  stubAH(t, { '500': new Response(null, { status: 500 }) });
  assert.equal(await ah.getProductDetail('404'), null);
  await assert.rejects(ah.getProductDetail('500'), /AH API error: 500/);
});

/**
 * Dirk's GraphQL gateway: search ids, the listProducts and assortment
 * fixtures, and a single product by id from listProducts. `assortment`
 * replaces the assortment fixture.
 */
function stubDirk(t: TestContext, assortment?: unknown): string[] {
  const queries: string[] = [];
  stubStore(t, 'https://web-gateway.dirk.nl/', async (url, init) => {
    assert.equal(url, 'https://web-gateway.dirk.nl/graphql');
    const { query } = JSON.parse(init?.body as string);
    queries.push(query);
    const listProducts = await fixture('dirk-list-products.json');
    if (query.includes('newSearchProducts')) {
      return { data: { newSearchProducts: listProducts.data.listProducts.products.map((p: any) => ({ productId: p.productId })) } };
    }
    if (query.includes('productAssortment')) return assortment ?? fixture('dirk-assortment.json');
    if (query.includes('listProducts')) return listProducts;
    const id = Number(query.match(/product\(productId: (\d+)\)/)?.[1]);
    return { data: { product: listProducts.data.listProducts.products.find((p: any) => p.productId === id) ?? null } };
  });
  return queries;
}

test('Dirk search: offerPrice is the bonus price; no offer means the normal price', async (t) => {
  stubDirk(t);
  const [cola, brood] = await dirk.searchProducts('cola');

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

test('Dirk detail: a product without assortment has no price; an unknown product is null', async (t) => {
  stubDirk(t, { data: { p0: null } });
  const product = await dirk.getProductDetail('101');
  assert.equal(product?.title, 'Coca-Cola Regular');
  assert.equal(product?.currentPrice, null);
  assert.equal(product?.isBonus, false);

  assert.equal(await dirk.getProductDetail('999'), null);
  assert.equal(await dirk.getProductDetail('geen-id'), null);
});

function savedDirk(storeProductId: string): SavedProduct {
  return {
    id: `dirk-${storeProductId}`, store: 'dirk', storeProductId, title: '', brand: '', salesUnitSize: '',
    mainCategory: '', subCategory: '', imageUrl: '', addedAt: '2026-01-01T00:00:00.000Z',
  };
}

test('Dirk observe: every found saved product, on offer or not; the rest in notFound', async (t) => {
  // The fixtures answer the batch queries: assortment for 101 and 202 only
  // (none for 303), then the details of the products that have one.
  const queries = stubDirk(t);

  const { observed, notFound } = await dirk.observe(
    [savedDirk('101'), savedDirk('202'), savedDirk('303'), savedDirk('geen-id')],
  );

  assert.deepEqual(observed.map(p => [p.savedId, p.productId, p.isBonus, p.currentPrice]), [
    ['dirk-101', '101', true, 1.79],
    ['dirk-202', '202', false, 1.99],
  ]);
  assert.deepEqual(notFound.sort(), ['dirk-303', 'dirk-geen-id']);
  assert.equal(queries.length, 2);
  assert.match(queries[0], /productAssortment\(productId: 303/);
  assert.match(queries[1], /listProducts\(productIds: \[101,202\]\)/);
  assert.deepEqual(observed.filter(p => p.isBonus).map(p => p.savedId), ['dirk-101']);
});

test('Dirk observe: no valid ids means no request', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', () => Promise.reject(new Error('no request expected')));
  assert.deepEqual(await dirk.observe([savedDirk('x')]), { observed: [], notFound: ['dirk-x'] });
  assert.equal(fetch.mock.callCount(), 0);
});

/**
 * The SAP Commerce API of one site: search from a fixture, details by product
 * code (404 for any other code), each a raw product or a Response.
 */
function stubSap(t: TestContext, siteId: string, search: string, details: Record<string, unknown>): string[] {
  const prefix = `https://app.kruidvat.nl/api/v2/${siteId}/`;
  return stubStore(t, 'https://app.kruidvat.nl/', url => {
    assert.ok(url.startsWith(prefix), url);
    if (url.startsWith(`${prefix}search?`)) return fixture(search);
    const code = decodeURIComponent(url.match(/\/products\/([^?]+)\?fields=FULL&lang=nl$/)?.[1] ?? '');
    return code in details ? details[code] : notFound();
  });
}

test('Kruidvat search: a bonus priced by its mechanism, the primary image made absolute', async (t) => {
  const urls = stubSap(t, 'kvn-spa', 'kruidvat-search.json', {});
  const [tandpasta] = await kruidvat.searchProducts('tand pasta');
  assert.deepEqual(tandpasta, {
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
  assert.deepEqual(urls, ['https://app.kruidvat.nl/api/v2/kvn-spa/search?fields=FULL&lang=nl&query=tand%20pasta']);
});

test('Kruidvat search: a "gratis artikel" promotion is not a bonus and keeps no dates; a missing price stays null', async (t) => {
  stubSap(t, 'kvn-spa', 'kruidvat-search.json', {});
  const [, s, w] = await kruidvat.searchProducts('shampoo');

  assert.equal(s.isBonus, false);
  assert.equal(s.bonusMechanism, '');
  assert.equal(s.priceBeforeBonus, null);
  assert.equal(s.bonusStartDate, '');
  assert.equal(s.bonusEndDate, '');
  assert.equal(s.currentPrice, 4.99);
  assert.equal(s.imageUrl, 'https://cdn.kruidvat.nl/shampoo.jpg');

  assert.equal(w.currentPrice, null);
  assert.equal(w.title, 'Kruidvat Wattenschijfjes');
  assert.equal(w.imageUrl, null);
});

test('Kruidvat detail: the product by its code; an unknown product is null; another failure throws', async (t) => {
  const [tandpasta] = (await fixture('kruidvat-search.json')).products;
  const urls = stubSap(t, 'kvn-spa', 'kruidvat-search.json', {
    '2780321': tandpasta,
    'kapot': new Response(null, { status: 500 }),
  });
  const product = await kruidvat.getProductDetail('2780321');
  assert.equal(product?.productId, '2780321');
  assert.equal(product?.bonusMechanism, '1+1 gratis');
  assert.equal(product?.currentPrice, 1.25);
  assert.equal(urls[0], 'https://app.kruidvat.nl/api/v2/kvn-spa/products/2780321?fields=FULL&lang=nl');

  assert.equal(await kruidvat.getProductDetail('0000000'), null);
  await assert.rejects(kruidvat.getProductDetail('kapot'), /Kruidvat API error: 500/);
});

/** Trekpleister details: each detail fixture under its own product code. */
async function trekpleisterDetails(): Promise<Record<string, unknown>> {
  const details: Record<string, unknown> = {};
  for (const name of ['detail', 'detail-no-promotion', 'detail-gratis-artikel', 'detail-percentage']) {
    const product = await fixture(`trekpleister-${name}.json`);
    details[product.code] = product;
  }
  return details;
}

test('Trekpleister detail: a promotion title gives the mechanism without the brand, priced by it', async (t) => {
  stubSap(t, 'kvtp', 'trekpleister-search.json', await trekpleisterDetails());
  assert.deepEqual(await trekpleister.getProductDetail('4567890'), {
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

test('Trekpleister detail: without a promotion title, or with a "gratis artikel" one, it is not a bonus', async (t) => {
  stubSap(t, 'kvtp', 'trekpleister-search.json', await trekpleisterDetails());

  const p = await trekpleister.getProductDetail('4567891');
  assert.equal(p?.isBonus, false);
  assert.equal(p?.bonusMechanism, '');
  assert.equal(p?.priceBeforeBonus, null);
  assert.equal(p?.currentPrice, 1.19);
  assert.equal(p?.bonusStartDate, '');
  assert.equal(p?.bonusEndDate, '');

  const gratis = await trekpleister.getProductDetail('4567892');
  assert.equal(gratis?.isBonus, false);
  assert.equal(gratis?.bonusMechanism, '');
  assert.equal(gratis?.priceBeforeBonus, null);
  assert.equal(gratis?.currentPrice, 4.99);
});

test('Trekpleister detail: a title without a mechanism falls back to the percentage reward', async (t) => {
  stubSap(t, 'kvtp', 'trekpleister-search.json', await trekpleisterDetails());
  const p = await trekpleister.getProductDetail('4567893');
  assert.equal(p?.isBonus, true);
  assert.equal(p?.bonusMechanism, '25%');
  assert.equal(p?.priceBeforeBonus, 3.49);
  assert.equal(p?.currentPrice, 2.62);
  assert.equal(p?.bonusEndDate, '2026-10-11T23:59:59+0200');
});

test('Trekpleister detail: an unknown product is null; another failure throws', async (t) => {
  stubSap(t, 'kvtp', 'trekpleister-search.json', { 'kapot': new Response(null, { status: 503 }) });
  assert.equal(await trekpleister.getProductDetail('4567899'), null);
  await assert.rejects(trekpleister.getProductDetail('kapot'), /Trekpleister API error: 503/);
});

test('Trekpleister search: results carry a promotion stub, so none is a bonus', async (t) => {
  const urls = stubSap(t, 'kvtp', 'trekpleister-search.json', {});
  const [aquafresh, watten] = await trekpleister.searchProducts('tand pasta');
  assert.deepEqual(aquafresh, {
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
  assert.equal(watten.isBonus, false);
  assert.equal(watten.imageUrl, 'https://cdn.trekpleister.nl/wattenstaafjes.jpg');
  assert.deepEqual(urls, ['https://app.kruidvat.nl/api/v2/kvtp/search?fields=FULL&lang=nl&query=tand%20pasta']);
});

// GET /api/product/:store/:id over the real adapters, the stores answering 404.
await useTempDataDir();
let server: Server;
let base: string;

before(async () => {
  server = createApp({ stores: { ah, kruidvat, trekpleister }, idleShutdown: { enabled: false }, grocerUrl: null }).app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}/api`;
});

after(() => new Promise(resolve => server.close(resolve)));

test('route: an unknown product answers 404 in AH, Kruidvat and Trekpleister', async (t) => {
  stubAH(t, {});
  const res = await realFetch(`${base}/product/ah/404404`);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'Product not found' });

  t.mock.restoreAll();
  stubSap(t, 'kvn-spa', 'kruidvat-search.json', {});
  assert.equal((await realFetch(`${base}/product/kruidvat/0000000`)).status, 404);

  t.mock.restoreAll();
  stubSap(t, 'kvtp', 'trekpleister-search.json', {});
  assert.equal((await realFetch(`${base}/product/trekpleister/0000000`)).status, 404);
});
