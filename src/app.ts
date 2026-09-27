import express from 'express';
import type { Express } from 'express';
import { AUTOQUIT } from './config.ts';
import { router as apiRouter, errorHandler } from './routes/api.ts';
import { attachIdleShutdown } from './services/idleShutdown.ts';

// Builds the app without listening; server.ts does the listen.
export function createApp(): Express {
  const app = express();

  app.use(express.json());
  app.use(express.static('public'));

  attachIdleShutdown(app, { enabled: AUTOQUIT });

  app.use('/api', apiRouter);
  app.use(errorHandler);

  return app;
}
