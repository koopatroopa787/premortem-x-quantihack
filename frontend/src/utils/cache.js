/**
 * utils/cache.js
 * In-memory TTL cache.
 * The Pre-Mortem Machine
 */

export const TTL_COMPANIES = 30_000;  // 30s
export const TTL_REPORT    = 60_000;  // 60s
export const TTL_CANARY    = 45_000;  // 45s
export const TTL_BLAME     = 60_000;  // 60s

class Cache {
  constructor() {
    this._store = new Map();
  }

  /**
   * Store a value with an expiry.
   * @param {string} key
   * @param {*} value
   * @param {number} ttlMs  Time-to-live in milliseconds
   */
  set(key, value, ttlMs) {
    this._store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Retrieve a value — returns null if expired or absent.
   * @param {string} key
   * @returns {*|null}
   */
  get(key) {
    const entry = this._store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this._store.delete(key);
      return null;
    }
    return entry.value;
  }

  /**
   * Check whether a non-expired entry exists.
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    return this.get(key) !== null;
  }

  /**
   * Remove a specific entry regardless of expiry.
   * @param {string} key
   */
  invalidate(key) {
    this._store.delete(key);
  }

  /** Remove all entries. */
  clear() {
    this._store.clear();
  }
}

export const cache = new Cache();
export default Cache;
