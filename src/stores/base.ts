import type { BonusProduct, ObservationResult, Product, SavedProduct, StoreName } from '../types.ts';

export class StoreAdapter {
  name: StoreName;

  constructor(name: StoreName) {
    this.name = name;
  }

  async searchProducts(query: string): Promise<Product[]> {
    throw new Error('Not implemented');
  }

  /**
   * Fetches each saved product's detail in turn and reports every one found,
   * on bonus or not. A detail that fails or comes back null puts the saved id
   * in `notFound`. Stores that can fetch many products in one request override this.
   */
  async observe(savedProducts: SavedProduct[]): Promise<ObservationResult> {
    const observed: BonusProduct[] = [];
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
      } else {
        observed.push({ ...product, savedId: saved.id });
      }
    }
    return { observed, notFound };
  }

  /** Whether an observed product belongs in the bonus overview. */
  countsAsBonus(product: Product): boolean {
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
