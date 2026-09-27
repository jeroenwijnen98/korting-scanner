import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { PriceSnapshot, Product } from '../types.ts';

/** Price snapshots per saved product id, oldest first. */
type History = Record<string, PriceSnapshot[]>;

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const FILE_PATH = join(DATA_DIR, 'price-history.json');

async function ensureDataDir(): Promise<void> {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

async function readHistory(): Promise<History> {
  await ensureDataDir();
  try {
    const data = await readFile(FILE_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
}

async function writeHistory(history: History): Promise<void> {
  await ensureDataDir();
  await writeFile(FILE_PATH, JSON.stringify(history, null, 2));
}

export async function recordSnapshot(
  productId: string,
  data: Pick<Product, 'currentPrice' | 'priceBeforeBonus' | 'isBonus' | 'bonusMechanism'>,
): Promise<void> {
  const history = await readHistory();
  if (!history[productId]) history[productId] = [];

  const entries = history[productId];
  const last = entries[entries.length - 1];

  const snapshot: PriceSnapshot = {
    date: new Date().toISOString().slice(0, 10),
    currentPrice: data.currentPrice ?? null,
    priceBeforeBonus: data.priceBeforeBonus ?? null,
    isBonus: data.isBonus ?? false,
    bonusMechanism: data.bonusMechanism || '',
  };

  // Only append if different from last entry (or first entry)
  if (last &&
      last.currentPrice === snapshot.currentPrice &&
      last.isBonus === snapshot.isBonus &&
      last.bonusMechanism === snapshot.bonusMechanism) {
    return;
  }

  entries.push(snapshot);
  await writeHistory(history);
}

export async function getHistory(productId: string): Promise<PriceSnapshot[]> {
  const history = await readHistory();
  const entries = history[productId] || [];
  return [...entries].reverse(); // newest first
}
