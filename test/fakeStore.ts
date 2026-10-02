import { StoreAdapter } from '../src/stores/base.ts';
import type { Product, StoreName } from '../src/types.ts';

/** A product in the common product schema, with overrides. */
export function product(store: StoreName, productId: string, fields: Partial<Product> = {}): Product {
  return {
    productId, title: `Product ${productId}`, salesUnitSize: '1 kg', bonusMechanism: '',
    priceBeforeBonus: null, currentPrice: 2, bonusStartDate: '', bonusEndDate: '',
    mainCategory: '', subCategory: '', brand: '', isBonus: false, imageUrl: null, store,
    ...fields,
  };
}

/** A store adapter over a fixed list of products; no network. */
export class FakeStore extends StoreAdapter {
  products: Product[];

  constructor(name: StoreName, products: Product[]) {
    super(name);
    this.products = products;
  }

  async searchProducts(query: string): Promise<Product[]> {
    return this.products.filter(p => p.title.toLowerCase().includes(query.toLowerCase()));
  }

  async getProductDetail(storeProductId: string): Promise<Product | null> {
    return this.products.find(p => p.productId === storeProductId) ?? null;
  }
}

/** A store adapter whose every call throws, like a store that is down. */
export class BrokenStore extends StoreAdapter {
  async searchProducts(): Promise<Product[]> {
    throw new Error('store down');
  }

  async getProductDetail(): Promise<Product | null> {
    throw new Error('store down');
  }

  async observe(): Promise<never> {
    throw new Error('store down');
  }
}
