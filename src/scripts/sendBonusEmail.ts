import dotenv from 'dotenv';
import { createTransport } from 'nodemailer';
import { join } from 'node:path';
import * as productStore from '../services/productStore.ts';
import * as priceHistory from '../services/priceHistory.ts';
import { stores } from '../stores/index.ts';
import { parseUnitSize, calcPricePerUnit } from '../../public/js/utils/unitPrice.js';
import type { BonusProduct, StoreName } from '../types.ts';

const ROOT = join(import.meta.dirname, '..', '..');

// Variables already set in the environment win over .env; a missing .env is fine.
dotenv.config({ path: join(ROOT, '.env'), quiet: true });

const STORE_NAMES: Record<StoreName, string> = { ah: 'Albert Heijn', dirk: 'Dirk', kruidvat: 'Kruidvat', etos: 'Etos' };
const STORE_COLORS: Record<StoreName, string> = { ah: '#00A0E2', dirk: '#ED1C24', kruidvat: '#FF5500', etos: '#7B2D8B' };

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function formatPrice(price: number | null | undefined): string {
  if (price == null) return '-';
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
  }).format(price);
}

function formatUnitPrice(price: number | null, salesUnitSize: string): string {
  const { volume, unit } = parseUnitSize(salesUnitSize);
  const result = calcPricePerUnit(price, volume, unit);
  if (!result) return '-';
  return `${formatPrice(result.unitPrice)}/${result.standardUnit}`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString('nl-NL', {
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return dateStr;
  }
}

function buildHtml(bonusProducts: BonusProduct[], appUrl: string, today: string): string {
  const grouped = new Map<StoreName, BonusProduct[]>();
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
    <h2 style="font-size: 18px; color: ${STORE_COLORS[store] || '#333'}; margin: 24px 0 12px 0;">${STORE_NAMES[store] || store}</h2>
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
        </tr>
      </thead>
      <tbody>`;

      for (const p of products) {
        html += `
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd;">${p.title}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${p.salesUnitSize || '-'}</td>
          <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; color: #FF6B00;">${p.bonusMechanism || '-'}</td>
          <td style="padding: 8px; border: 1px solid #ddd; text-align: right; font-weight: bold;">${formatPrice(p.currentPrice)}</td>
          <td style="padding: 8px; border: 1px solid #ddd; text-align: right; font-weight: bold; color: #FF6B00;">${formatUnitPrice(p.currentPrice, p.salesUnitSize)}</td>
          <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: #999;">${formatUnitPrice(p.priceBeforeBonus, p.salesUnitSize)}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${formatDate(p.bonusEndDate)}</td>
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

async function main(): Promise<void> {
  const sender = process.env.EMAIL_SENDER;
  const password = process.env.EMAIL_PASSWORD;
  const recipient = process.env.EMAIL_RECIPIENT;
  const appUrl = process.env.APP_URL || 'http://localhost:3001';

  if (!sender || !password || !recipient) {
    console.error('Missing email config. Set EMAIL_SENDER, EMAIL_PASSWORD, EMAIL_RECIPIENT in .env');
    process.exit(1);
  }

  // Load saved products
  const saved = await productStore.getAll();
  if (saved.length === 0) {
    console.log('No saved products, skipping email.');
    return;
  }

  // Check bonus status per store
  console.log(`Checking bonus for ${saved.length} products...`);
  const bonusProducts: BonusProduct[] = [];
  for (const [storeName, adapter] of Object.entries(stores)) {
    const storeProducts = saved.filter(p => p.store === storeName);
    if (storeProducts.length === 0) continue;
    try {
      const { results } = await adapter.checkBonus(storeProducts);
      await priceHistory.recordSnapshots(results.map(product => ({
        productId: product.savedId || `${storeName}-${product.productId}`,
        data: product,
      }))).catch(() => {});
      bonusProducts.push(...results);
    } catch (err) {
      console.error(`Error checking ${storeName}:`, errorMessage(err));
    }
  }

  console.log(`Found ${bonusProducts.length} bonus products.`);

  // Build email
  const today = new Date().toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const html = buildHtml(bonusProducts, appUrl, today);

  // Send via Gmail SMTP
  const transporter = createTransport({
    service: 'gmail',
    auth: {
      user: sender,
      pass: password,
    },
  });

  await transporter.sendMail({
    from: sender,
    to: recipient,
    subject: `Korting Scanner Update - ${today}`,
    html,
  });

  console.log(`Email sent to ${recipient}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
