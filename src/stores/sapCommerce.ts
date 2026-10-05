import type { StoreName } from '../types.ts';
import type { ProductFields } from './product.ts';

// The A.S. Watson SAP Commerce API (fields=FULL) behind Kruidvat and
// Trekpleister: app.kruidvat.nl serves both sites, each under its own site id.
// Search and detail return the same product fields.

const API_HOST = 'https://app.kruidvat.nl/api/v2';
const COMMON_HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'okhttp/4.9.3',
};

interface SapImage {
  imageType?: string;
  /** Relative to the site's image host, or already absolute. */
  url?: string;
}

/** Raw product: only the fields both adapters read. */
export interface SapRawProduct<Promotion> {
  code: string;
  name?: string;
  shortDescription?: string;
  manufacturer?: string;
  price?: { value?: number | null };
  topPromotion?: Promotion;
  categoriesHierarchy?: { categories?: { name?: string }[] }[];
  images?: SapImage[];
}

interface SapSearchResponse<Promotion> {
  products?: SapRawProduct<Promotion>[];
}

/** Search and detail requests for one site, e.g. `kvn-spa` (Kruidvat) or `kvtp` (Trekpleister). */
export function sapCommerceApi<Promotion>(siteId: string, storeLabel: string) {
  async function sapGet(path: string): Promise<Response> {
    return fetch(`${API_HOST}/${siteId}${path}`, { headers: COMMON_HEADERS });
  }
  function failure(res: Response): Error {
    return new Error(`${storeLabel} API error: ${res.status}`);
  }
  return {
    async search(query: string): Promise<SapRawProduct<Promotion>[]> {
      const res = await sapGet(`/search?fields=FULL&lang=nl&query=${encodeURIComponent(query)}`);
      if (!res.ok) throw failure(res);
      const data = (await res.json()) as SapSearchResponse<Promotion>;
      return data.products || [];
    },
    /** Null when the store does not know the product. */
    async detail(storeProductId: string): Promise<SapRawProduct<Promotion> | null> {
      const res = await sapGet(`/products/${encodeURIComponent(storeProductId)}?fields=FULL&lang=nl`);
      if (res.status === 404) return null;
      if (!res.ok) throw failure(res);
      return (await res.json()) as SapRawProduct<Promotion>;
    },
  };
}

/** The product fields that do not depend on the price or the promotion. */
export function sapProductFields(product: SapRawProduct<unknown>, imageHost: string, store: StoreName): ProductFields {
  const hierarchyCats = product.categoriesHierarchy?.[0]?.categories || [];
  const firstImage = product.images?.find(i => i.imageType === 'PRIMARY') || product.images?.[0];
  const imageUrl = firstImage?.url
    ? (firstImage.url.startsWith('http') ? firstImage.url : `${imageHost}${firstImage.url}`)
    : null;

  return {
    productId: String(product.code),
    title: product.name || '',
    salesUnitSize: product.shortDescription || '',
    mainCategory: hierarchyCats[0]?.name || '',
    subCategory: hierarchyCats[1]?.name || '',
    brand: product.manufacturer || '',
    imageUrl,
    store,
  };
}

/** "gratis artikel" promos don't reduce the price of the saved product. */
export function isFreeGiftPromotion(label: string): boolean {
  return /gratis\s+artikel/i.test(label);
}
