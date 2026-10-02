import type { Product } from '../types.ts';
import { StoreAdapter } from './base.ts';
import { bonusPrice } from './bonusMechanism.ts';

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

async function fetchProductDetail(webshopId: string): Promise<AHRawProduct> {
  const data = await ahFetch<AHDetailResponse>(`/mobile-services/product/detail/v4/fir/${webshopId}`);
  return data.productCard || data;
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
    const currentPrice = product.isBonus ? bonusPrice(bonusMech, price) ?? price : price;

    // Use webshopId as productId — the detail API requires it
    const productId = product.webshopId ?? product.hqId;

    return {
      productId: String(productId),
      title: product.title,
      salesUnitSize: product.salesUnitSize || '',
      bonusMechanism: bonusMech || '',
      priceBeforeBonus: price,
      currentPrice,
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
    return this.normalize(await fetchProductDetail(storeProductId));
  }

  // Like search: an online-only bonus is not one you can get in the shop
  countsAsBonus(product: Product): boolean {
    return product.isBonus && !product.isOnlineOnly;
  }
}

export const ah = new AHAdapter();
