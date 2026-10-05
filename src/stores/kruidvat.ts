import type { Product } from '../types.ts';
import { StoreAdapter } from './base.ts';
import { buildProduct } from './product.ts';
import { isFreeGiftPromotion, sapCommerceApi, sapProductFields, type SapRawProduct } from './sapCommerce.ts';

const IMAGE_HOST = 'https://www.kruidvat.nl';

interface KruidvatPromotion {
  /** `headline` is the bonus mechanism label, e.g. "1+1 gratis". */
  badge?: { headline?: string };
  startDate?: string;
  endDate?: string;
}

type KruidvatRawProduct = SapRawProduct<KruidvatPromotion>;

const api = sapCommerceApi<KruidvatPromotion>('kvn-spa', 'Kruidvat');

class KruidvatAdapter extends StoreAdapter {
  constructor() {
    super('kruidvat');
  }

  normalize(product: KruidvatRawProduct): Product {
    const promo = product.topPromotion;
    const mechanism = promo?.badge?.headline || '';
    const isPriceReducing = mechanism !== '' && !isFreeGiftPromotion(mechanism);
    return buildProduct(sapProductFields(product, IMAGE_HOST, 'kruidvat'), product.price?.value ?? null,
      isPriceReducing ? { mechanism, startDate: promo?.startDate, endDate: promo?.endDate } : null);
  }

  async searchProducts(query: string): Promise<Product[]> {
    return (await api.search(query)).map(p => this.normalize(p));
  }

  async getProductDetail(storeProductId: string): Promise<Product> {
    return this.normalize(await api.detail(storeProductId));
  }
}

export const kruidvat = new KruidvatAdapter();
