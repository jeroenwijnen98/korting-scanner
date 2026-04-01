const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export function getProducts() {
  return request('/products');
}

export function addProduct(product) {
  return request('/products', {
    method: 'POST',
    body: JSON.stringify(product),
  });
}

export function removeProduct(id) {
  return request(`/products/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function searchProducts(store, query) {
  return request(`/search?store=${encodeURIComponent(store)}&q=${encodeURIComponent(query)}`);
}

export function getProductDetail(store, storeProductId) {
  return request(`/product/${encodeURIComponent(store)}/${encodeURIComponent(storeProductId)}`);
}

export function getProductHistory(productId) {
  return request(`/history/${encodeURIComponent(productId)}`);
}

export async function getBonus() {
  const data = await request('/bonus');
  // Support both old array shape and new { bonusProducts, notFound } shape
  if (Array.isArray(data)) {
    return { bonusProducts: data, notFound: [] };
  }
  return data;
}

export function updateProduct(id, data) {
  return request(`/products/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function getGroupHistory(groupName) {
  return request(`/group-history/${encodeURIComponent(groupName)}`);
}

export function syncProductImages() {
  return request('/products/sync-images', { method: 'POST' });
}
