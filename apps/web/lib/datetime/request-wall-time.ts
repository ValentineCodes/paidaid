/**
 * Wall clock for request-time rendering (after `connection()`).
 * Kept in a non-component module so page components stay eslint-pure.
 */
export function getRequestWallTimeMs(): number {
  return Date.now();
}
