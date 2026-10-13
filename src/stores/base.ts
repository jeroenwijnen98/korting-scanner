import type { BonusProduct, ObservationResult, Product, SavedProduct, StoreName } from '../types.ts';
import { errorMessage } from '../../public/js/utils/errorMessage.js';

export abstract class StoreAdapter {
  name: StoreName;

  constructor(name: StoreName) {
    this.name = name;
  }

  abstract searchProducts(query: string): Promise<Product[]>;

  /**
   * Fetches each saved product's detail in turn and reports every one found,
   * on bonus or not. A detail that comes back null puts the saved id in
   * `notFound`; one that fails puts it in `unreachable`. Stores that can fetch
   * many products in one request override this.
   */
  async observe(savedProducts: SavedProduct[]): Promise<ObservationResult> {
    const observed: BonusProduct[] = [];
    const notFound: string[] = [];
    const unreachable: string[] = [];
    for (const saved of savedProducts) {
      let product: Product | null;
      try {
        product = await this.getProductDetail(saved.storeProductId);
      } catch (err) {
        console.error(`Error observing ${saved.id}:`, errorMessage(err));
        unreachable.push(saved.id);
        continue;
      }
      if (!product) {
        notFound.push(saved.id);
      } else {
        observed.push({ ...product, savedId: saved.id });
      }
    }
    return { observed, notFound, unreachable };
  }

  /** Resolves to null when the store does not know the product. */
  abstract getProductDetail(storeProductId: string): Promise<Product | null>;
}
