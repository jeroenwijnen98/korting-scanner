// @ts-check

/**
 * What the "Pauzeren" / "Hervatten" control on the product card and the
 * product detail says for a saved product in the given paused state.
 * @param {boolean} isPaused
 * @returns {{ label: string, title: string }}
 */
export function pauseControlText(isPaused) {
  return isPaused
    ? { label: 'Hervatten', title: 'Bonus weer melden' }
    : { label: 'Pauzeren', title: 'Bonus voorlopig niet melden' };
}
