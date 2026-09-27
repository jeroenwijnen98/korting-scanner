import type { BonusCheckResult, BonusProduct, Product, SavedProduct } from '../types.ts';
import { StoreAdapter } from './base.ts';

const BASE_URL = 'https://app.kruidvat.nl/api/v2/kvn-spa';
const IMAGE_HOST = 'https://www.kruidvat.nl';
const COMMON_HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'okhttp/4.9.3',
};

// Raw Kruidvat (SAP Commerce, fields=FULL) shapes: only the fields this
// adapter reads. Search and detail return the same product fields.

interface KruidvatPromotion {
  /** `headline` is the bonus mechanism label, e.g. "1+1 gratis". */
  badge?: { headline?: string };
  startDate?: string;
  endDate?: string;
}

interface KruidvatImage {
  imageType?: string;
  /** Relative to IMAGE_HOST, or already absolute. */
  url?: string;
}

interface KruidvatRawProduct {
  code: string;
  name?: string;
  shortDescription?: string;
  manufacturer?: string;
  price?: { value?: number | null };
  topPromotion?: KruidvatPromotion;
  categoriesHierarchy?: { categories?: { name?: string }[] }[];
  images?: KruidvatImage[];
}

interface KruidvatSearchResponse {
  products?: KruidvatRawProduct[];
}

async function kvFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: COMMON_HEADERS });
  if (!res.ok) throw new Error(`Kruidvat API error: ${res.status}`);
  return (await res.json()) as T;
}

function fetchProductDetail(storeProductId: string): Promise<KruidvatRawProduct> {
  return kvFetch<KruidvatRawProduct>(`/products/${encodeURIComponent(storeProductId)}?fields=FULL&lang=nl`);
}

/**
 * The price per item under a bonus mechanism (AH's logic, for Dutch promo
 * labels), or null when the mechanism is not recognised. Percentage and
 * "gratis" mechanisms need the regular price; without one they yield null too.
 */
function parseBonusMechanism(mechanism: string, priceBeforeBonus: number | null): number | null {
  if (!mechanism) return null;
  // Normalize spaces around "+" so "1+1 gratis" matches "1 + 1 gratis"
  const m = mechanism.toLowerCase().replace(/\s*\+\s*/g, ' + ');
  const discounted = (factor: number) => (priceBeforeBonus == null ? null : priceBeforeBonus * factor);

  if (m === '2e gratis' || m === '1 + 1 gratis' || m === '2 + 2 gratis') {
    return discounted(0.5);
  }
  if (m === '2 + 1 gratis') {
    return discounted(2 / 3);
  }
  if (m === '2e halve prijs') {
    return discounted(0.75);
  }

  const pctMatch = m.match(/(\d+)%/);
  if (pctMatch) {
    return discounted(1 - parseInt(pctMatch[1]) / 100);
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

  normalize(product: KruidvatRawProduct): Product {
    const promo = product.topPromotion;
    const rawMechanism = promo?.badge?.headline || '';
    // "gratis artikel" promos don't reduce the price of the saved product — ignore them
    const isPriceReducing = rawMechanism !== '' && !/gratis\s+artikel/i.test(rawMechanism);
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

  async searchProducts(query: string): Promise<Product[]> {
    const data = await kvFetch<KruidvatSearchResponse>(
      `/search?fields=FULL&lang=nl&query=${encodeURIComponent(query)}`
    );
    const products = data.products || [];
    return products.map(p => this.normalize(p));
  }

  async getProductDetail(storeProductId: string): Promise<Product> {
    return this.normalize(await fetchProductDetail(storeProductId));
  }

  async checkBonus(savedProducts: SavedProduct[]): Promise<BonusCheckResult> {
    const results: BonusProduct[] = [];
    const notFound: string[] = [];
    for (const saved of savedProducts) {
      try {
        const normalized = this.normalize(await fetchProductDetail(saved.storeProductId));
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
