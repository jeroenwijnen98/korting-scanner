import type { CheckStatus, Product, SavedProduct } from '../types.ts';
import { StoreAdapter } from './base.ts';
import { buildProduct } from './product.ts';

const GRAPHQL_URL = 'https://web-gateway.dirk.nl/graphql';
const GRAPHQL_API_KEY = '6d3a42a3-6d93-4f98-838d-bcc0ab2307fd';
const DEFAULT_STORE_ID = 36;
const IMAGE_BASE_URL = 'https://web-fileserver.dirk.nl/';
/** The `DirkRawProduct` fields, as selected from `listProducts` and `product`. */
const PRODUCT_FIELDS = 'productId headerText packaging brand department webgroup image';

// Raw Dirk GraphQL shapes: only the fields the queries below select.

interface DirkGraphQLResponse<T> {
  data: T;
  errors?: { message: string }[];
}

/** `listProducts` / `product` fields. */
interface DirkRawProduct {
  productId: number;
  headerText: string | null;
  packaging: string | null;
  brand: string | null;
  department: string | null;
  webgroup: string | null;
  image: string | null;
}

interface DirkProductOffer {
  productOfferId: number;
  /** The bonus mechanism label, with underscores for spaces. */
  textPriceSign: string | null;
  startDate: string | null;
  endDate: string | null;
}

/** `productAssortment` for one product in one store. */
interface DirkAssortment {
  productId: number;
  normalPrice: number | null;
  /** The final price while on offer. */
  offerPrice: number | null;
  productOffer: DirkProductOffer | null;
}

interface DirkSearchData {
  newSearchProducts: { productId: number }[] | null;
}

interface DirkListProductsData {
  listProducts: { products: DirkRawProduct[] | null } | null;
}

interface DirkProductData {
  product: DirkRawProduct | null;
}

/** One aliased `productAssortment` per product: `p0`, `p1`, … */
type DirkAssortmentBatchData = Record<string, DirkAssortment | null>;

function buildImageUrl(image: string | null): string | null {
  if (!image) return null;
  return IMAGE_BASE_URL + encodeURIComponent(image);
}

async function graphqlQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-gateway-apikey': GRAPHQL_API_KEY,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Dirk GraphQL error: ${res.status}`);
  const data = (await res.json()) as DirkGraphQLResponse<T>;
  if (data.errors) throw new Error(data.errors[0].message);
  return data.data;
}

async function fetchProducts(productIds: number[]): Promise<DirkRawProduct[]> {
  const data = await graphqlQuery<DirkListProductsData>(`{
    listProducts(productIds: [${productIds.join(',')}]) {
      products { ${PRODUCT_FIELDS} }
    }
  }`);
  return data.listProducts?.products || [];
}

// Batch fetch assortment (pricing + offer) for multiple product IDs using aliases
async function fetchAssortmentBatch(productIds: number[]): Promise<Map<number, DirkAssortment>> {
  if (productIds.length === 0) return new Map();
  const aliases = productIds.map((id, i) =>
    `p${i}: productAssortment(productId: ${id}, storeId: ${DEFAULT_STORE_ID}) { productId normalPrice offerPrice productOffer { productOfferId textPriceSign startDate endDate } }`
  );
  const data = await graphqlQuery<DirkAssortmentBatchData>(`{ ${aliases.join(' ')} }`);
  const map = new Map<number, DirkAssortment>();
  for (let i = 0; i < productIds.length; i++) {
    const a = data[`p${i}`];
    if (a) map.set(a.productId, a);
  }
  return map;
}

function normalize(product: DirkRawProduct, assortment: DirkAssortment | undefined): Product {
  const offer = assortment?.productOffer ?? null;
  return buildProduct({
    productId: String(product.productId),
    title: product.headerText || '',
    salesUnitSize: product.packaging || '',
    mainCategory: product.department || '',
    subCategory: product.webgroup || '',
    brand: product.brand || '',
    imageUrl: buildImageUrl(product.image),
    store: 'dirk',
  }, assortment?.normalPrice ?? null, offer ? {
    mechanism: (offer.textPriceSign || '').replace(/[_\s]+/g, ' ').trim(),
    price: assortment?.offerPrice,
    startDate: offer.startDate,
    endDate: offer.endDate,
  } : null);
}

class DirkAdapter extends StoreAdapter {
  constructor() {
    super('dirk');
  }

  async searchProducts(query: string): Promise<Product[]> {
    const searchData = await graphqlQuery<DirkSearchData>(`query Search($q: String!) {
      newSearchProducts(query: { searchTerm: $q, limit: 25 }) {
        productId
      }
    }`, { q: query });

    const ids = (searchData.newSearchProducts || []).map(p => p.productId);
    if (ids.length === 0) return [];

    const products = await fetchProducts(ids);

    // Batch fetch pricing/offer status
    const assortmentMap = await fetchAssortmentBatch(ids);

    return products.map(p => normalize(p, assortmentMap.get(p.productId)));
  }

  /** Null for an id that does not parse, or without an assortment or product entry. */
  async getProductDetail(storeProductId: string): Promise<Product | null> {
    const id = parseInt(storeProductId, 10);
    if (isNaN(id)) return null;

    const assortment = (await fetchAssortmentBatch([id])).get(id);
    if (!assortment) return null;
    const data = await graphqlQuery<DirkProductData>(`{
      product(productId: ${id}) {
        ${PRODUCT_FIELDS}
      }
    }`);
    return data.product ? normalize(data.product, assortment) : null;
  }

  /**
   * Batch-fetches the assortment and details of every saved product and
   * answers one check status per saved product. Gone means what it means in
   * getProductDetail: an id that does not parse, or has no assortment or
   * product entry.
   */
  async observe(savedProducts: SavedProduct[]): Promise<CheckStatus[]> {
    const ids = savedProducts.map(p => parseInt(p.storeProductId, 10)).filter(id => !isNaN(id));
    const assortmentMap = await fetchAssortmentBatch(ids);

    // Products with no assortment entry at all are gone; skip their details
    const foundIds = ids.filter(id => assortmentMap.has(id));
    const products = foundIds.length === 0 ? [] : await fetchProducts(foundIds);
    const productMap = new Map(products.map(p => [p.productId, p]));

    return savedProducts.map((saved): CheckStatus => {
      const id = parseInt(saved.storeProductId, 10);
      const product = productMap.get(id);
      const assortment = assortmentMap.get(id);
      return product && assortment
        ? { status: 'observed', savedId: saved.id, product: { ...normalize(product, assortment), savedId: saved.id } }
        : { status: 'gone', savedId: saved.id };
    });
  }
}

export const dirk = new DirkAdapter();
