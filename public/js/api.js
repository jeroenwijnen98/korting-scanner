// @ts-check

/**
 * @typedef {import('../../src/types.ts').StoreName} StoreName
 * @typedef {import('../../src/types.ts').Product} Product
 * @typedef {import('../../src/types.ts').SavedProduct} SavedProduct
 * @typedef {import('../../src/types.ts').PriceSnapshot} PriceSnapshot
 * @typedef {import('../../src/types.ts').BonusOverview} BonusOverview
 * @typedef {import('../../src/types.ts').GroupHistoryEntry} GroupHistoryEntry
 */

/**
 * What `POST /api/products` takes: a saved product before the server gives it
 * its id and addedAt. imageUrl may be null, as in a product from search.
 * @typedef {Pick<SavedProduct, 'store' | 'storeProductId' | 'title'>
 *   & Partial<Pick<SavedProduct, 'brand' | 'salesUnitSize' | 'mainCategory' | 'subCategory'>>
 *   & { imageUrl?: string | null }} NewSavedProduct
 */

const BASE = '/api';

/**
 * @template T
 * @param {string} path
 * @param {RequestInit} [options]
 * @returns {Promise<T>}
 */
async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

/** @returns {Promise<SavedProduct[]>} */
export function getProducts() {
  return request('/products');
}

/**
 * @param {NewSavedProduct} product
 * @returns {Promise<SavedProduct>}
 */
export function addProduct(product) {
  return request('/products', {
    method: 'POST',
    body: JSON.stringify(product),
  });
}

/**
 * @param {string} id
 * @returns {Promise<{ ok: true }>}
 */
export function removeProduct(id) {
  return request(`/products/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

/**
 * @param {StoreName} store
 * @param {string} query
 * @returns {Promise<Product[]>}
 */
export function searchProducts(store, query) {
  return request(`/search?store=${encodeURIComponent(store)}&q=${encodeURIComponent(query)}`);
}

/**
 * @param {StoreName} store
 * @param {string} storeProductId
 * @returns {Promise<Product>}
 */
export function getProductDetail(store, storeProductId) {
  return request(`/product/${encodeURIComponent(store)}/${encodeURIComponent(storeProductId)}`);
}

/**
 * Newest first.
 * @param {string} productId saved product id, e.g. `ah-12345`
 * @returns {Promise<PriceSnapshot[]>}
 */
export function getProductHistory(productId) {
  return request(`/history/${encodeURIComponent(productId)}`);
}

/** @returns {Promise<BonusOverview>} */
export function getBonus() {
  return request('/bonus');
}

/**
 * @param {string} id
 * @param {{ productGroup?: string | null, paused?: boolean }} data
 * @returns {Promise<SavedProduct>}
 */
export function updateProduct(id, data) {
  return request(`/products/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/**
 * Newest first.
 * @param {string} groupName
 * @returns {Promise<GroupHistoryEntry[]>}
 */
export function getGroupHistory(groupName) {
  return request(`/group-history/${encodeURIComponent(groupName)}`);
}

/** @returns {Promise<SavedProduct[]>} */
export function syncProductImages() {
  return request('/products/sync-images', { method: 'POST' });
}
