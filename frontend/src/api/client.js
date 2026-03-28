/**
 * api/client.js
 * All backend fetch calls for The Pre-Mortem Machine.
 * Singleton: import { api } from './api/client.js'
 */

const TIMEOUT_MS = 5000;

class ApiClient {
  /**
   * @param {string} baseUrl  e.g. "http://localhost:8000"
   */
  constructor(baseUrl) {
    this._base = baseUrl.replace(/\/$/, '');
  }

  /**
   * Internal fetch with AbortController timeout, timing log, and error safety.
   * @param {string} path        URL path starting with "/"
   * @param {{ fallback?: * }} [opts]
   * @returns {Promise<*>}
   */
  async _fetch(path, opts = {}) {
    const url = this._base + path;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const t0 = performance.now();

    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      const elapsed = Math.round(performance.now() - t0);
      console.log(`[PMM] GET ${path} → ${elapsed}ms`);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      clearTimeout(timeoutId);
      const elapsed = Math.round(performance.now() - t0);
      const msg = err.name === 'AbortError' ? 'Timeout after 5000ms' : (err.message || String(err));
      console.warn(`[PMM] GET ${path} → ERROR (${elapsed}ms): ${msg}`);

      if (opts.fallback !== undefined) {
        return { ...opts.fallback, stale: true };
      }
      return { error: true, message: msg, stale: true };
    }
  }

  /** GET /companies */
  async getCompanies(opts) {
    return this._fetch('/companies', opts);
  }

  /** GET /company/{ticker} */
  async getCompany(ticker, opts) {
    return this._fetch(`/company/${encodeURIComponent(ticker)}`, opts);
  }

  /** GET /canary */
  async getCanary(opts) {
    return this._fetch('/canary', opts);
  }

  /** GET /blame-chain/{ticker} */
  async getBlameChain(ticker, opts) {
    return this._fetch(`/blame-chain/${encodeURIComponent(ticker)}`, opts);
  }

  /** GET /live */
  async getLive(opts) {
    return this._fetch('/live', opts);
  }
}

export const api = new ApiClient('http://localhost:8000');
export default ApiClient;
