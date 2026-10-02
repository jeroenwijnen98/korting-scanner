// @ts-check

/**
 * @typedef {import('../../../src/types.ts').SavedProduct} SavedProduct
 */

/**
 * What the group button in a product-group header does: pause every member
 * while any is unpaused, else resume them all. Members are taken from all
 * saved products, whatever the store filter shows; a product group spans
 * stores. It is a bulk action on the members, nothing is stored on the group.
 * @param {SavedProduct[]} savedProducts all saved products, every store
 * @param {string} productGroup
 * @returns {{ paused: boolean, ids: string[] }} the pause state to set, and
 *   the ids of the members that do not have it yet
 */
export function groupPauseAction(savedProducts, productGroup) {
  const members = savedProducts.filter(p => p.productGroup === productGroup);
  const paused = members.some(p => !p.paused);
  return {
    paused,
    ids: members.filter(p => Boolean(p.paused) !== paused).map(p => p.id),
  };
}
