import { join, resolve } from 'node:path';

// Read from the environment, which server.ts fills from .env first.
export const PORT = Number(process.env.PORT) || 3001;

// Set by KortingScanner.app and restart.command: quit with the last window.
export const AUTOQUIT = process.env.KORTING_AUTOQUIT === '1';

// grocer's address: with it a physical-store bonus can be added to its list.
export const GROCER_URL = process.env.GROCER_URL || null;

/**
 * Where the data files live: KORTING_DATA_DIR (relative to the cwd) or else
 * src/data. Read on each call, not at import: the bonus email script loads
 * .env only after its imports have run.
 */
export function dataFile(name: string): string {
  const dir = process.env.KORTING_DATA_DIR;
  return join(dir ? resolve(dir) : join(import.meta.dirname, 'data'), name);
}
