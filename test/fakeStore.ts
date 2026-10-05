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

  searchProducts(query: string): Promise<Product[]> {
    return Promise.resolve(this.products.filter(p => p.title.toLowerCase().includes(query.toLowerCase())));
  }

  getProductDetail(storeProductId: string): Promise<Product | null> {
    return Promise.resolve(this.products.find(p => p.productId === storeProductId) ?? null);
  }
}

/** A store adapter whose every call fails, like a store that is down. */
export class BrokenStore extends StoreAdapter {
  searchProducts(): Promise<Product[]> {
    return Promise.reject(new Error('store down'));
  }

  getProductDetail(): Promise<Product | null> {
    return Promise.reject(new Error('store down'));
  }

  observe(): Promise<never> {
    return Promise.reject(new Error('store down'));
  }
}
