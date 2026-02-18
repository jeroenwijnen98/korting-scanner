import { createTransport } from 'nodemailer';
import * as productStore from '../services/productStore.js';
import * as priceHistory from '../services/priceHistory.js';
import { stores } from '../stores/index.js';
import { parseUnitSize, calcPricePerUnit } from '../utils/unitPrice.js';
import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// Load .env manually (no extra dependency)
async function loadEnv() {
  try {
    const content = await readFile(join(ROOT, '.env'), 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env file may not exist, rely on environment variables
  }
}

function formatPrice(price) {
  if (price == null) return '-';
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
  }).format(price);
}

function formatUnitPrice(price, salesUnitSize) {
  const { volume, unit } = parseUnitSize(salesUnitSize);
  const result = calcPricePerUnit(price, volume, unit);
  if (!result) return '-';
  return `${formatPrice(result.unitPrice)}/${result.standardUnit}`;
}

function formatDate(dateStr) {
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

function buildHtml(bonusProducts) {
  const storeNames = { ah: 'Albert Heijn', dirk: 'Dirk' };
  const grouped = {};
  bonusProducts.forEach(p => {
    if (!grouped[p.store]) grouped[p.store] = [];
    grouped[p.store].push(p);
  });

  const today = new Date().toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  let html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background: #f5f5f5; padding: 20px;">
  <div style="max-width: 800px; margin: 0 auto; background: white; border-radius: 8px; padding: 24px;">
    <h1 style="font-size: 24px; margin: 0 0 4px 0;">Korting Scanner Update</h1>
    <p style="color: #666; margin: 0 0 24px 0;">${today}</p>`;

  if (bonusProducts.length === 0) {
    html += `<p style="color: #999; font-style: italic;">Geen opgeslagen producten zijn momenteel in de bonus.</p>`;
  } else {
    for (const [store, products] of Object.entries(grouped)) {
      html += `
    <h2 style="font-size: 18px; color: ${store === 'ah' ? '#00A0E2' : '#ED1C24'}; margin: 24px 0 12px 0;">${storeNames[store] || store}</h2>
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

async function main() {
  await loadEnv();

  const sender = process.env.EMAIL_SENDER;
  const password = process.env.EMAIL_PASSWORD;
  const recipient = process.env.EMAIL_RECIPIENT;

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
  const bonusProducts = [];
  for (const [storeName, adapter] of Object.entries(stores)) {
    const storeProducts = saved.filter(p => p.store === storeName);
    if (storeProducts.length === 0) continue;
    try {
      const results = await adapter.checkBonus(storeProducts);
      for (const product of results) {
        await priceHistory.recordSnapshot(product.savedId || `${storeName}-${product.productId}`, product).catch(() => {});
      }
      bonusProducts.push(...results);
    } catch (err) {
      console.error(`Error checking ${storeName}:`, err.message);
    }
  }

  console.log(`Found ${bonusProducts.length} bonus products.`);

  // Build email
  const today = new Date().toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const html = buildHtml(bonusProducts);

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
