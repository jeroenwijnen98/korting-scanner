import { StoreAdapter } from './base.js';

// TODO: CLIENT_ID needs to be discovered from browser DevTools (network tab on etos.nl)
const CLIENT_ID = 'ajs_client_id';
const BASE_URL = 'https://www.etos.nl/s/etos/dw/shop/v23_2';

// In-memory session cookie (dwanonymous_* pattern like AH token management)
let sessionCookie = null;

async function ensureSession() {
  if (sessionCookie) return;

  const res = await fetch(
    `${BASE_URL}/customers/auth?client_id=${CLIENT_ID}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'guest' }),
    }
  );
  if (!res.ok) throw new Error(`Etos auth failed: ${res.status}`);

  // Extract dwanonymous_* cookie from Set-Cookie header
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    const match = setCookie.match(/(dwanonymous_[^=]+=\S+?)(?:;|$)/);
    if (match) {
      sessionCookie = match[1];
    }
  }

  // Also accept bearer token if returned in JSON
  if (!sessionCookie) {
    const data = await res.json().catch(() => null);
    if (data?.auth_token) {
      sessionCookie = `auth_token=${data.auth_token}`;
    }
  }
}

async function etosFetch(path) {
  await ensureSession();
  const headers = { 'Accept': 'application/json' };
  if (sessionCookie) headers['Cookie'] = sessionCookie;

  const url = `${BASE_URL}${path}${path.includes('?') ? '&' : '?'}client_id=${CLIENT_ID}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Etos API error: ${res.status}`);
  return res.json();
}

class EtosAdapter extends StoreAdapter {
  constructor() {
    super('etos');
  }

  normalize(product) {
    const normalPrice = product.price ?? null;
    const promoPrice = product.promotional_price ?? null;
    const isBonus = promoPrice != null && promoPrice !== normalPrice;

    const promotions = product.promotions || [];
    const bonusMechanism = promotions[0]?.callout_msg || promotions[0]?.name || '';

    const currentPrice = isBonus ? promoPrice : normalPrice;

    return {
      productId: String(product.product_id),
      title: product.name || product.product_name || '',
      salesUnitSize: product.c_contentSize || product.c_unitSize || '',
      bonusMechanism,
      priceBeforeBonus: isBonus ? normalPrice : null,
      currentPrice: currentPrice != null ? Math.round(currentPrice * 100) / 100 : null,
      bonusStartDate: promotions[0]?.start_date || '',
      bonusEndDate: promotions[0]?.end_date || '',
      mainCategory: product.primary_category_id || '',
      subCategory: '',
      brand: product.brand || '',
      isBonus,
      imageUrl: product.image?.link || product.images?.[0]?.url || null,
      store: 'etos',
    };
  }

  async searchProducts(query) {
    const data = await etosFetch(
      `/product_search?q=${encodeURIComponent(query)}&expand=prices,promotions&count=25`
    );
    const hits = data.hits || [];
    return hits.map(h => this.normalize(h));
  }

  async getProductDetail(storeProductId) {
    const data = await etosFetch(
      `/products/${encodeURIComponent(storeProductId)}?expand=prices,promotions`
    );
    return this.normalize(data);
  }

  async checkBonus(savedProducts) {
    const results = [];
    const notFound = [];
    for (const saved of savedProducts) {
      try {
        const data = await etosFetch(
          `/products/${encodeURIComponent(saved.storeProductId)}?expand=prices,promotions`
        );
        const normalized = this.normalize(data);
        if (normalized.isBonus) {
          results.push({ ...normalized, savedId: saved.id });
        }
      } catch {
        notFound.push(saved.id);
      }
    }
    return { results, notFound };
  }
}

export const etos = new EtosAdapter();
