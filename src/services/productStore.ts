import type { SavedProduct } from '../types.ts';
import { readJson, updateJson } from './jsonFile.ts';
import { dataFile } from '../config.ts';

/** What a client posts to save a product: a product from search or detail. */
export type NewSavedProduct = Pick<SavedProduct, 'store' | 'storeProductId' | 'title'>
  & Partial<Pick<SavedProduct, 'brand' | 'salesUnitSize' | 'mainCategory' | 'subCategory'>>
  & { imageUrl?: string | null };

/** Fields that may change on a saved product after it is saved. */
export type SavedProductFields = Partial<Pick<SavedProduct, 'imageUrl' | 'productGroup'>>;

const FILE = 'products.json';

export async function getAll(): Promise<SavedProduct[]> {
  return readJson<SavedProduct[]>(dataFile(FILE), []);
}

export async function add(product: NewSavedProduct): Promise<SavedProduct | null> {
  return updateJson<SavedProduct[], SavedProduct | null>(dataFile(FILE), [], (products) => {
    const id = `${product.store}-${product.storeProductId}`;
    if (products.find(p => p.id === id)) {
      return { changed: false, result: null };
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
    return { changed: true, result: entry };
  });
}

export async function remove(id: string): Promise<boolean> {
  return updateJson<SavedProduct[], boolean>(dataFile(FILE), [], (products) => {
    const idx = products.findIndex(p => p.id === id);
    if (idx === -1) return { changed: false, result: false };
    products.splice(idx, 1);
    return { changed: true, result: true };
  });
}

export async function update(id: string, fields: SavedProductFields): Promise<SavedProduct | null> {
  return updateJson<SavedProduct[], SavedProduct | null>(dataFile(FILE), [], (products) => {
    const product = products.find(p => p.id === id);
    if (!product) return { changed: false, result: null };
    Object.assign(product, fields);
    return { changed: true, result: product };
  });
}

export async function bulkUpdate(
  updates: { id: string; fields: SavedProductFields }[],
): Promise<SavedProduct[]> {
  return updateJson<SavedProduct[], SavedProduct[]>(dataFile(FILE), [], (products) => {
    const byId = new Map(products.map(p => [p.id, p]));
    for (const { id, fields } of updates) {
      const p = byId.get(id);
      if (p) Object.assign(p, fields);
    }
    return { changed: true, result: products };
  });
}
