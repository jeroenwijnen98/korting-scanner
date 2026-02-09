import { StoreAdapter } from './base.js';

const BASE_URL = 'https://www.dirk.nl/api';
let offersCache = null;
let cacheTime = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function fetchAllOffers() {
  if (offersCache && Date.now() - cacheTime < CACHE_TTL) {
    return offersCache;
  }

  const allOffers = [];
  let page = 0;
  while (true) {
    const res = await fetch(`${BASE_URL}/offers/current/${page}`);
    if (!res.ok) break;
    const data = await res.json();
    const offers = data.currentOffers || [];
    if (offers.length === 0) break;
    allOffers.push(...offers);
    page++;
  }

  offersCache = allOffers;
  cacheTime = Date.now();
  return allOffers;
}

class DirkAdapter extends StoreAdapter {
  constructor() {
    super('dirk');
  }

  normalize(offer) {
    const product = offer.products?.[0]?.productInformation || {};
    return {
      productId: String(offer.offerId),
      title: offer.headerText || '',
      salesUnitSize: offer.packaging || '',
      bonusMechanism: offer.textPriceSign || '',
      priceBeforeBonus: offer.offerOriginalPrice ?? null,
      currentPrice: offer.offerPrice ?? null,
      bonusStartDate: offer.startDate || '',
      bonusEndDate: offer.endDate || '',
      mainCategory: product.department || '',
      subCategory: product.webgroup || '',
      brand: product.brand || '',
      isBonus: true,
      store: 'dirk',
    };
  }

  async searchProducts(query) {
    const offers = await fetchAllOffers();
    const q = query.toLowerCase();
    return offers
      .filter(o => (o.headerText || '').toLowerCase().includes(q))
      .map(o => this.normalize(o));
  }

  async checkBonus(savedProducts) {
    const offers = await fetchAllOffers();
    const results = [];
    for (const saved of savedProducts) {
      const match = offers.find(o => String(o.offerId) === saved.storeProductId);
      if (match) {
        results.push({ ...this.normalize(match), savedId: saved.id });
      }
    }
    return results;
  }
}

export const dirk = new DirkAdapter();
