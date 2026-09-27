import type { BonusCheckResult, BonusProduct, Product, SavedProduct } from '../types.ts';
import { StoreAdapter } from './base.ts';

const BASE_URL = 'https://api.ah.nl';

// Raw AH API shapes: only the fields this adapter reads. Search and detail
// return the same product fields, though not always all of them.

interface AHTokenResponse {
  access_token: string;
  /** Seconds. */
  expires_in: number;
}

interface AHDiscountLabel {
  /** The bonus mechanism label, e.g. "1 + 1 gratis" or "2 voor 3 euro". */
  defaultDescription?: string;
}

interface AHRawProduct {
  webshopId?: number;
  /** 0 for bundle products: never key on it when webshopId is there. */
  hqId?: number;
  title: string;
  salesUnitSize?: string;
  priceBeforeBonus?: number;
  currentPrice?: number;
  price?: { now?: { amount?: number } };
  isBonus?: boolean;
  bonusMechanism?: string;
  bonus?: { segmentDescription?: string; startDate?: string; endDate?: string };
  discountLabels?: AHDiscountLabel[];
  bonusStartDate?: string;
  bonusEndDate?: string;
  mainCategory?: string;
  subCategory?: string;
  brand?: string;
  images?: { url?: string }[];
  availability?: { orderable?: string };
  isExclusivelySoldOnline?: boolean;
}

interface AHSearchResponse {
  products?: AHRawProduct[];
  cards?: { products: AHRawProduct[] }[];
}

/** The detail endpoint wraps the product in `productCard`; fall back to the body itself. */
type AHDetailResponse = AHRawProduct & { productCard?: AHRawProduct };

let tokenData: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (tokenData && tokenData.expiresAt > Date.now()) {
    return tokenData.token;
  }
  const res = await fetch(`${BASE_URL}/mobile-auth/v1/auth/token/anonymous`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: 'appie' }),
  });
  if (!res.ok) throw new Error(`AH auth failed: ${res.status}`);
  const data = (await res.json()) as AHTokenResponse;
  tokenData = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return tokenData.token;
}

async function ahFetch<T>(path: string, retried = false): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-application': 'AHWEBSHOP',
      'Content-Type': 'application/json',
    },
  });
  if (res.status === 401 && !retried) {
    tokenData = null;
    return ahFetch<T>(path, true);
  }
  if (!res.ok) throw new Error(`AH API error: ${res.status}`);
  return (await res.json()) as T;
}

/**
 * The price per item under a bonus mechanism, or null when the mechanism is
 * not recognised. Percentage and "gratis" mechanisms need the regular price;
 * without one they yield null too.
 */
function parseBonusMechanism(mechanism: string | null, priceBeforeBonus: number | null): number | null {
  if (!mechanism) return null;
  const m = mechanism.toLowerCase();
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

class AHAdapter extends StoreAdapter {
  constructor() {
    super('ah');
  }

  normalize(product: AHRawProduct): Product {
    const price = product.priceBeforeBonus ?? product.currentPrice ?? product.price?.now?.amount ?? null;

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
      currentPrice: currentPrice == null ? null : Math.round(currentPrice * 100) / 100,
      bonusStartDate: product.bonusStartDate || product.bonus?.startDate || '',
      bonusEndDate: product.bonusEndDate || product.bonus?.endDate || '',
      mainCategory: product.mainCategory || '',
      subCategory: product.subCategory || '',
      brand: product.brand || '',
      isBonus: product.isBonus ?? false,
      imageUrl: product.images?.[0]?.url || null,
      isOnlineOnly: product.availability?.orderable === 'ONLINE_ONLY' || product.isExclusivelySoldOnline || false,
      store: 'ah',
    };
  }

  async searchProducts(query: string): Promise<Product[]> {
    const data = await ahFetch<AHSearchResponse>(`/mobile-services/product/search/v2?query=${encodeURIComponent(query)}&page=0&size=25`);
    const products = data.products || data.cards?.flatMap(c => c.products) || [];
    return products.map(p => this.normalize(p)).filter(p => !p.isOnlineOnly);
  }

  async getProductDetail(storeProductId: string): Promise<Product> {
    const data = await ahFetch<AHDetailResponse>(`/mobile-services/product/detail/v4/fir/${storeProductId}`);
    const product = data.productCard || data;
    return this.normalize(product);
  }

  async checkBonus(savedProducts: SavedProduct[]): Promise<BonusCheckResult> {
    const results: BonusProduct[] = [];
    const notFound: string[] = [];
    for (const saved of savedProducts) {
      try {
        const data = await ahFetch<AHDetailResponse>(`/mobile-services/product/detail/v4/fir/${saved.storeProductId}`);
        const product = data.productCard || data;
        const normalized = this.normalize(product);
        if (normalized.isBonus && !normalized.isOnlineOnly) {
          results.push({ ...normalized, savedId: saved.id });
        }
      } catch {
        notFound.push(saved.id);
      }
    }
    return { results, notFound };
  }
}

export const ah = new AHAdapter();
