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

export function getBonus() {
  return request('/bonus');
}
