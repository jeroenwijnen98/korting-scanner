import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { createProductSearch, followSavedList } from '../public/js/productSearch.js';
import type { Product } from '../src/types.ts';

const DEBOUNCE_MS = 300;

/** A search result for tests, told apart by its title. */
function product(title: string): Product {
  return {
    productId: title, title, salesUnitSize: '', bonusMechanism: '', priceBeforeBonus: null,
    currentPrice: null, bonusStartDate: '', bonusEndDate: '', mainCategory: '', subCategory: '',
    brand: '', isBonus: false, imageUrl: null, store: 'ah',
  };
}

afterEach(() => {
  mock.timers.reset();
});

/** A search the test answers by hand, one call at a time. */
interface Call {
  store: string;
  query: string;
  answer: (products: Product[]) => Promise<unknown>;
  fail: (error: Error) => Promise<unknown>;
}

/** Lets the module's await and its emit run. */
const settle = () => new Promise(resolve => setImmediate(resolve));

/**
 * A product search on mock timers with a fake search function. `states`
 * collects every search state it emits; `calls` every search it made.
 */
function start() {
  mock.timers.enable({ apis: ['setTimeout'] });
  const calls: Call[] = [];
  const states: { kind: string, [key: string]: unknown }[] = [];
  const search = createProductSearch({
    search: (store: string, query: string) => new Promise<Product[]>((resolve, reject) => {
      calls.push({
        store,
        query,
        answer: products => { resolve(products); return settle(); },
        fail: error => { reject(error); return settle(); },
      });
    }),
    debounceMs: DEBOUNCE_MS,
    onState: state => { states.push(state); },
  });
  return { search, calls, states, last: () => states.at(-1) };
}

test('searches the store and the query once the debounce has passed', async () => {
  const { search, calls, last } = start();
  search.setStore('dirk');
  search.setQuery('melk');
  mock.timers.tick(DEBOUNCE_MS - 1);
  assert.equal(calls.length, 0);
  mock.timers.tick(1);
  assert.deepEqual(calls.map(c => [c.store, c.query]), [['dirk', 'melk']]);
  assert.deepEqual(last(), { kind: 'loading' });

  await calls[0].answer([product('Melk')]);
  assert.deepEqual(last(), { kind: 'results', store: 'dirk', products: [product('Melk')] });
});

test('typing "a" then "ab" quickly shows only the "ab" results', async () => {
  const { search, calls, states } = start();
  search.setQuery('a');
  mock.timers.tick(DEBOUNCE_MS - 1);
  search.setQuery('ab');
  mock.timers.tick(DEBOUNCE_MS);
  assert.deepEqual(calls.map(c => c.query), ['ab']);

  await calls[0].answer([product('ab')]);
  const results = states.filter(s => s.kind === 'results');
  assert.deepEqual(results.map(s => s.products), [[product('ab')]]);
});

test('an answer for an outdated query is dropped', async () => {
  const { search, calls, states } = start();
  search.setQuery('a');
  mock.timers.tick(DEBOUNCE_MS);
  search.setQuery('ab');
  mock.timers.tick(DEBOUNCE_MS);
  // "a" answers after "ab"
  await calls[1].answer([product('ab')]);
  await calls[0].answer([product('a')]);
  const shown = states.filter(s => s.kind === 'results' || s.kind === 'error');
  assert.deepEqual(shown.map(s => s.products), [[product('ab')]]);
});

test('clearing during the debounce makes no request', () => {
  const { search, calls, last } = start();
  search.setQuery('melk');
  search.clear();
  mock.timers.tick(DEBOUNCE_MS * 2);
  assert.equal(calls.length, 0);
  assert.deepEqual(last(), { kind: 'idle' });
});

test('clearing while a request is in flight drops its answer and its error', async () => {
  for (const settleCall of [(c: Call) => c.answer([product('Melk')]), (c: Call) => c.fail(new Error('down'))]) {
    const { search, calls, states, last } = start();
    search.setQuery('melk');
    mock.timers.tick(DEBOUNCE_MS);
    search.clear();
    const count = states.length;
    await settleCall(calls[0]);
    assert.equal(states.length, count, 'nothing emitted after the clear');
    assert.deepEqual(last(), { kind: 'idle' });
    mock.timers.reset();
  }
});

test('switching store while a request is in flight drops its answer and its error', async () => {
  for (const settleCall of [(c: Call) => c.answer([product('Melk')]), (c: Call) => c.fail(new Error('down'))]) {
    const { search, calls, states, last } = start();
    search.setQuery('melk');
    mock.timers.tick(DEBOUNCE_MS);
    search.setStore('dirk');
    const count = states.length;
    await settleCall(calls[0]);
    assert.equal(states.length, count, 'nothing emitted after the switch');
    assert.deepEqual(last(), { kind: 'idle' });
    mock.timers.reset();
  }
});

test('switching store during the debounce makes no request', () => {
  const { search, calls } = start();
  search.setQuery('melk');
  search.setStore('dirk');
  mock.timers.tick(DEBOUNCE_MS * 2);
  assert.equal(calls.length, 0);
});

test('an empty query returns to idle and makes no request', async () => {
  const { search, calls, last } = start();
  search.setQuery('melk');
  mock.timers.tick(DEBOUNCE_MS);
  await calls[0].answer([product('Melk')]);
  assert.equal(last()?.kind, 'results');

  search.setQuery('   ');
  assert.deepEqual(last(), { kind: 'idle' });
  mock.timers.tick(DEBOUNCE_MS * 2);
  assert.equal(calls.length, 1);
});

test('no results is the empty state, for the store searched', async () => {
  const { search, calls, last } = start();
  search.setStore('kruidvat');
  search.setQuery('xyz');
  mock.timers.tick(DEBOUNCE_MS);
  await calls[0].answer([]);
  assert.deepEqual(last(), { kind: 'empty', store: 'kruidvat' });
});

test('a failed search is the error state', async () => {
  const { search, calls, last } = start();
  search.setQuery('melk');
  mock.timers.tick(DEBOUNCE_MS);
  const error = new Error('down');
  await calls[0].fail(error);
  assert.deepEqual(last(), { kind: 'error', error });
});

test('with Alle selected, the search goes to AH', async () => {
  const { search, calls, last } = start();
  search.setStore('alle');
  search.setQuery('melk');
  mock.timers.tick(DEBOUNCE_MS);
  assert.deepEqual(calls.map(c => c.store), ['ah']);
  await calls[0].answer([product('Melk')]);
  assert.equal(last()?.store, 'ah');
});

test('state() is the search state last emitted', async () => {
  const { search, calls, last } = start();
  assert.deepEqual(search.state(), { kind: 'idle' });
  search.setQuery('melk');
  mock.timers.tick(DEBOUNCE_MS);
  await calls[0].answer([product('Melk')]);
  assert.deepEqual(search.state(), last());
});

/** A saved-product list reduced to its change notification, changed by hand. */
function fakeSavedList() {
  const listeners = new Set<() => void>();
  return {
    onChange(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    change() {
      listeners.forEach(listener => listener());
    },
    listening: () => listeners.size,
  };
}

/** Shows results for "koffie", then follows a fake list, recording each redraw. */
async function showingResults() {
  const { search, calls } = start();
  search.setQuery('koffie');
  mock.timers.tick(DEBOUNCE_MS);
  const koffie = [product('Koffie')];
  await calls[0].answer(koffie);
  const list = fakeSavedList();
  const drawn: unknown[] = [];
  const stop = followSavedList(search, list, state => { drawn.push(state); });
  return { search, list, drawn, stop, koffie };
}

test('a saved-list change while results show draws those results again', async () => {
  const { list, drawn, koffie } = await showingResults();
  list.change();
  assert.deepEqual(drawn, [{ kind: 'results', store: 'ah', products: koffie }]);
});

test('without results a saved-list change draws nothing', async () => {
  const { search, list, drawn } = await showingResults();
  search.clear();
  list.change();
  search.setQuery('thee');
  list.change();
  mock.timers.tick(DEBOUNCE_MS);
  list.change();
  assert.deepEqual(drawn, [], 'idle, waiting for the debounce and loading draw nothing');
});

test('stopped following, a saved-list change draws nothing and the listener is gone', async () => {
  const { list, drawn, stop } = await showingResults();
  stop();
  list.change();
  assert.deepEqual(drawn, []);
  assert.equal(list.listening(), 0);
});
