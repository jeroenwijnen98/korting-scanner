import { StoreAdapter } from './base.js';

const BASE_URL = 'https://app.kruidvat.nl/api/v2/kvn-spa';
const IMAGE_HOST = 'https://www.kruidvat.nl';
const COMMON_HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'okhttp/4.9.3',
};

async function kvFetch(path) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: COMMON_HEADERS });
  if (!res.ok) throw new Error(`Kruidvat API error: ${res.status}`);
  return res.json();
}

// Reuse AH bonus mechanism logic for Dutch promo labels
function parseBonusMechanism(mechanism, priceBeforeBonus) {
  if (!mechanism) return null;
  // Normalize spaces around "+" so "1+1 gratis" matches "1 + 1 gratis"
  const m = mechanism.toLowerCase().replace(/\s*\+\s*/g, ' + ');

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

  const bundleMatch = m.match(/(\d+)\s*voor\s*(\d+(?:[.,]\d+)?)(?:\s*euro)?/);
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
    const promo = product.topPromotion;
    const rawMechanism = promo?.badge?.headline || '';
    // "met gratis artikel" doesn't reduce the price of the saved product — ignore it
    const isPriceReducing = rawMechanism && !/met\s+gratis\s+artikel/i.test(rawMechanism);
    const bonusMechanism = isPriceReducing ? rawMechanism : '';
    const isBonus = !!bonusMechanism;
    const normalPrice = product.price?.value ?? null;
    const computedPrice = isBonus
      ? (parseBonusMechanism(bonusMechanism, normalPrice) ?? normalPrice)
      : normalPrice;

    const hierarchyCats = product.categoriesHierarchy?.[0]?.categories || [];
    const mainCategory = hierarchyCats[0]?.name || '';
    const subCategory = hierarchyCats[1]?.name || '';

    const firstImage = product.images?.find(i => i.imageType === 'PRIMARY') || product.images?.[0];
    const imageUrl = firstImage?.url
      ? (firstImage.url.startsWith('http') ? firstImage.url : `${IMAGE_HOST}${firstImage.url}`)
      : null;

    return {
      productId: String(product.code),
      title: product.name || '',
      salesUnitSize: product.shortDescription || '',
      bonusMechanism: bonusMechanism,
      priceBeforeBonus: isBonus ? normalPrice : null,
      currentPrice: computedPrice != null ? Math.round(computedPrice * 100) / 100 : null,
      bonusStartDate: promo?.startDate || '',
      bonusEndDate: promo?.endDate || '',
      mainCategory,
      subCategory,
      brand: product.manufacturer || '',
      isBonus,
      imageUrl,
      store: 'kruidvat',
    };
  }

  async searchProducts(query) {
    const data = await kvFetch(
      `/search?fields=FULL&lang=nl&query=${encodeURIComponent(query)}`
    );
    const products = data.products || [];
    return products.map(p => this.normalize(p));
  }

  async getProductDetail(storeProductId) {
    const data = await kvFetch(`/products/${encodeURIComponent(storeProductId)}?fields=FULL&lang=nl`);
    return this.normalize(data);
  }

  async checkBonus(savedProducts) {
    const results = [];
    const notFound = [];
    for (const saved of savedProducts) {
      try {
        const data = await kvFetch(`/products/${encodeURIComponent(saved.storeProductId)}?fields=FULL&lang=nl`);
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
