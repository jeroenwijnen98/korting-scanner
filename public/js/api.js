// @ts-check

/**
 * @typedef {import('../../src/types.ts').StoreName} StoreName
 * @typedef {import('../../src/types.ts').Product} Product
 * @typedef {import('../../src/types.ts').SavedProduct} SavedProduct
 * @typedef {import('../../src/types.ts').BonusAnswer} BonusAnswer
 * @typedef {import('../../src/types.ts').SavedProductDetail} SavedProductDetail
 * @typedef {import('./savedProducts.js').NewSavedProduct} NewSavedProduct
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
 * The saved product's detail in one answer: the product as the store has it
 * now (null when the store did not answer), its history, its product group's
 * history and its saved fields.
 * @param {string} id saved product id, e.g. `ah-12345`
 * @returns {Promise<SavedProductDetail>}
 */
export function getSavedProductDetail(id) {
  return request(`/products/${encodeURIComponent(id)}/detail`);
}

/** @returns {Promise<BonusAnswer>} */
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

/** @returns {Promise<SavedProduct[]>} */
export function syncProductImages() {
  return request('/products/sync-images', { method: 'POST' });
}
