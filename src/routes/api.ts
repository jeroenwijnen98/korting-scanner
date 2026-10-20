import { Router } from 'express';
import type { ErrorRequestHandler } from 'express';
import * as productStore from '../services/productStore.ts';
import { checkSavedProducts } from '../services/priceCheck.ts';
import { observeSavedProducts } from '../services/priceObservation.ts';
import { getSavedProductDetail } from '../services/savedProductDetail.ts';
import type { StoreAdapter } from '../stores/base.ts';
import type { BonusAnswer, StoreName } from '../types.ts';
import { errorMessage } from '../../public/js/utils/errorMessage.js';

/** The store adapter per store name; tests pass fakes. */
export type StoreRegistry = Partial<Record<StoreName, StoreAdapter>>;

// Express 5 passes a rejected handler promise on to `errorHandler` below, so
// the handlers need no try/catch of their own for the generic 500.
export function createApiRouter(
  stores: StoreRegistry,
  { grocerUrl = null }: { grocerUrl?: string | null } = {},
): Router {
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

  // A saved product's detail in one answer: the product as observed now, its
  // price history, its product group's history and its saved fields
  router.get('/products/:id/detail', async (req, res) => {
    const detail = await getSavedProductDetail(stores, req.params.id);
    if (!detail) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(detail);
  });

  // Backfill imageUrl for saved products that are missing it: they are
  // observed, so each also gets a price snapshot and Dirk batches
  router.post('/products/sync-images', async (req, res) => {
    const missing = (await productStore.getAll()).filter(p => !p.imageUrl);
    if (missing.length > 0) await observeSavedProducts(stores, missing);
    res.json(await productStore.getAll());
  });

  // Check bonus status for saved products; grocerUrl rides along for Toevoegen
  router.get('/bonus', async (req, res) => {
    const answer: BonusAnswer = { ...await checkSavedProducts(stores), grocerUrl };
    res.json(answer);
  });

  // Edit a saved product: only the fields the body sends change (null clears)
  router.patch('/products/:id', async (req, res) => {
    const { id } = req.params;
    // Express 5 leaves req.body undefined when the request has no JSON body;
    // the store ignores keys outside its editable fields.
    const updated = await productStore.update(id, req.body ?? {});
    if (!updated) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(updated);
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
