/**
 * utils/formatters.js
 * Pure utility functions — no DOM access.
 * The Pre-Mortem Machine
 */

/** "7.4" — always 1 decimal place */
export function formatScore(score) {
  return Number(score ?? 0).toFixed(1);
}

/** "74%" — 0-1 input, integer output */
export function formatConfidence(confidence) {
  return Math.round((confidence ?? 0) * 100) + '%';
}

/** "28 MAR 2026 10:23 GMT" */
export function formatDateTime(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    const day = String(d.getUTCDate()).padStart(2, '0');
    const month = d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' }).toUpperCase();
    const year = d.getUTCFullYear();
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return `${day} ${month} ${year} ${hh}:${mm} GMT`;
  } catch {
    return isoString;
  }
}

/** "10:23:04 GMT" */
export function formatTime(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss} GMT`;
  } catch {
    return isoString;
  }
}

/** "+0.6" or "-0.3" — always show sign */
export function formatDelta(delta) {
  const n = Number(delta ?? 0);
  const sign = n >= 0 ? '+' : '';
  return sign + n.toFixed(1);
}

/** "19 days" */
export function formatLeadDays(days) {
  return `${days ?? 0} days`;
}

/** "status-stable" | "status-elevated" | "status-critical" */
export function statusToClass(status) {
  switch ((status || '').toUpperCase()) {
    case 'CRITICAL': return 'status-critical';
    case 'ELEVATED': return 'status-elevated';
    default:         return 'status-stable';
  }
}

/** "STABLE" | "ELEVATED" | "CRITICAL" */
export function statusToLabel(status) {
  switch ((status || '').toUpperCase()) {
    case 'CRITICAL': return 'CRITICAL';
    case 'ELEVATED': return 'ELEVATED';
    default:         return 'STABLE';
  }
}

/** human-readable signal key labels */
const SIGNAL_LABELS = {
  fda_recall_velocity: 'FDA Recall Velocity',
  reddit_oos_velocity: 'Reddit OOS Velocity',
  wikipedia_edit_wars: 'Wikipedia Edit Wars',
  fred_macro_backdrop: 'FRED Macro Backdrop',
  adzuna_job_velocity: 'Adzuna Job Velocity',
  edgar_8k_keywords:   'SEC 8-K Keywords',
};

export function signalKeyToLabel(key) {
  return SIGNAL_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default {
  formatScore,
  formatConfidence,
  formatDateTime,
  formatTime,
  formatDelta,
  formatLeadDays,
  statusToClass,
  statusToLabel,
  signalKeyToLabel,
};
