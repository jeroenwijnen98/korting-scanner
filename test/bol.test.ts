import { after, before, test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { bol, pageData, type BolRawProduct } from '../src/stores/bol.ts';
import { createApp } from '../src/app.ts';
import { useTempDataDir } from './tempDataDir.ts';
import type { SavedProduct } from '../src/types.ts';

// bol pages; see fixtures/README.md.
async function page(name: string): Promise<string> {
  const file = new URL(`fixtures/${name}`, import.meta.url);
  return name.endsWith('.gz') ? gunzipSync(await readFile(file)).toString('utf-8') : readFile(file, 'utf-8');
}

const PRODUCT_PAGES: Record<string, string> = {
  '9300000238030673': 'bol-product-deal-meestal.html',
  '9300000157956429': 'bol-product-deal-adviesprijs.html',
  '9200000011447768': 'bol-product-no-bonus.html',
  '9300000127503207': 'bol-product-outlet.html',
  '9200000104617870': 'bol-product-no-offer.html',
  // A merged listing: bol answers the old id with the product it was merged into.
  '9300000000000042': 'bol-product-deal-meestal.html',
};

/** Answers bol.com requests from the fixtures (404 for unknown ids); anything else goes out. */
const realFetch = globalThis.fetch;
async function bolFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = String(input);
  if (!url.startsWith('https://www.bol.com/')) return realFetch(input, init);
  if (url.startsWith('https://www.bol.com/nl/nl/s/?searchtext=')) return new Response(await page('bol-search.html'));
  const id = url.match(/^https:\/\/www\.bol\.com\/nl\/nl\/p\/x\/(\d+)\/$/)?.[1];
  const file = id && PRODUCT_PAGES[id];
  return file ? new Response(await page(file)) : new Response('<html></html>', { status: 404 });
}

/** React Router's turbo-stream encoding of `value`: the inverse of the adapter's decoder. */
function encodeTurboStream(value: unknown): unknown[] {
  const values: unknown[] = [];
  function put(v: unknown): number {
    if (v === undefined) return -1;
    if (v === null) return -5;
    const index = values.length;
    if (typeof v !== 'object') {
      values.push(v);
      return index;
    }
    values.push(null);
    if (Array.isArray(v)) {
      values[index] = v.map(put);
    } else {
      const out: Record<string, number> = {};
      for (const [key, x] of Object.entries(v)) out[`_${put(key)}`] = put(x);
      values[index] = out;
    }
    return index;
  }
  put(value);
  return values;
}

/** A product page for `product`, in the shape bol serves it. */
function productPage(product: BolRawProduct): string {
  const stream = JSON.stringify(encodeTurboStream({ loaderData: { 'routes/product': { content: { productPageData: { product } } } } }));
  return `<script>window.__reactRouterContext.streamController.enqueue(${JSON.stringify(`${stream}\n`)});</script>`;
}

/** The raw product on a fixture page. */
async function rawProduct(name: string): Promise<BolRawProduct> {
  return pageData(await page(name))['routes/product'].content.productPageData.product;
}

/** The adapter's product for `product`, served as its product page. */
async function detailOf(t: TestContext, product: BolRawProduct) {
  t.mock.method(globalThis, 'fetch', async () => new Response(productPage(product)));
  const detail = await bol.getProductDetail(product.id);
  t.mock.restoreAll();
  assert.ok(detail);
  return detail;
}

function savedBol(storeProductId: string): SavedProduct {
  return {
    id: `bol-${storeProductId}`, store: 'bol', storeProductId, title: '', brand: '', salesUnitSize: '',
    mainCategory: '', subCategory: '', imageUrl: '', addedAt: '2026-01-01T00:00:00.000Z',
  };
}

test('bol: a deal with a "Meestal" price is a bonus, priced before at "Meestal"', async (t) => {
  t.mock.method(globalThis, 'fetch', bolFetch);
  assert.deepEqual(await bol.getProductDetail('9300000238030673'), {
    productId: '9300000238030673',
    title: 'Dubbele Airfryer XXL 9L - 2×4.5L - 3200W - 11 Programma’s - Smart Finish & Match Cook - 60–200°C Instelbaar - PFAS-vrij - Vaatwasserbestendige Manden - COOK-IT',
    salesUnitSize: '9 l',
    bonusMechanism: 'deal',
    priceBeforeBonus: 69.99,
    currentPrice: 64.95,
    bonusStartDate: '',
    bonusEndDate: '',
    mainCategory: 'Elektronica',
    subCategory: 'Keukenapparaten',
    brand: 'Media Evolution',
    isBonus: true,
    imageUrl: 'https://media.s-bol.com/RAO9XX3qrGjL/3lO93vQ/168x163.jpg',
    store: 'bol',
  });
});

test('bol: a deal with only an adviesprijs is a bonus without a price before', async (t) => {
  t.mock.method(globalThis, 'fetch', bolFetch);
  const lego = await bol.getProductDetail('9300000157956429');
  assert.equal(lego?.isBonus, true);
  assert.equal(lego?.bonusMechanism, 'deal');
  assert.equal(lego?.currentPrice, 39.99);
  assert.equal(lego?.priceBeforeBonus, null); // the adviesprijs (59.99) never is
});

test('bol: no discount label is no bonus; the size comes from the "Inhoud" spec', async (t) => {
  t.mock.method(globalThis, 'fetch', bolFetch);
  const koffie = await bol.getProductDetail('9200000011447768');
  assert.equal(koffie?.isBonus, false);
  assert.equal(koffie?.bonusMechanism, '');
  assert.equal(koffie?.priceBeforeBonus, null);
  assert.equal(koffie?.currentPrice, 24.95);
  assert.equal(koffie?.salesUnitSize, '1.02 kg');
  assert.equal(koffie?.brand, 'Lavazza');
});

test('bol: Outlet is never a bonus, nor an adviesprijs on its own', async (t) => {
  t.mock.method(globalThis, 'fetch', bolFetch);
  const outlet = await bol.getProductDetail('9300000127503207');
  assert.equal(outlet?.isBonus, false);
  assert.equal(outlet?.bonusMechanism, '');
  assert.equal(outlet?.currentPrice, 7.55);
  assert.equal(outlet?.salesUnitSize, ''); // no "Inhoud" spec
});

test('bol: without an "Inhoud" spec, the size is the piece count', async (t) => {
  const product = await rawProduct('bol-product-outlet.html');
  const pieces = async (specifications: BolRawProduct['specifications']) => (await detailOf(t, { ...product, specifications })).salesUnitSize;
  assert.equal(await pieces({ groups: [{ attributes: [{ key: 'Number Pieces In Package', name: 'Aantal artikelen in verpakking', textValues: ['4 stuk(s)'] }] }] }), '4 stuks');
  assert.equal(await pieces({ detailedSummary: { attributes: [{ textValues: ['1 mesjes'] }, { textValues: ['3 stuk(s)'] }] } }), '3 stuks');
  assert.equal(await pieces({ detailedSummary: { attributes: [{ textValues: ['1 stuk(s)'] }] } }), '1 stuk');
  assert.equal(await pieces({
    groups: [{ attributes: [{ key: 'Number Pieces In Package', textValues: ['2 stuk(s)'] }, { name: 'Inhoud', textValues: ['500 ml'] }] }],
  }), '500 ml');
});

test('bol: a redirected id is the product the page shows', async (t) => {
  t.mock.method(globalThis, 'fetch', bolFetch);
  const merged = await bol.getProductDetail('9300000000000042');
  assert.equal(merged?.productId, '9300000238030673');
  assert.equal(merged?.currentPrice, 64.95);
});

test('bol: "in prijs verlaagd" is a bonus; other discount labels are not', async (t) => {
  const product = await rawProduct('bol-product-deal-meestal.html');
  const labelled = (titleText: string) => detailOf(t, {
    ...product,
    bestSellingOffer: { ...product.bestSellingOffer, promotionalLabels: [{ __typename: 'DiscountLabel', titleText }] },
  });
  const verlaagd = await labelled('in prijs verlaagd');
  assert.deepEqual([verlaagd.isBonus, verlaagd.bonusMechanism], [true, 'in prijs verlaagd']);
  for (const label of ['Outlet', 'Select-deal', '10% korting op vervangmesjes', 'tot 50,- cashback']) {
    assert.equal((await labelled(label)).isBonus, false, label);
  }
});

test('bol: without a label field, a "Meestal" price above the current one is a bonus', async (t) => {
  const product = await rawProduct('bol-product-deal-meestal.html');
  const { promotionalLabels, ...offer } = product.bestSellingOffer!;
  const unlabelled = await detailOf(t, { ...product, bestSellingOffer: offer });
  assert.equal(unlabelled.isBonus, true);
  assert.equal(unlabelled.bonusMechanism, 'in prijs verlaagd');
  assert.equal(unlabelled.priceBeforeBonus, 69.99);

  const above = await detailOf(t, { ...product, bestSellingOffer: { ...offer, sellingPrice: { price: { amount: '70.00' } } } });
  assert.equal(above.isBonus, false);
});

test('bol: the real page gives the same product as its trimmed fixture', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(await page('bol-product-deal-meestal.real.html.gz')));
  const real = await bol.getProductDetail('9300000238030673');
  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', bolFetch);
  assert.ok(real);
  assert.deepEqual(real, await bol.getProductDetail('9300000238030673'));
});

test('bol observe: no buy box or an unknown id puts the saved product in notFound', async (t) => {
  t.mock.method(globalThis, 'fetch', bolFetch);
  const { observed, notFound } = await bol.observe(
    [savedBol('9300000238030673'), savedBol('9200000104617870'), savedBol('9300000000000001')],
  );
  assert.deepEqual(observed.map(p => [p.savedId, p.isBonus, p.currentPrice]), [['bol-9300000238030673', true, 64.95]]);
  assert.deepEqual(notFound, ['bol-9200000104617870', 'bol-9300000000000001']);
});

test('bol search: only a deal label is a bonus, whatever the reference price', async (t) => {
  t.mock.method(globalThis, 'fetch', bolFetch);
  const results = await bol.searchProducts('airfryer');
  assert.deepEqual(results.map(p => [p.productId, p.isBonus, p.bonusMechanism, p.currentPrice, p.priceBeforeBonus]), [
    ['9300000238030673', true, 'deal', 64.95, 69.99],
    ['9300000227908537', false, '', 52.99, null], // "Meestal" 54,99 without a label
    ['9300000233407585', false, '', 39.99, null], // Select-deal
    ['9300000221571449', false, '', 47.99, null], // adviesprijs only
  ]);
  assert.equal(results[0].salesUnitSize, '9 l'); // from the "Inhoud: 9 l" summary line
  assert.equal(results[0].mainCategory, 'Elektronica');
  assert.match(results[0].imageUrl ?? '', /^https:\/\/media\.s-bol\.com\//);
});

test('bol search: a query answered with a landing page finds nothing', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(await page('bol-product-no-offer.html')));
  assert.deepEqual(await bol.searchProducts('outlet'), []);
});

// GET /api/bonus over the bol adapter, its pages served from the fixtures.
await useTempDataDir();
let server: Server;
let base: string;

before(async () => {
  server = createApp({ stores: { bol }, idleShutdown: { enabled: false } }).listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}/api`;
});

after(() => new Promise(resolve => server.close(resolve)));

test('bonus: a saved bol product on deal is in the bonus overview', async (t) => {
  t.mock.method(globalThis, 'fetch', bolFetch);
  const post = (storeProductId: string) => realFetch(`${base}/products`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store: 'bol', storeProductId, title: storeProductId }),
  });
  assert.equal((await post('9300000238030673')).status, 201);
  assert.equal((await post('9200000011447768')).status, 201);

  const json: any = await (await realFetch(`${base}/bonus`)).json();
  assert.deepEqual(json.bonusProducts.map((p: any) => [p.savedId, p.bonusMechanism, p.currentPrice, p.priceBeforeBonus]), [
    ['bol-9300000238030673', 'deal', 64.95, 69.99],
  ]);
  assert.deepEqual(json.notFound, []);
});
