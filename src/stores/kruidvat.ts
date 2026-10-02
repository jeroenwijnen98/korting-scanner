import type { Product } from '../types.ts';
import { StoreAdapter } from './base.ts';
import { bonusPrice } from './bonusMechanism.ts';

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
    const currentPrice = isBonus ? bonusPrice(bonusMechanism, normalPrice) ?? normalPrice : normalPrice;

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
      currentPrice,
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
}

export const kruidvat = new KruidvatAdapter();
