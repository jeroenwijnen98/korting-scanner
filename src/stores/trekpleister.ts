import type { Product } from '../types.ts';
import { StoreAdapter } from './base.ts';
import { bonusPrice } from './bonusMechanism.ts';
import { isFreeGiftPromotion, sapCommerceApi, sapProductFields, type SapRawProduct } from './sapCommerce.ts';

const IMAGE_HOST = 'https://www.trekpleister.nl';

// Unlike Kruidvat, the badge has no headline: the mechanism is only in the
// detail's `title`, after the brand ("Aquafresh 2+2 gratis"). In search
// results topPromotion is a stub on every product, without title or dates,
// so search can't tell a bonus.
interface TrekpleisterPromotion {
  title?: string;
  startDate?: string;
  endDate?: string;
  reward?: { rewardType?: string; formattedRewardValue?: string };
}

type TrekpleisterRawProduct = SapRawProduct<TrekpleisterPromotion>;

const api = sapCommerceApi<TrekpleisterPromotion>('kvtp', 'Trekpleister');

/**
 * The bonus mechanism in a promotion title: the first tail of the title, from
 * a number or "voor" on, that bonusPrice can price ("Aquafresh 2+2 gratis" →
 * "2+2 gratis"). Failing that, a percentage reward ("50%"); failing that,
 * the title without the brand, unpriced.
 */
function trekpleisterMechanism(promo: TrekpleisterPromotion, brand: string): string {
  const title = (promo.title || '').trim();
  const words = title.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const tail = words.slice(i).join(' ');
    if (/^(\d|voor\b)/i.test(tail) && bonusPrice(tail, 1) != null) return tail;
  }
  const reward = promo.reward;
  if (reward?.rewardType === 'PERCENT_DISCOUNT' && reward.formattedRewardValue) {
    return reward.formattedRewardValue;
  }
  if (brand && title.toLowerCase().startsWith(`${brand.toLowerCase()} `)) {
    return title.slice(brand.length).trim();
  }
  return title;
}

class TrekpleisterAdapter extends StoreAdapter {
  constructor() {
    super('trekpleister');
  }

  normalize(product: TrekpleisterRawProduct): Product {
    const promo = product.topPromotion;
    const fields = sapProductFields(product, IMAGE_HOST);
    const isPriceReducing = !!promo?.title && !isFreeGiftPromotion(promo.title);
    const bonusMechanism = promo && isPriceReducing ? trekpleisterMechanism(promo, fields.brand) : '';
    const isBonus = !!bonusMechanism;
    const normalPrice = product.price?.value ?? null;
    const currentPrice = isBonus ? bonusPrice(bonusMechanism, normalPrice) ?? normalPrice : normalPrice;

    return {
      productId: fields.productId,
      title: fields.title,
      salesUnitSize: fields.salesUnitSize,
      bonusMechanism,
      priceBeforeBonus: isBonus ? normalPrice : null,
      currentPrice,
      bonusStartDate: isBonus ? promo?.startDate || '' : '',
      bonusEndDate: isBonus ? promo?.endDate || '' : '',
      mainCategory: fields.mainCategory,
      subCategory: fields.subCategory,
      brand: fields.brand,
      isBonus,
      imageUrl: fields.imageUrl,
      store: 'trekpleister',
    };
  }

  /** Every result has isBonus false: search results carry only a promotion stub. */
  async searchProducts(query: string): Promise<Product[]> {
    return (await api.search(query)).map(p => this.normalize(p));
  }

  async getProductDetail(storeProductId: string): Promise<Product> {
    return this.normalize(await api.detail(storeProductId));
  }
}

export const trekpleister = new TrekpleisterAdapter();
