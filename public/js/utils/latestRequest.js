// @ts-check

/**
 * Tells whether an answer still belongs to the newest request. `start()`
 * begins a request and returns its check; a later `start()` or `cancel()`
 * makes every earlier check false, so an answer that arrives late can be
 * dropped.
 * @returns {{ start: () => () => boolean, cancel: () => void }}
 */
export function latestRequest() {
  let latest = 0;
  return {
    start() {
      const token = ++latest;
      return () => token === latest;
    },
    cancel() {
      latest++;
    },
  };
}
