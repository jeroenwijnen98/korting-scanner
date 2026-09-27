import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { SavedProduct } from '../types.ts';

/** What a client posts to save a product: a product from search or detail. */
export type NewSavedProduct = Pick<SavedProduct, 'store' | 'storeProductId' | 'title'>
  & Partial<Pick<SavedProduct, 'brand' | 'salesUnitSize' | 'mainCategory' | 'subCategory'>>
  & { imageUrl?: string | null };

/** Fields that may change on a saved product after it is saved. */
export type SavedProductFields = Partial<Pick<SavedProduct, 'imageUrl' | 'productGroup'>>;

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const FILE_PATH = join(DATA_DIR, 'products.json');

async function ensureDataDir(): Promise<void> {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

async function readProducts(): Promise<SavedProduct[]> {
  await ensureDataDir();
  try {
    const data = await readFile(FILE_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

async function writeProducts(products: SavedProduct[]): Promise<void> {
  await ensureDataDir();
  await writeFile(FILE_PATH, JSON.stringify(products, null, 2));
}

export async function getAll(): Promise<SavedProduct[]> {
  return readProducts();
}

export async function add(product: NewSavedProduct): Promise<SavedProduct | null> {
  const products = await readProducts();
  const id = `${product.store}-${product.storeProductId}`;
  if (products.find(p => p.id === id)) {
    return null;
  }
  const entry: SavedProduct = {
    id,
    store: product.store,
    storeProductId: product.storeProductId,
    title: product.title,
    brand: product.brand || '',
    salesUnitSize: product.salesUnitSize || '',
    mainCategory: product.mainCategory || '',
    subCategory: product.subCategory || '',
    imageUrl: product.imageUrl || '',
    addedAt: new Date().toISOString(),
  };
  products.push(entry);
  await writeProducts(products);
  return entry;
}

export async function remove(id: string): Promise<boolean> {
  const products = await readProducts();
  const idx = products.findIndex(p => p.id === id);
  if (idx === -1) return false;
  products.splice(idx, 1);
  await writeProducts(products);
  return true;
}

export async function update(id: string, fields: SavedProductFields): Promise<SavedProduct | null> {
  const products = await readProducts();
  const product = products.find(p => p.id === id);
  if (!product) return null;
  Object.assign(product, fields);
  await writeProducts(products);
  return product;
}

export async function bulkUpdate(
  updates: { id: string; fields: SavedProductFields }[],
): Promise<SavedProduct[]> {
  const products = await readProducts();
  const byId = new Map(products.map(p => [p.id, p]));
  for (const { id, fields } of updates) {
    const p = byId.get(id);
    if (p) Object.assign(p, fields);
  }
  await writeProducts(products);
  return products;
}
