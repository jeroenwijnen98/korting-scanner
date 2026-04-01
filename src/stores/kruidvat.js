import { StoreAdapter } from './base.js';

const BASE_URL = 'https://www.kruidvat.nl/api/v2/kvn';
const COMMON_HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0',
};

async function kvFetch(path) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: COMMON_HEADERS });
  if (!res.ok) throw new Error(`Kruidvat API error: ${res.status}`);
  return res.json();
}

// Reuse AH bonus mechanism logic for Dutch promo labels
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

  // "VOOR 16.99" or "voor 16,99" — single item fixed price
  const voorMatch = m.match(/^voor\s+(\d+(?:[.,]\d+)?)$/);
  if (voorMatch) {
    return parseFloat(voorMatch[1].replace(',', '.'));
  }

  return null;
}

class KruidvatAdapter extends StoreAdapter {
  constructor() {
    super('kruidvat');
  }

  normalize(product) {
    const promo = product.potentialPromotions?.[0];
    const bonusMechanism = promo?.description || '';
    const isBonus = (product.potentialPromotions?.length ?? 0) > 0;
    const normalPrice = product.price?.value ?? null;
    const computedPrice = isBonus
      ? (parseBonusMechanism(bonusMechanism, normalPrice) ?? normalPrice)
      : normalPrice;

    const categories = product.categories || [];
    const mainCategory = categories[0]?.name || '';
    const subCategory = categories[1]?.name || '';

    return {
      productId: String(product.code),
      title: product.name || '',
      salesUnitSize: product.summary || '',
      bonusMechanism: bonusMechanism,
      priceBeforeBonus: isBonus ? normalPrice : null,
      currentPrice: computedPrice != null ? Math.round(computedPrice * 100) / 100 : null,
      bonusStartDate: promo?.startDate || '',
      bonusEndDate: promo?.endDate || '',
      mainCategory,
      subCategory,
      brand: product.manufacturer || '',
      isBonus,
      imageUrl: product.images?.[0]?.url || null,
      store: 'kruidvat',
    };
  }

  async searchProducts(query) {
    const data = await kvFetch(
      `/products/search?query=${encodeURIComponent(query)}&currentPage=0&pageSize=25&fields=FULL`
    );
    const products = data.products || [];
    return products.map(p => this.normalize(p));
  }

  async getProductDetail(storeProductId) {
    const data = await kvFetch(`/products/${encodeURIComponent(storeProductId)}?fields=FULL`);
    return this.normalize(data);
  }

  async checkBonus(savedProducts) {
    const results = [];
    const notFound = [];
    for (const saved of savedProducts) {
      try {
        const data = await kvFetch(`/products/${encodeURIComponent(saved.storeProductId)}?fields=FULL`);
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

export const kruidvat = new KruidvatAdapter();
