// @ts-check
// Shared by the browser and the server (the saved-product store, the product
// detail route), so it stays plain JS that the browser can load as it is.

/**
 * The id of a saved product: `<store>-<storeProductId>`, e.g. `ah-12345`.
 * The only place that builds it.
 * @param {string} store
 * @param {string} storeProductId
 * @returns {string}
 */
export function savedProductId(store, storeProductId) {
  return `${store}-${storeProductId}`;
}
