import type { BonusCheckResult, Product, SavedProduct, StoreName } from '../types.ts';

export class StoreAdapter {
  name: StoreName;

  constructor(name: StoreName) {
    this.name = name;
  }

  async searchProducts(query: string): Promise<Product[]> {
    throw new Error('Not implemented');
  }

  async checkBonus(savedProducts: SavedProduct[]): Promise<BonusCheckResult> {
    throw new Error('Not implemented');
  }

  /** Resolves to null when the store does not know the product. */
  async getProductDetail(storeProductId: string): Promise<Product | null> {
    throw new Error('Not implemented');
  }

  normalize(raw: unknown): Product {
    throw new Error('Not implemented');
  }
}
