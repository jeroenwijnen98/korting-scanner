import { Router } from 'express';
import type { ErrorRequestHandler } from 'express';
import * as productStore from '../services/productStore.ts';
import * as priceHistory from '../services/priceHistory.ts';
import { checkSavedProducts } from '../services/priceCheck.ts';
import { observeSavedProducts } from '../services/priceObservation.ts';
import { cheapestPerDate } from '../services/groupHistory.ts';
import type { StoreAdapter } from '../stores/base.ts';
import type { BonusAnswer, BonusProduct, Product, StoreName } from '../types.ts';
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

  // Get product detail from store; a saved product is observed (snapshot and
  // image sync), any other product is only fetched
  router.get('/product/:store/:storeProductId', async (req, res) => {
    const { store, storeProductId } = req.params;
    const adapter = adapterFor(store);
    if (!adapter) {
      return res.status(400).json({ error: `Unknown store: ${store}` });
    }
    const saved = (await productStore.getAll())
      .find(p => p.store === store && p.storeProductId === storeProductId);
    let detail: Product | null;
    if (saved) {
      const { observed } = await observeSavedProducts({ [saved.store]: adapter }, [saved]);
      // The client gets the product as the store has it, without the saved id
      detail = observed[0] ? withoutSavedId(observed[0]) : null;
    } else {
      detail = await adapter.getProductDetail(storeProductId);
    }
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

  // Get price history for a product
  router.get('/history/:productId', async (req, res) => {
    res.json(await priceHistory.getHistory(req.params.productId));
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

function withoutSavedId({ savedId: _, ...product }: BonusProduct): Product {
  return product;
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
