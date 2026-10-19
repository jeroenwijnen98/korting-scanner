// @ts-check

/**
 * Product search on My products, with no DOM in it: it waits for the user
 * to stop typing, asks the store, and emits one search state at a time.
 * Only the search for the newest query may emit: an answer or error for an
 * outdated query, or one that comes after a clear or a store change, is
 * dropped.
 *
 * Timers come from the global setTimeout, so node:test mock.timers drives it.
 */

/**
 * @typedef {import('../../src/types.ts').StoreName} StoreName
 * @typedef {import('../../src/types.ts').Product} Product
 * @typedef {StoreName | 'alle'} StoreFilter
 * @typedef {{ kind: 'idle' }
 *   | { kind: 'loading' }
 *   | { kind: 'results', store: StoreName, products: Product[] }
 *   | { kind: 'empty', store: StoreName }
 *   | { kind: 'error', error: unknown }} SearchState
 */

/**
 * The store a search goes to. With the "Alle" pill selected there is no
 * single store, so the search goes to AH.
 * @param {StoreFilter} store
 * @returns {StoreName}
 */
export function searchStore(store) {
  return store === 'alle' ? 'ah' : store;
}

/**
 * @param {{
 *   search: (store: StoreName, query: string) => Promise<Product[]>,
 *   debounceMs: number,
 *   onState: (state: SearchState) => void,
 * }} options
 */
export function createProductSearch({ search, debounceMs, onState }) {
  /** @type {StoreFilter} */
  let store = 'ah';
  /** @type {SearchState} */
  let current = { kind: 'idle' };
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  // Bumped by every new query, clear and store change; a search whose
  // number is no longer the latest is outdated.
  let latest = 0;

  /** @param {SearchState} state */
  const emit = state => {
    current = state;
    onState(state);
  };

  /** Drops a search that is still waiting or in flight. */
  const cancel = () => {
    clearTimeout(timer);
    latest++;
  };

  /** @param {string} query */
  const run = async query => {
    const token = latest;
    const target = searchStore(store);
    emit({ kind: 'loading' });
    try {
      const products = await search(target, query);
      if (token !== latest) return;
      emit(products.length > 0
        ? { kind: 'results', store: target, products }
        : { kind: 'empty', store: target });
    } catch (error) {
      if (token !== latest) return;
      emit({ kind: 'error', error });
    }
  };

  const clear = () => {
    cancel();
    emit({ kind: 'idle' });
  };

  return {
    /**
     * Selects the store pill; drops the search, back to idle.
     * @param {StoreFilter} next
     */
    setStore(next) {
      store = next;
      clear();
    },
    /**
     * The search box changed: searches once the debounce has passed, or
     * goes back to idle for an empty query.
     * @param {string} query
     */
    setQuery(query) {
      cancel();
      const trimmed = query.trim();
      if (!trimmed) {
        emit({ kind: 'idle' });
        return;
      }
      timer = setTimeout(() => { run(trimmed); }, debounceMs);
    },
    /** Empties the search: drops one waiting or in flight, back to idle. */
    clear,
    /** @returns {SearchState} the state last emitted */
    state() {
      return current;
    },
  };
}
