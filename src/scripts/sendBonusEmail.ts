import dotenv from 'dotenv';
import { join } from 'node:path';
import { checkSavedProducts } from '../services/priceCheck.ts';
import { stores } from '../stores/index.ts';
import { buildHtml } from '../services/bonusEmail.ts';
import { sendToMe } from '../services/emailMe.ts';

const ROOT = join(import.meta.dirname, '..', '..');

// Variables already set in the environment win over .env; a missing .env is fine.
dotenv.config({ path: join(ROOT, '.env'), quiet: true });

async function main(): Promise<void> {
  const appUrl = process.env.APP_URL || 'http://localhost:3001';
  const grocerUrl = process.env.GROCER_URL || null;

  console.log('Checking saved products...');
  const overview = await checkSavedProducts(stores);

  console.log(`Found ${overview.bonusProducts.length} bonus products.`);
  if (overview.summary.storesDown.length > 0) {
    console.log(`Stores down: ${overview.summary.storesDown.join(', ')}.`);
  }

  // Build email
  const today = new Date().toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const html = buildHtml(overview, { appUrl, today, grocerUrl, at: Date.now() });

  // email-me fixes the recipient and holds the credentials.
  sendToMe({ subject: `Korting Scanner Update - ${today}`, html });

  console.log('Email sent.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
