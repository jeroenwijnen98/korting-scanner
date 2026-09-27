import type { StoreName } from '../types.ts';
import type { StoreAdapter } from './base.ts';
import { ah } from './ah.js';
import { dirk } from './dirk.js';
import { kruidvat } from './kruidvat.js';
import { etos } from './etos.js';

export const stores: Record<StoreName, StoreAdapter> = { ah, dirk, kruidvat, etos };
