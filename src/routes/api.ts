import { Router } from 'express';
import type { ErrorRequestHandler } from 'express';
import * as productStore from '../services/productStore.ts';
import * as priceHistory from '../services/priceHistory.ts';
import { checkAllBonuses } from '../services/bonusCheck.ts';
import { cheapestPerDate } from '../services/groupHistory.ts';
import type { StoreAdapter } from '../stores/base.ts';
import type { StoreName } from '../types.ts';
import { errorMessage } from '../../public/js/utils/errorMessage.js';

/** The store adapter per store name; tests pass fakes. */
export type StoreRegistry = Partial<Record<StoreName, StoreAdapter>>;

// Express 5 passes a rejected handler promise on to `errorHandler` below, so
// the handlers need no try/catch of their own for the generic 500.
export function createApiRouter(stores: StoreRegistry): Router {
  const router = Router();

  /** The store adapter for a store name from the request, if there is one. */
  function adapterFor(store: unknown): StoreAdapter | undefined {
    return typeof store === 'string' && Object.hasOwn(stores, store)
      ? stores[store as StoreName]
      : undefined;
  }

  // List saved products
  router.get('/products', async (req, res) => {
    res.json(await productStore.getAll());
  });

  // Save a product
  router.post('/products', async (req, res) => {
    const entry = await productStore.add(req.body);
    if (!entry) {
      return res.status(409).json({ error: 'Product already saved' });
    }
    res.status(201).json(entry);
  });

  // Remove a saved product
  router.delete('/products/:id', async (req, res) => {
    const removed = await productStore.remove(req.params.id);
    if (!removed) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ ok: true });
  });

  // Search products from a store
  router.get('/search', async (req, res) => {
    const { store, q } = req.query;
    if (!store || !q || typeof q !== 'string') {
      return res.status(400).json({ error: 'store and q params required' });
    }
    const adapter = adapterFor(store);
    if (!adapter) {
      return res.status(400).json({ error: `Unknown store: ${store}` });
    }
    res.json(await adapter.searchProducts(q));
  });

  // Get product detail from store
  router.get('/product/:store/:storeProductId', async (req, res) => {
    const { store, storeProductId } = req.params;
    const adapter = adapterFor(store);
    if (!adapter) {
      return res.status(400).json({ error: `Unknown store: ${store}` });
    }
    const detail = await adapter.getProductDetail(storeProductId);
    if (!detail) {
      return res.status(404).json({ error: 'Product not found' });
    }
    priceHistory.recordSnapshot(`${store}-${storeProductId}`, detail).catch(() => {});
    res.json(detail);
  });

  // Backfill imageUrl for saved products that are missing it
  router.post('/products/sync-images', async (req, res) => {
    const saved = await productStore.getAll();
    const missing = saved.filter(p => !p.imageUrl);
    const fetched = await Promise.all(missing.map(async (p) => {
      try {
        const adapter = adapterFor(p.store);
        if (!adapter) return null;
        const detail = await adapter.getProductDetail(p.storeProductId);
        if (detail?.imageUrl) {
          return { id: p.id, fields: { imageUrl: detail.imageUrl } };
        }
      } catch { /* skip on error */ }
      return null;
    }));
    const updates = fetched.filter(u => u !== null);
    const products = updates.length > 0
      ? await productStore.bulkUpdate(updates)
      : saved;
    res.json(products);
  });

  // Get price history for a product
  router.get('/history/:productId', async (req, res) => {
    res.json(await priceHistory.getHistory(req.params.productId));
  });

  // Check bonus status for saved products
  router.get('/bonus', async (req, res) => {
    const saved = await productStore.getAll();
    res.json(await checkAllBonuses(saved, stores));
  });

  // Update a saved product (e.g. set productGroup)
  router.patch('/products/:id', async (req, res) => {
    const { id } = req.params;
    // Express 5 leaves req.body undefined when the request has no JSON body.
    const { productGroup } = req.body ?? {};
    const updated = await productStore.update(id, { productGroup: productGroup ?? null });
    if (!updated) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(updated);
  });

  // Get cheapest-per-unit history for a product group
  router.get('/group-history/:groupName', async (req, res) => {
    const { groupName } = req.params;
    const all = await productStore.getAll();
    const entries = await Promise.all(
      all
        .filter(p => p.productGroup === groupName)
        .map(async saved => ({ saved, history: await priceHistory.getHistory(saved.id) })),
    );
    res.json(cheapestPerDate(entries));
  });

  return router;
}

/**
 * Any error a handler throws (or rejects with) ends here as `500 { error }`.
 * A client error that carries its own 4xx status, such as a malformed JSON
 * body, keeps that status.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = typeof err?.status === 'number' && err.status >= 400 && err.status < 500
    ? err.status
    : 500;
  res.status(status).json({ error: errorMessage(err) });
};
