// @ts-check

/**
 * The message of a caught error: catch gives unknown.
 * @param {unknown} err
 * @returns {string}
 */
export function errorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}
