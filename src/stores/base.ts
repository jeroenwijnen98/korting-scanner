import type { CheckStatus, Product, SavedProduct, StoreName } from '../types.ts';
import { errorMessage } from '../../public/js/utils/errorMessage.js';

export abstract class StoreAdapter {
  name: StoreName;

  constructor(name: StoreName) {
    this.name = name;
  }

  abstract searchProducts(query: string): Promise<Product[]>;

  /**
   * Fetches each saved product's detail in turn and answers one check status
   * per saved product: observed when found (on bonus or not), gone when the
   * detail comes back null, store down when it fails. Stores that can fetch
   * many products in one request override this; an override that throws marks
   * all its saved products store down (see observeSavedProducts).
   */
  async observe(savedProducts: SavedProduct[]): Promise<CheckStatus[]> {
    const statuses: CheckStatus[] = [];
    for (const saved of savedProducts) {
      let product: Product | null;
      try {
        product = await this.getProductDetail(saved.storeProductId);
      } catch (err) {
        console.error(`Error observing ${saved.id}:`, errorMessage(err));
        statuses.push({ status: 'storeDown', savedId: saved.id, store: this.name });
        continue;
      }
      statuses.push(product
        ? { status: 'observed', savedId: saved.id, product: { ...product, savedId: saved.id } }
        : { status: 'gone', savedId: saved.id });
    }
    return statuses;
  }

  /**
   * Resolves to null when the store does not know the product, or has no
   * price for it: such a saved product is gone.
   */
  abstract getProductDetail(storeProductId: string): Promise<Product | null>;
}
