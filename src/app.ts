import express from 'express';
import type { Express } from 'express';
import { AUTOQUIT, GROCER_URL } from './config.ts';
import { createApiRouter, errorHandler } from './routes/api.ts';
import type { StoreRegistry } from './routes/api.ts';
import { attachIdleShutdown } from './services/idleShutdown.ts';
import type { IdleShutdownOptions } from './services/idleShutdown.ts';
import { stores as defaultStores } from './stores/index.ts';

export interface AppDeps {
  /** The store adapters; the real ones by default. */
  stores?: StoreRegistry;
  /** Idle shutdown options; `enabled` defaults to KORTING_AUTOQUIT. */
  idleShutdown?: Partial<IdleShutdownOptions>;
  /** grocer's address; GROCER_URL by default. */
  grocerUrl?: string | null;
}

export interface KortingApp {
  app: Express;
  /** Cancels a pending idle quit, so no timer of it keeps the process alive. */
  closeIdleTracker(): void;
}

// Builds the app without listening; server.ts does the listen.
export function createApp({ stores = defaultStores, idleShutdown = {}, grocerUrl = GROCER_URL }: AppDeps = {}): KortingApp {
  const app = express();

  app.use(express.json());
  app.use(express.static('public'));
  // The source app icon and its renders double as the favicon.
  app.use('/assets', express.static('assets'));

  const idleTracker = attachIdleShutdown(app, { enabled: AUTOQUIT, ...idleShutdown });

  app.use('/api', createApiRouter(stores, { grocerUrl }));
  app.use(errorHandler);

  return { app, closeIdleTracker: () => idleTracker.close() };
}
