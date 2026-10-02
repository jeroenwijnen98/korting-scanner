import express from 'express';
import type { Express } from 'express';
import { AUTOQUIT } from './config.ts';
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
}

// Builds the app without listening; server.ts does the listen.
export function createApp({ stores = defaultStores, idleShutdown = {} }: AppDeps = {}): Express {
  const app = express();

  app.use(express.json());
  app.use(express.static('public'));
  // The source app icon and its renders double as the favicon.
  app.use('/assets', express.static('assets'));

  attachIdleShutdown(app, { enabled: AUTOQUIT, ...idleShutdown });

  app.use('/api', createApiRouter(stores));
  app.use(errorHandler);

  return app;
}
