import dotenv from 'dotenv';
import { createTransport } from 'nodemailer';
import { join } from 'node:path';
import { checkSavedProducts } from '../services/priceCheck.ts';
import { stores } from '../stores/index.ts';
import { buildHtml } from '../services/bonusEmail.ts';

const ROOT = join(import.meta.dirname, '..', '..');

// Variables already set in the environment win over .env; a missing .env is fine.
dotenv.config({ path: join(ROOT, '.env'), quiet: true });

async function main(): Promise<void> {
  const sender = process.env.EMAIL_SENDER;
  const password = process.env.EMAIL_PASSWORD;
  const recipient = process.env.EMAIL_RECIPIENT;
  const appUrl = process.env.APP_URL || 'http://localhost:3001';
  const grocerUrl = process.env.GROCER_URL || null;

  if (!sender || !password || !recipient) {
    console.error('Missing email config. Set EMAIL_SENDER, EMAIL_PASSWORD, EMAIL_RECIPIENT in .env');
    process.exit(1);
  }

  console.log('Checking saved products...');
  const { bonusProducts } = await checkSavedProducts(stores);

  console.log(`Found ${bonusProducts.length} bonus products.`);

  // Build email
  const today = new Date().toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const html = buildHtml(bonusProducts, { appUrl, today, grocerUrl, at: Date.now() });

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
