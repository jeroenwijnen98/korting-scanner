import { StoreAdapter } from './base.js';

const BASE_URL = 'https://api.ah.nl';
let tokenData = null;

async function getToken() {
  if (tokenData && tokenData.expiresAt > Date.now()) {
    return tokenData.token;
  }
  const res = await fetch(`${BASE_URL}/mobile-auth/v1/auth/token/anonymous`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: 'appie' }),
  });
  if (!res.ok) throw new Error(`AH auth failed: ${res.status}`);
  const data = await res.json();
  tokenData = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return tokenData.token;
}

async function ahFetch(path) {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-application': 'AHWEBSHOP',
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`AH API error: ${res.status}`);
  return res.json();
}

function parseBonusMechanism(mechanism, priceBeforeBonus) {
  if (!mechanism) return null;
  const m = mechanism.toLowerCase();

  if (m === '2e gratis' || m === '1 + 1 gratis' || m === '2 + 2 gratis') {
    return priceBeforeBonus * 0.5;
  }
  if (m === '2 + 1 gratis') {
    return priceBeforeBonus * (2 / 3);
  }
  if (m === '2e halve prijs') {
    return priceBeforeBonus * 0.75;
  }

  const pctMatch = m.match(/(\d+)%/);
  if (pctMatch) {
    return priceBeforeBonus * (1 - parseInt(pctMatch[1]) / 100);
  }

  const bundleMatch = m.match(/(\d+)\s*voor\s*(\d+(?:[.,]\d+)?)\s*euro/);
  if (bundleMatch) {
    const count = parseInt(bundleMatch[1]);
    const total = parseFloat(bundleMatch[2].replace(',', '.'));
    return total / count;
  }

  return null;
}

class AHAdapter extends StoreAdapter {
  constructor() {
    super('ah');
  }

  normalize(product) {
    const price = product.priceBeforeBonus ?? product.currentPrice ?? product.price?.now?.amount;

    // Bonus mechanism: check multiple possible locations
    const discountLabel = product.discountLabels?.[0]?.defaultDescription;
    const bonusMech = product.bonusMechanism ?? product.bonus?.segmentDescription ?? discountLabel ?? null;
    const currentPrice = product.isBonus ? parseBonusMechanism(bonusMech, price) ?? price : price;

    // Use webshopId as productId — the detail API requires it
    const productId = product.webshopId ?? product.hqId;

    return {
      productId: String(productId),
      title: product.title,
      salesUnitSize: product.salesUnitSize || '',
      bonusMechanism: bonusMech || '',
      priceBeforeBonus: price,
      currentPrice: Math.round(currentPrice * 100) / 100,
      bonusStartDate: product.bonusStartDate || product.bonus?.startDate || '',
      bonusEndDate: product.bonusEndDate || product.bonus?.endDate || '',
      mainCategory: product.mainCategory || '',
      subCategory: product.subCategory || '',
      brand: product.brand || '',
      isBonus: product.isBonus ?? false,
      store: 'ah',
    };
  }

  async searchProducts(query) {
    const data = await ahFetch(`/mobile-services/product/search/v2?query=${encodeURIComponent(query)}&page=0&size=25`);
    const products = data.products || data.cards?.flatMap(c => c.products) || [];
    return products.map(p => this.normalize(p));
  }

  async checkBonus(savedProducts) {
    const results = [];
    for (const saved of savedProducts) {
      try {
        const data = await ahFetch(`/mobile-services/product/detail/v4/fir/${saved.storeProductId}`);
        const product = data.productCard || data;
        const normalized = this.normalize(product);
        if (normalized.isBonus) {
          results.push({ ...normalized, savedId: saved.id });
        }
      } catch {
        // Product may not exist anymore, skip
      }
    }
    return results;
  }
}

export const ah = new AHAdapter();
