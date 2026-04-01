import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const FILE_PATH = join(DATA_DIR, 'products.json');

async function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

async function readProducts() {
  await ensureDataDir();
  try {
    const data = await readFile(FILE_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeProducts(products) {
  await ensureDataDir();
  await writeFile(FILE_PATH, JSON.stringify(products, null, 2));
}

export async function getAll() {
  return readProducts();
}

export async function add(product) {
  const products = await readProducts();
  const id = `${product.store}-${product.storeProductId}`;
  if (products.find(p => p.id === id)) {
    return null;
  }
  const entry = {
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

export async function remove(id) {
  const products = await readProducts();
  const idx = products.findIndex(p => p.id === id);
  if (idx === -1) return false;
  products.splice(idx, 1);
  await writeProducts(products);
  return true;
}

export async function update(id, fields) {
  const products = await readProducts();
  const product = products.find(p => p.id === id);
  if (!product) return null;
  Object.assign(product, fields);
  await writeProducts(products);
  return product;
}
