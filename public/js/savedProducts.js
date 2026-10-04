// @ts-check

/**
 * @typedef {import('../../src/types.ts').SavedProduct} SavedProduct
 */

/**
 * The `api.js` functions the list needs; passed in so tests can hand it fakes.
 * @typedef {object} SavedProductApi
 * @property {() => Promise<SavedProduct[]>} getProducts
 * @property {(id: string, data: { productGroup?: string | null, paused?: boolean }) => Promise<SavedProduct>} updateProduct
 * @property {(id: string) => Promise<unknown>} removeProduct
 */

/**
 * What a group pause did. The members that saved are in the list; the ones
 * that failed kept their old state.
 * @typedef {object} GroupPauseResult
 * @property {boolean} paused the state the group was set to
 * @property {SavedProduct[]} updated the server answers for the members that saved
 * @property {{ id: string, error: unknown }[]} failed the members that did not
 */

/**
 * @typedef {object} SavedProductList
 * @property {() => Promise<void>} load fetch the saved products from the server
 * @property {() => SavedProduct[]} products the current list
 * @property {(id: string) => SavedProduct | null} get
 * @property {() => string[]} productGroups the product groups in use, each once,
 *   in list order
 * @property {(id: string, paused: boolean) => Promise<SavedProduct>} setPaused
 * @property {(id: string, productGroup: string | null) => Promise<SavedProduct>} setProductGroup
 *   an empty name means no product group
 * @property {(productGroup: string) => boolean} isGroupPaused whether every
 *   member is paused, so the group button resumes
 * @property {(productGroup: string) => Promise<GroupPauseResult>} toggleGroupPause
 *   pauses every member while any is unpaused, else resumes them all; does
 *   not throw, failures are in the result
 * @property {(id: string) => Promise<void>} remove
 * @property {(products: SavedProduct[]) => void} merge puts server answers the
 *   list did not fetch itself (added products, images) in place by id, new
 *   ids at the end
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
  const putInPlace = (products) => {
    const byId = new Map(products.map(p => [p.id, p]));
    list = list.map(s => byId.get(s.id) || s);
    const known = new Set(list.map(s => s.id));
    list = [...list, ...products.filter(p => !known.has(p.id))];
  };

  /**
   * @param {string} id
   * @param {{ productGroup?: string | null, paused?: boolean }} data
   */
  const update = async (id, data) => {
    const updated = await api.updateProduct(id, data);
    putInPlace([updated]);
    notify();
    return updated;
  };

  /**
   * Members are taken from all saved products, whatever the store filter
   * shows; a product group spans stores. Nothing is stored on the group.
   * @param {string} productGroup
   */
  const members = (productGroup) => list.filter(p => p.productGroup === productGroup);

  return {
    async load() {
      list = await api.getProducts();
      notify();
    },
    products: () => list,
    get: (id) => list.find(s => s.id === id) || null,
    productGroups: () => [...new Set(list.flatMap(s => (s.productGroup ? [s.productGroup] : [])))],
    setPaused: (id, paused) => update(id, { paused }),
    setProductGroup: (id, productGroup) => update(id, { productGroup: productGroup || null }),
    isGroupPaused: (productGroup) => !members(productGroup).some(p => !p.paused),
    async toggleGroupPause(productGroup) {
      const group = members(productGroup);
      const paused = group.some(p => !p.paused);
      const ids = group.filter(p => Boolean(p.paused) !== paused).map(p => p.id);
      const results = await Promise.allSettled(ids.map(id => api.updateProduct(id, { paused })));
      /** @type {GroupPauseResult} */
      const result = { paused, updated: [], failed: [] };
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') result.updated.push(r.value);
        else result.failed.push({ id: ids[i], error: r.reason });
      });
      if (result.updated.length > 0) {
        putInPlace(result.updated);
        notify();
      }
      return result;
    },
    async remove(id) {
      await api.removeProduct(id);
      list = list.filter(s => s.id !== id);
      notify();
    },
    merge(products) {
      putInPlace(products);
      notify();
    },
    onChange(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
