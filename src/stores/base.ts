import type { BonusCheckResult, BonusProduct, Product, SavedProduct, StoreName } from '../types.ts';

export class StoreAdapter {
  name: StoreName;

  constructor(name: StoreName) {
    this.name = name;
  }

  async searchProducts(query: string): Promise<Product[]> {
    throw new Error('Not implemented');
  }

  /**
   * Fetches each saved product's detail in turn and keeps those on bonus. A
   * detail that fails or comes back null puts the saved id in `notFound`.
   * Stores that can check many products in one request override this.
   */
  async checkBonus(savedProducts: SavedProduct[]): Promise<BonusCheckResult> {
    const results: BonusProduct[] = [];
    const notFound: string[] = [];
    for (const saved of savedProducts) {
      let product: Product | null;
      try {
        product = await this.getProductDetail(saved.storeProductId);
      } catch {
        product = null;
      }
      if (!product) {
        notFound.push(saved.id);
      } else if (this.countsAsBonus(product)) {
        results.push({ ...product, savedId: saved.id });
      }
    }
    return { results, notFound };
  }

  /** Whether the default `checkBonus` reports this product. */
  protected countsAsBonus(product: Product): boolean {
    return product.isBonus;
  }

  /** Resolves to null when the store does not know the product. */
  async getProductDetail(storeProductId: string): Promise<Product | null> {
    throw new Error('Not implemented');
  }

  normalize(raw: unknown): Product {
    throw new Error('Not implemented');
  }
}
