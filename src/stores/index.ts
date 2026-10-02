import type { StoreName } from '../types.ts';
import type { StoreAdapter } from './base.ts';
import { ah } from './ah.ts';
import { dirk } from './dirk.ts';
import { kruidvat } from './kruidvat.ts';
import { etos } from './etos.ts';
import { bol } from './bol.ts';

export const stores: Record<StoreName, StoreAdapter> = { ah, dirk, kruidvat, etos, bol };
