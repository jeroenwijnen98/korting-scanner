import type { Product } from '../types.ts';
import { StoreAdapter } from './base.ts';
import { buildProduct } from './product.ts';

// bol.com has no public API that fits (see docs/adr/0001): prices come from
// the public search and product pages. Plain fetch: its default
// Accept-Encoding header is what keeps bol from answering 403.
const BASE_URL = 'https://www.bol.com/nl/nl';

// The labels bol puts on a temporary price reduction. Any other discount
// label ("Outlet", "Select-deal", "10% korting op …", cashback) is not a bonus.
const BONUS_LABELS = ['deal', 'in prijs verlaagd'];
// The mechanism when the page has no label field at all but a "Meestal" price above the current one.
const FALLBACK_MECHANISM = 'in prijs verlaagd';

// Raw bol shapes, from the React Router loader data each page embeds: only the
// fields this adapter reads. Search results and the product page share them.

interface BolPromotionalLabel {
  /** "DiscountLabel" for price labels; others are awareness or award labels. */
  __typename?: string;
  titleText?: string | null;
}

interface BolReference {
  referencePrice?: { amount?: number | string | null } | null;
  /** shortText "Meestal" (most shown price in 90 days) or "Adviesprijs". */
  text?: { shortText?: { text?: string | null } | null } | null;
}

interface BolOffer {
  sellingPrice?: { price?: { amount?: number | string | null } | null } | null;
  /** Missing (not empty) when the page carries no labels at all. */
  promotionalLabels?: BolPromotionalLabel[] | null;
  savings?: { reference?: BolReference | null } | null;
}

interface BolAsset {
  renditions?: { url?: string }[] | null;
}

interface BolSpecAttribute {
  key?: string;
  name?: string;
  textValues?: string[];
}

export interface BolRawProduct {
  id: string;
  title?: string;
  /** The buy box: the offer bol shows first, whoever sells it. */
  bestSellingOffer?: BolOffer | null;
  relatedParties?: { role?: string; party?: { name?: string } | null }[] | null;
  /** Leaf category first, each with its parents from the root down. */
  categories?: { name?: string; parents?: { name?: string }[] }[] | null;
  /** Product page image. */
  primaryImageRegular?: BolAsset[] | null;
  /** Search result image. */
  primaryProductImageAssets?: BolAsset[] | null;
  specifications?: {
    /** Product page only. */
    groups?: { attributes?: BolSpecAttribute[] }[] | null;
    /** Short "Name: value" lines, on search results and the product page. */
    detailedSummary?: { attributes?: BolSpecAttribute[] } | null;
  } | null;
}

/**
 * Decodes React Router's turbo-stream payload: a flat array where every value
 * is an index into it, objects key `_<index of key>` to the index of the
 * value, and negative indices stand for special values.
 */
function decodeTurboStream(values: unknown[]): unknown {
  const SPECIAL: Record<number, unknown> = { [-1]: undefined, [-2]: NaN, [-3]: -Infinity, [-4]: -0, [-5]: null, [-6]: Infinity, [-7]: undefined };
  const hydrated = new Map<number, unknown>();
  function hydrate(index: number): unknown {
    if (index < 0) return SPECIAL[index];
    if (hydrated.has(index)) return hydrated.get(index);
    const value = values[index];
    if (value === null || typeof value !== 'object') {
      hydrated.set(index, value);
      return value;
    }
    if (Array.isArray(value)) {
      // A typed value (date, promise, …) starts with its type tag; none is read here.
      if (typeof value[0] === 'string') return undefined;
      const out: unknown[] = [];
      hydrated.set(index, out);
      for (const i of value) out.push(hydrate(i as number));
      return out;
    }
    const out: Record<string, unknown> = {};
    hydrated.set(index, out);
    for (const [key, i] of Object.entries(value)) out[String(hydrate(Number(key.slice(1))))] = hydrate(i as number);
    return out;
  }
  return hydrate(0);
}

/** The loader data of each route on a bol page, keyed by route id. */
export function pageData(html: string): Record<string, any> {
  const match = html.match(/streamController\.enqueue\(("(?:[^"\\]|\\.)*")\)/);
  if (!match) throw new Error('bol page without loader data');
  const stream: string = JSON.parse(match[1]);
  const firstLine = stream.split('\n')[0];
  const decoded = decodeTurboStream(JSON.parse(firstLine)) as { loaderData?: Record<string, any> };
  return decoded.loaderData ?? {};
}

async function fetchPage(path: string): Promise<{ status: number; html: string }> {
  const res = await fetch(`${BASE_URL}${path}`);
  return { status: res.status, html: await res.text() };
}

function amount(money: { amount?: number | string | null } | null | undefined): number | null {
  if (money?.amount == null) return null;
  const n = Number(money.amount);
  return Number.isFinite(n) ? n : null;
}

/**
 * The content size, from the "Inhoud" spec, or else the piece count ("4 stuks")
 * from "Aantal artikelen in verpakking"; '' when there is neither.
 */
function salesUnitSize(specs: BolRawProduct['specifications']): string {
  const attributes = (specs?.groups ?? []).flatMap(group => group.attributes ?? []);
  const summary = (specs?.detailedSummary?.attributes ?? []).map(attr => attr.textValues?.[0] ?? '');

  const content = attributes.find(attr => attr.key === 'Capacity' || attr.name === 'Inhoud');
  if (content) return content.textValues?.[0] ?? '';
  for (const line of summary) {
    const match = line.match(/^Inhoud:\s*(.+)$/);
    if (match) return match[1];
  }

  // "4 stuk(s)", as a spec value and as a bare summary line.
  const pieces = [attributes.find(attr => attr.key === 'Number Pieces In Package')?.textValues?.[0] ?? '', ...summary]
    .map(value => value.match(/^(\d+)\s*stuk\(s\)$/)?.[1])
    .find(Boolean);
  if (pieces) return pieces === '1' ? '1 stuk' : `${pieces} stuks`;
  return '';
}

class BolAdapter extends StoreAdapter {
  constructor() {
    super('bol');
  }

  normalize(product: BolRawProduct): Product {
    const offer = product.bestSellingOffer;
    const sellingPrice = amount(offer?.sellingPrice?.price);

    // Only bol's "most shown price over 90 days" is a price before bonus, never the adviesprijs.
    const reference = offer?.savings?.reference;
    const isMostShown = /^meestal$/i.test(reference?.text?.shortText?.text?.trim() ?? '');
    const mostShownPrice = isMostShown ? amount(reference?.referencePrice) : null;

    let bonusMechanism = '';
    if (offer?.promotionalLabels) {
      const label = offer.promotionalLabels.find(l =>
        l.__typename === 'DiscountLabel' && BONUS_LABELS.includes(l.titleText?.trim().toLowerCase() ?? ''));
      bonusMechanism = label?.titleText?.trim() ?? '';
    } else if (offer && mostShownPrice != null && sellingPrice != null && mostShownPrice > sellingPrice) {
      bonusMechanism = FALLBACK_MECHANISM;
    }

    const category = product.categories?.[0];
    const path = category ? [...(category.parents ?? []), category] : [];
    const image = product.primaryImageRegular?.[0] ?? product.primaryProductImageAssets?.[0];

    // On a bonus the selling price is the bonus price and "Meestal" the normal price.
    const bonus = bonusMechanism ? { mechanism: bonusMechanism, price: sellingPrice } : null;
    const normalPrice = bonus ? mostShownPrice : sellingPrice;

    return buildProduct({
      productId: String(product.id),
      title: product.title || '',
      salesUnitSize: salesUnitSize(product.specifications),
      mainCategory: path[0]?.name || '',
      subCategory: path[1]?.name || '',
      brand: product.relatedParties?.find(r => r.role === 'BRAND')?.party?.name || '',
      imageUrl: image?.renditions?.[0]?.url || null,
      store: 'bol',
    }, normalPrice, bonus);
  }

  async searchProducts(query: string): Promise<Product[]> {
    const { status, html } = await fetchPage(`/s/?searchtext=${encodeURIComponent(query)}`);
    if (status !== 200) throw new Error(`bol search error: ${status}`);
    // A query bol answers with a landing page instead of results has no search route.
    const products: BolRawProduct[] = pageData(html)['routes/search/searchPage']?.products ?? [];
    return products.map(p => this.normalize(p));
  }

  /**
   * The product the page shows, which after a redirect (a merged listing) is
   * not the requested one. Null when bol does not know the id or no one
   * sells it: a product without a buy box has no price to observe.
   */
  async getProductDetail(storeProductId: string): Promise<Product | null> {
    const { status, html } = await fetchPage(`/p/x/${encodeURIComponent(storeProductId)}/`);
    if (status === 404 || status === 410) return null;
    if (status !== 200) throw new Error(`bol product error: ${status}`);
    const product: BolRawProduct | undefined =
      pageData(html)['routes/product']?.content?.productPageData?.product;
    if (!product?.bestSellingOffer || amount(product.bestSellingOffer.sellingPrice?.price) == null) return null;
    return this.normalize(product);
  }
}

export const bol = new BolAdapter();
