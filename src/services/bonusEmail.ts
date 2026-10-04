// The weekly bonus email's HTML, apart from sending it so a test can render it.

import { unitPriceOf, formatUnitPrice } from '../../public/js/utils/unitPrice.js';
import { formatPrice, formatDate, escapeHtml } from '../../public/js/utils/format.js';
import { STORES } from '../../public/js/utils/stores.js';
import { bonusLink, type BonusLink } from '../../public/js/utils/bonusLink.js';
import type { OverviewProduct, StoreName } from '../types.ts';

const LINK_LABELS = { add: 'Toevoegen', order: 'Bestel' };

function linkCell(link: BonusLink | null): string {
  if (!link) return '';
  return `<a href="${escapeHtml(link.url)}" style="color:#FF6B00; font-weight:bold; text-decoration:none;">${LINK_LABELS[link.kind]}</a>`;
}

function unitPriceCell(price: number | null, salesUnitSize: string): string {
  const pricePerUnit = unitPriceOf(price, salesUnitSize);
  return pricePerUnit ? formatUnitPrice(pricePerUnit) : '-';
}

export interface BonusEmailOptions {
  appUrl: string;
  /** The date in the heading, as text. */
  today: string;
  /** GROCER_URL; without it a physical-store bonus has no Toevoegen link. */
  grocerUrl: string | null;
  /** When the email was built, epoch ms: one value for every link in it. */
  at: number;
}

/**
 * The bonus email's HTML: the bonus products per store, each row with its
 * Toevoegen or Bestel link when it has one.
 */
export function buildHtml(
  bonusProducts: OverviewProduct[],
  { appUrl, today, grocerUrl, at }: BonusEmailOptions,
): string {
  const grouped = new Map<StoreName, OverviewProduct[]>();
  for (const p of bonusProducts) {
    const group = grouped.get(p.store);
    if (group) group.push(p);
    else grouped.set(p.store, [p]);
  }

  let html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background: #f5f5f5; padding: 20px;">
  <div style="max-width: 800px; margin: 0 auto; background: white; border-radius: 8px; padding: 24px;">
    <h1 style="font-size: 24px; margin: 0 0 4px 0;">Korting Scanner Update</h1>
    <p style="color: #666; margin: 0 0 16px 0;">${today}</p>
    <p style="margin: 0 0 24px 0;">
      <a href="${appUrl}" style="display:inline-block; padding: 10px 20px; background:#FF6B00; color:white; border-radius:6px; text-decoration:none; font-weight:bold;">
        Open Dashboard
      </a>
    </p>`;

  if (bonusProducts.length === 0) {
    html += `<p style="color: #999; font-style: italic;">Geen opgeslagen producten zijn momenteel in de bonus.</p>`;
  } else {
    for (const [store, products] of grouped) {
      html += `
    <h2 style="font-size: 18px; color: ${STORES[store]?.color || '#333'}; margin: 24px 0 12px 0;">${escapeHtml(STORES[store]?.name || store)}</h2>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <thead>
        <tr style="background: #f0f0f0;">
          <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Product</th>
          <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Formaat</th>
          <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Actie</th>
          <th style="padding: 8px; text-align: right; border: 1px solid #ddd;">Prijs</th>
          <th style="padding: 8px; text-align: right; border: 1px solid #ddd;">Per eenheid</th>
          <th style="padding: 8px; text-align: right; border: 1px solid #ddd;">Normaal /eenheid</th>
          <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">t/m</th>
          <th style="padding: 8px; text-align: left; border: 1px solid #ddd;"></th>
        </tr>
      </thead>
      <tbody>`;

      for (const p of products) {
        html += `
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(p.title)}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(p.salesUnitSize || '-')}</td>
          <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; color: #FF6B00;">${escapeHtml(p.bonusMechanism || '-')}</td>
          <td style="padding: 8px; border: 1px solid #ddd; text-align: right; font-weight: bold;">${formatPrice(p.currentPrice)}</td>
          <td style="padding: 8px; border: 1px solid #ddd; text-align: right; font-weight: bold; color: #FF6B00;">${unitPriceCell(p.currentPrice, p.salesUnitSize)}</td>
          <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: #999;">${unitPriceCell(p.priceBeforeBonus, p.salesUnitSize)}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${formatDate(p.bonusEndDate)}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${linkCell(bonusLink(p, { grocerUrl, at }))}</td>
        </tr>`;
      }

      html += `
      </tbody>
    </table>`;
    }
  }

  html += `
  </div>
</body>
</html>`;

  return html;
}
