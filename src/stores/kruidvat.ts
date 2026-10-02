import type { Product } from '../types.ts';
import { StoreAdapter } from './base.ts';
import { bonusPrice } from './bonusMechanism.ts';
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
    const rawMechanism = promo?.badge?.headline || '';
    const isPriceReducing = rawMechanism !== '' && !isFreeGiftPromotion(rawMechanism);
    const bonusMechanism = isPriceReducing ? rawMechanism : '';
    const isBonus = !!bonusMechanism;
    const normalPrice = product.price?.value ?? null;
    const currentPrice = isBonus ? bonusPrice(bonusMechanism, normalPrice) ?? normalPrice : normalPrice;
    const fields = sapProductFields(product, IMAGE_HOST);

    return {
      productId: fields.productId,
      title: fields.title,
      salesUnitSize: fields.salesUnitSize,
      bonusMechanism,
      priceBeforeBonus: isBonus ? normalPrice : null,
      currentPrice,
      bonusStartDate: promo?.startDate || '',
      bonusEndDate: promo?.endDate || '',
      mainCategory: fields.mainCategory,
      subCategory: fields.subCategory,
      brand: fields.brand,
      isBonus,
      imageUrl: fields.imageUrl,
      store: 'kruidvat',
    };
  }

  async searchProducts(query: string): Promise<Product[]> {
    return (await api.search(query)).map(p => this.normalize(p));
  }

  async getProductDetail(storeProductId: string): Promise<Product> {
    return this.normalize(await api.detail(storeProductId));
  }
}

export const kruidvat = new KruidvatAdapter();
