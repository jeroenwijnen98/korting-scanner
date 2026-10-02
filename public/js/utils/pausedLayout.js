// @ts-check
import { productCount } from './format.js';

/**
 * @typedef {Pick<import('../../../src/types.ts').SavedProduct, 'productGroup' | 'paused'>} Pausable
 */

/**
 * Which saved products Mijn Producten lists, and which it moves down to the
 * collapsed Gepauzeerd section. A product group is never split across the two:
 * it stays listed, whole, while any of its shown members is unpaused, and goes
 * down once they are all paused. A product without a group goes down when it
 * is paused ("Niet gecategoriseerd" is not a group that holds it up).
 * @template {Pausable} P
 * @param {P[]} products the saved products the store filter shows; only these
 *   decide whether a group still has an unpaused member
 * @returns {{ listed: P[], paused: P[] }} both in the order given
 */
export function splitPaused(products) {
  const groupsWithUnpaused = new Set(
    products.filter(p => p.productGroup && !p.paused).map(p => p.productGroup),
  );
  /** @type {P[]} */
  const listed = [];
  /** @type {P[]} */
  const paused = [];
  for (const p of products) {
    const staysListed = p.productGroup ? groupsWithUnpaused.has(p.productGroup) : !p.paused;
    (staysListed ? listed : paused).push(p);
  }
  return { listed, paused };
}

/**
 * How one section's header count and cards read. In a mixed group (some but
 * not all members paused) the paused members hide behind a row with their
 * count, and show under it while the group is expanded. A section without
 * paused members, or with only paused members (it sits under Gepauzeerd),
 * shows everything and has no row.
 * @template {Pausable} P
 * @param {P[]} items the section's members, in the order they show in
 * @param {boolean} expanded whether the user opened this group's row
 * @returns {{ countLabel: string, shown: P[], rowLabel: string | null, underRow: P[] }}
 *   `rowLabel` is null when the section has no row
 */
export function sectionLayout(items, expanded) {
  const unpaused = items.filter(p => !p.paused);
  const paused = items.filter(p => p.paused);
  if (unpaused.length === 0 || paused.length === 0) {
    return { countLabel: productCount(items.length), shown: items, rowLabel: null, underRow: [] };
  }
  return {
    countLabel: `${productCount(unpaused.length)} · ${paused.length} gepauzeerd`,
    shown: unpaused,
    rowLabel: `${paused.length} gepauzeerd`,
    underRow: expanded ? paused : [],
  };
}
