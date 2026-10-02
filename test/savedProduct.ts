import type { SavedProduct } from '../src/types.ts';

/** A saved product for tests; the id is `<store>-<storeProductId>`. */
export function saved(id: string, productGroup: string | null, paused?: boolean): SavedProduct {
  const [store, storeProductId] = id.split('-');
  return {
    id, store: store as SavedProduct['store'], storeProductId, title: id, brand: '', salesUnitSize: '',
    mainCategory: '', subCategory: '', imageUrl: '', addedAt: '2026-10-02T00:00:00.000Z',
    productGroup, ...(paused === undefined ? {} : { paused }),
  };
}
