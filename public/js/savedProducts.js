// @ts-check

/**
 * @typedef {import('../../src/types.ts').SavedProduct} SavedProduct
 */

/**
 * The `api.js` functions the list needs; passed in so tests can hand it fakes.
 * @typedef {object} SavedProductApi
 * @property {() => Promise<SavedProduct[]>} getProducts
 * @property {(id: string, data: { paused?: boolean }) => Promise<SavedProduct>} updateProduct
 * @property {(id: string) => Promise<unknown>} removeProduct
 */

/**
 * @typedef {object} SavedProductList
 * @property {() => Promise<void>} load fetch the saved products from the server
 * @property {() => SavedProduct[]} products the current list
 * @property {(id: string) => SavedProduct | null} get
 * @property {(id: string, paused: boolean) => Promise<SavedProduct>} setPaused
 * @property {(id: string) => Promise<void>} remove
 * @property {(products: SavedProduct[]) => void} merge puts server answers the
 *   list did not fetch itself (added products, images, product groups) in
 *   place by id, new ids at the end
 * @property {(listener: () => void) => () => void} onChange returns a function
 *   that stops the listener
 */

/**
 * The saved products the browser knows about. Each edit is persisted through
 * the API first; only the server's answer goes into the list, so a failed
 * call leaves it as it was and the error is thrown to the caller.
 * @param {SavedProductApi} api
 * @returns {SavedProductList}
 */
export function createSavedProductList(api) {
  /** @type {SavedProduct[]} */
  let list = [];
  /** @type {Set<() => void>} */
  const listeners = new Set();

  const notify = () => listeners.forEach(listener => listener());

  /** @param {SavedProduct[]} products */
  const merge = (products) => {
    const byId = new Map(products.map(p => [p.id, p]));
    list = list.map(s => byId.get(s.id) || s);
    const known = new Set(list.map(s => s.id));
    list = [...list, ...products.filter(p => !known.has(p.id))];
    notify();
  };

  return {
    async load() {
      list = await api.getProducts();
      notify();
    },
    products: () => list,
    get: (id) => list.find(s => s.id === id) || null,
    async setPaused(id, paused) {
      const updated = await api.updateProduct(id, { paused });
      list = list.map(s => (s.id === updated.id ? updated : s));
      notify();
      return updated;
    },
    async remove(id) {
      await api.removeProduct(id);
      list = list.filter(s => s.id !== id);
      notify();
    },
    merge,
    onChange(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
