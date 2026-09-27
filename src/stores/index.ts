import type { StoreName } from '../types.ts';
import type { StoreAdapter } from './base.ts';
import { ah } from './ah.ts';
import { dirk } from './dirk.ts';
import { kruidvat } from './kruidvat.js';
import { etos } from './etos.js';

export const stores: Record<StoreName, StoreAdapter> = { ah, dirk, kruidvat, etos };
