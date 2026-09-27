import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { PriceSnapshot, Product } from '../types.ts';
import { readJson, updateJson } from './jsonFile.ts';

/** Price snapshots per saved product id, oldest first. */
type History = Record<string, PriceSnapshot[]>;

/** The product fields a price snapshot records. */
type SnapshotData = Pick<Product, 'currentPrice' | 'priceBeforeBonus' | 'isBonus' | 'bonusMechanism'>;

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const FILE_PATH = join(DATA_DIR, 'price-history.json');

/** Append a snapshot to `history`; returns whether it changed anything. */
function appendSnapshot(history: History, productId: string, data: SnapshotData): boolean {
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
    return false;
  }

  entries.push(snapshot);
  return true;
}

/** Record a snapshot for one product. Safe to call concurrently. */
export function recordSnapshot(productId: string, data: SnapshotData): Promise<void> {
  return recordSnapshots([{ productId, data }]);
}

/** Record snapshots for several products with one read and one write. */
export function recordSnapshots(
  snapshots: { productId: string; data: SnapshotData }[],
): Promise<void> {
  return updateJson<History, void>(FILE_PATH, {}, (history) => {
    let changed = false;
    for (const { productId, data } of snapshots) {
      if (appendSnapshot(history, productId, data)) changed = true;
    }
    return { changed, result: undefined };
  });
}

export async function getHistory(productId: string): Promise<PriceSnapshot[]> {
  const history = await readJson<History>(FILE_PATH, {});
  const entries = history[productId] || [];
  return [...entries].reverse(); // newest first
}
