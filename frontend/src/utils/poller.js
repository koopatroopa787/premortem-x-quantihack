/**
 * utils/poller.js
 * Resilient polling wrapper.
 * The Pre-Mortem Machine
 */

class Poller {
  /**
   * @param {Function} endpointFn  Async function that fetches endpoint data
   * @param {number}   intervalMs  Normal poll interval in ms
   * @param {Function} callback    Called with data on each successful response
   */
  constructor(endpointFn, intervalMs, callback) {
    this._fn           = endpointFn;
    this._interval     = intervalMs;
    this._callback     = callback;
    this._timer        = null;
    this._running      = false;
    this._errCount     = 0;
    this._degraded     = false;   // true when polling at 5× interval
  }

  /** Start polling immediately, then on the configured interval. */
  start() {
    if (this._running) return;
    this._running = true;
    this._tick();  // fire immediately
  }

  /** Stop polling. */
  stop() {
    this._running = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  /** Adjust the poll interval at runtime. */
  setInterval(ms) {
    this._interval = ms;
  }

  async _tick() {
    if (!this._running) return;

    try {
      const data = await this._fn();

      // Success — reset error tracking
      if (this._errCount > 0) {
        this._errCount = 0;
        if (this._degraded) {
          console.log('[PMM POLL] Recovered — returning to normal interval');
          this._degraded = false;
        }
      }

      if (data && !data.error) {
        this._callback(data);
      }
    } catch (err) {
      this._errCount++;
      console.warn(`[PMM POLL ERROR] Attempt ${this._errCount}: ${err.message || err}`);

      if (this._errCount >= 5 && !this._degraded) {
        this._degraded = true;
        console.warn('[PMM POLL WARN] 5 consecutive failures — reducing poll frequency to 5× interval');
      }
    }

    if (!this._running) return;

    const delay = this._degraded ? this._interval * 5 : this._interval;
    this._timer = setTimeout(() => this._tick(), delay);
  }
}

/**
 * Factory helper.
 * @param {Function} fn          Async endpoint function
 * @param {number}   intervalMs  Poll interval in ms
 * @param {Function} callback    On-data callback
 * @returns {Poller}
 */
export function createPoller(fn, intervalMs, callback) {
  return new Poller(fn, intervalMs, callback);
}

export default Poller;
