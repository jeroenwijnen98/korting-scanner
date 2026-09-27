import type { BonusCheckResult, BonusProduct, Product, SavedProduct } from '../types.ts';
import { StoreAdapter } from './base.ts';

const GRAPHQL_URL = 'https://web-gateway.dirk.nl/graphql';
const GRAPHQL_API_KEY = '6d3a42a3-6d93-4f98-838d-bcc0ab2307fd';
const DEFAULT_STORE_ID = 36;
const IMAGE_BASE_URL = 'https://web-fileserver.dirk.nl/';

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

async function graphqlQuery<T>(query: string): Promise<T> {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-gateway-apikey': GRAPHQL_API_KEY,
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Dirk GraphQL error: ${res.status}`);
  const data = (await res.json()) as DirkGraphQLResponse<T>;
  if (data.errors) throw new Error(data.errors[0].message);
  return data.data;
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

class DirkAdapter extends StoreAdapter {
  constructor() {
    super('dirk');
  }

  normalizeProduct(product: DirkRawProduct, assortment: DirkAssortment | undefined): Product {
    const offer = assortment?.productOffer ?? null;
    const hasOffer = offer != null;
    const normalPrice = assortment?.normalPrice ?? null;
    const offerPrice = assortment?.offerPrice ?? null;
    const mechanism = (offer?.textPriceSign || '').replace(/[_\s]+/g, ' ').trim();

    return {
      productId: String(product.productId),
      title: product.headerText || '',
      salesUnitSize: product.packaging || '',
      bonusMechanism: hasOffer ? mechanism : '',
      priceBeforeBonus: hasOffer ? normalPrice : null,
      currentPrice: hasOffer ? offerPrice : normalPrice,
      bonusStartDate: offer?.startDate || '',
      bonusEndDate: offer?.endDate || '',
      mainCategory: product.department || '',
      subCategory: product.webgroup || '',
      brand: product.brand || '',
      isBonus: hasOffer,
      imageUrl: buildImageUrl(product.image),
      store: 'dirk',
    };
  }

  async searchProducts(query: string): Promise<Product[]> {
    const searchData = await graphqlQuery<DirkSearchData>(`{
      newSearchProducts(query: { searchTerm: "${query.replace(/"/g, '\\"')}", limit: 25 }) {
        productId
      }
    }`);

    const ids = (searchData.newSearchProducts || []).map(p => p.productId);
    if (ids.length === 0) return [];

    // Batch fetch product details
    const productData = await graphqlQuery<DirkListProductsData>(`{
      listProducts(productIds: [${ids.join(',')}]) {
        products { productId headerText packaging brand department webgroup image }
      }
    }`);
    const products = productData.listProducts?.products || [];

    // Batch fetch pricing/offer status
    const assortmentMap = await fetchAssortmentBatch(ids);

    return products.map(p => this.normalizeProduct(p, assortmentMap.get(p.productId)));
  }

  async getProductDetail(storeProductId: string): Promise<Product | null> {
    const id = parseInt(storeProductId, 10);
    if (isNaN(id)) return null;

    const data = await graphqlQuery<DirkProductData>(`{
      product(productId: ${id}) {
        productId headerText packaging brand department webgroup image
      }
    }`);
    if (!data.product) return null;

    const assortmentMap = await fetchAssortmentBatch([id]);
    return this.normalizeProduct(data.product, assortmentMap.get(id));
  }

  async checkBonus(savedProducts: SavedProduct[]): Promise<BonusCheckResult> {
    const validProducts = savedProducts.filter(p => !isNaN(parseInt(p.storeProductId, 10)));
    const invalidProducts = savedProducts.filter(p => isNaN(parseInt(p.storeProductId, 10)));
    if (validProducts.length === 0) return { results: [], notFound: invalidProducts.map(p => p.id) };

    const ids = validProducts.map(p => parseInt(p.storeProductId, 10));

    // Batch fetch assortment to check for offers
    const assortmentMap = await fetchAssortmentBatch(ids);

    // Products with no assortment entry at all are considered not found
    const notFound = validProducts
      .filter((p, i) => !assortmentMap.has(ids[i]))
      .map(p => p.id);
    notFound.push(...invalidProducts.map(p => p.id));

    // Find which ones are on offer
    const onOffer = validProducts.filter((_, i) => assortmentMap.get(ids[i])?.productOffer != null);
    if (onOffer.length === 0) return { results: [], notFound };

    const offerIds = onOffer.map(p => parseInt(p.storeProductId, 10));

    // Batch fetch product details for those on offer
    const productData = await graphqlQuery<DirkListProductsData>(`{
      listProducts(productIds: [${offerIds.join(',')}]) {
        products { productId headerText packaging brand department webgroup image }
      }
    }`);
    const products = productData.listProducts?.products || [];
    const productMap = new Map(products.map(p => [p.productId, p]));

    const results: BonusProduct[] = [];
    for (const saved of onOffer) {
      const id = parseInt(saved.storeProductId, 10);
      const product = productMap.get(id);
      const assortment = assortmentMap.get(id);
      if (product && assortment) {
        results.push({ ...this.normalizeProduct(product, assortment), savedId: saved.id });
      }
    }
    return { results, notFound };
  }
}

export const dirk = new DirkAdapter();
