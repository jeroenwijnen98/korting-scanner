// @ts-check

/**
 * @typedef {{ productGroup?: string | null, paused?: boolean | null }} Pausable
 */

/**
 * Which saved products Mijn Producten moves down to the collapsed Gepauzeerd
 * section. A product group is never split across the two: it stays above,
 * whole, while any of its shown members is unpaused, and goes down once they
 * are all paused. A product without a group goes down when it is paused
 * ("Niet gecategoriseerd" is not a group that holds it up).
 * @template {Pausable} P
 * @param {P[]} products the saved products the store filter shows; only these
 *   decide whether a group still has an unpaused member
 * @returns {{ above: P[], paused: P[] }} both in the order given
 */
export function splitPaused(products) {
  const groupsWithUnpaused = new Set(
    products.filter(p => p.productGroup && !p.paused).map(p => p.productGroup),
  );
  /** @type {P[]} */
  const above = [];
  /** @type {P[]} */
  const paused = [];
  for (const p of products) {
    const staysAbove = p.productGroup ? groupsWithUnpaused.has(p.productGroup) : !p.paused;
    (staysAbove ? above : paused).push(p);
  }
  return { above, paused };
}

/**
 * The members of one section, paused ones after the unpaused ones, each part
 * keeping the order it was given in (unit price).
 * @template {Pausable} P
 * @param {P[]} items
 * @returns {P[]} a new array
 */
export function pausedLast(items) {
  return [...items.filter(p => !p.paused), ...items.filter(p => p.paused)];
}

/**
 * How the cards of one section read on Mijn Producten. In a mixed group (some
 * but not all members paused) the paused members hide behind a row with their
 * count, and show under it while the group is expanded. A section without
 * paused members, or with only paused members (it sits under Gepauzeerd),
 * shows everything and has no row.
 * @template {Pausable} P
 * @param {P[]} items the section's members, paused ones last (`pausedLast`)
 * @param {boolean} expanded whether the user opened this group's row
 * @returns {{ shown: P[], row: string | null, underRow: P[] }} `row` is the
 *   row's text, or null when the section has none
 */
export function mixedGroupLayout(items, expanded) {
  const unpaused = items.filter(p => !p.paused);
  const paused = items.filter(p => p.paused);
  if (unpaused.length === 0 || paused.length === 0) return { shown: items, row: null, underRow: [] };
  return {
    shown: unpaused,
    row: `${paused.length} gepauzeerd`,
    underRow: expanded ? paused : [],
  };
}
