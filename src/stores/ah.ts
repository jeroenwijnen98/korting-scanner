import type { Product } from '../types.ts';
import { StoreAdapter } from './base.ts';
import { buildProduct } from './product.ts';

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

/** The response to an authorized GET, after one retry with a fresh token on a 401. */
async function ahGet(path: string, retried = false): Promise<Response> {
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
    return ahGet(path, true);
  }
  return res;
}

async function ahFetch<T>(path: string): Promise<T> {
  const res = await ahGet(path);
  if (!res.ok) throw new Error(`AH API error: ${res.status}`);
  return (await res.json()) as T;
}

/** Null when AH does not know the product (404). */
async function fetchProductDetail(webshopId: string): Promise<AHRawProduct | null> {
  const res = await ahGet(`/mobile-services/product/detail/v4/fir/${webshopId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`AH API error: ${res.status}`);
  const data = (await res.json()) as AHDetailResponse;
  return data.productCard || data;
}

function normalize(product: AHRawProduct): Product {
  const price = product.priceBeforeBonus ?? product.currentPrice ?? product.price?.now?.amount ?? null;

  // Bonus mechanism: check multiple possible locations
  const discountLabel = product.discountLabels?.[0]?.defaultDescription;
  const bonusMech = product.bonusMechanism ?? product.bonus?.segmentDescription ?? discountLabel ?? '';

  // Use webshopId as productId — the detail API requires it
  const productId = product.webshopId ?? product.hqId;

  // An online-only bonus is not one you can get in the shop: no bonus at all
  const isOnlineOnly = product.availability?.orderable === 'ONLINE_ONLY' || product.isExclusivelySoldOnline || false;

  return buildProduct({
    productId: String(productId),
    title: product.title,
    salesUnitSize: product.salesUnitSize || '',
    mainCategory: product.mainCategory || '',
    subCategory: product.subCategory || '',
    brand: product.brand || '',
    imageUrl: product.images?.[0]?.url || null,
    isOnlineOnly,
    store: 'ah',
  }, price, product.isBonus && !isOnlineOnly ? {
    mechanism: bonusMech,
    startDate: product.bonusStartDate || product.bonus?.startDate,
    endDate: product.bonusEndDate || product.bonus?.endDate,
  } : null);
}

class AHAdapter extends StoreAdapter {
  constructor() {
    super('ah');
  }

  async searchProducts(query: string): Promise<Product[]> {
    const data = await ahFetch<AHSearchResponse>(`/mobile-services/product/search/v2?query=${encodeURIComponent(query)}&page=0&size=25`);
    const products = data.products || data.cards?.flatMap(c => c.products) || [];
    return products.map(normalize).filter(p => !p.isOnlineOnly);
  }

  async getProductDetail(storeProductId: string): Promise<Product | null> {
    const product = await fetchProductDetail(storeProductId);
    return product && normalize(product);
  }
}

export const ah = new AHAdapter();
