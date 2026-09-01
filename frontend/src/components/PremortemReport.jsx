/**
 * components/PremortemReport.jsx
 * Full Forensic Post-Mortem Report view.
 * The Pre-Mortem Machine — Team APEX
 */

import React, { useEffect, useState } from 'react';
import {
  formatDateTime,
  formatScore,
  formatConfidence,
  signalKeyToLabel,
} from '../utils/formatters.js';

// ── Signal display order (Reddit removed) ─────────────────────────────────────
const SIGNAL_ORDER = [
  'fda_recall_velocity',
  'google_trends',
  'wikipedia_edit_wars',
  'fred_macro_backdrop',
  'adzuna_job_velocity',
  'edgar_8k_keywords',
];

// There used to be a BACKTEST_FALLBACK here — 19 avg lead days, 71% accuracy,
// "20 real CPG events" — substituted whenever the API returned nothing, so the
// card "never displays zeros to judges". Those numbers were not measured from
// anything. The card below now shows the real evaluation from /evaluation, and
// shows nothing at all when no evaluation has been run.

const MOCK_REPORT = {
  report_title: 'PRELIMINARY POST-MORTEM REPORT',
  case_number: 'PMM-2026-UL-0328',
  filed_at: '2026-03-28T10:23:00Z',
  ticker: 'UL',
  name: 'Unilever',
  confidence: 0.74,
  tod_estimate: '60-90 days',
  status: 'CRITICAL',
  score: 7.4,
  cause_of_failure: [
    'FDA: High recall velocity signal — Source: openFDA Enforcement Reports',
    'Consumer: Google Trends OOS search velocity elevated (72%) — Source: pytrends',
    'Supply chain: Shared supplier with 3 companies, 1 currently CRITICAL',
  ],
  signals: {
    fda_recall_velocity: { raw: 0.80, weighted: 0.200, available: true },
    google_trends: { raw: 0.65, weighted: 0.130, available: true },
    wikipedia_edit_wars: { raw: 0.50, weighted: 0.100, available: true },
    fred_macro_backdrop: { raw: 0.40, weighted: 0.060, available: true },
    adzuna_job_velocity: { raw: 0.35, weighted: 0.042, available: true },
    edgar_8k_keywords: { raw: 0.20, weighted: 0.016, available: false },
  },
  stale: false,
};

// ── Signal bar component ───────────────────────────────────────────────────────
function SignalBar({ label, signal, available }) {
  const rawPct = Math.round((signal?.raw ?? 0) * 100);
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: '8px',
      }}>
        <span style={{
          fontSize: '0.75rem', fontWeight: 800,
          color: 'var(--primary)',
          fontFamily: 'var(--font-labels)',
          letterSpacing: '0.05em',
          opacity: available ? 1 : 0.4,
        }}>
          {label.toUpperCase()}
          {!available && (
            <span style={{ marginLeft: '8px', color: 'var(--tertiary)', fontSize: '0.65rem' }}>
              // DEGRADED
            </span>
          )}
        </span>
        <span style={{
          fontSize: '0.8rem', fontWeight: 800,
          color: 'var(--on-background)',
          fontFamily: 'var(--font-display)',
          opacity: available ? 1 : 0.4,
        }}>
          {rawPct}%
        </span>
      </div>
      <div style={{
        height: '8px',
        background: 'var(--surface-container-low)',
        borderRadius: 'var(--radius-full)',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${rawPct}%`,
          height: '100%',
          background: available ? 'var(--primary)' : 'var(--outline-variant)',
          borderRadius: 'var(--radius-full)',
          transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)',
        }} />
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function PremortemReport({ report: reportProp, loading }) {
  const report = reportProp || MOCK_REPORT;
  const isStale = report.stale === true;
  const confPct = Math.round((report.confidence ?? 0) * 100);

  // Measured performance against real FDA recalls, or nothing. No substitutions.
  const [evaluation, setEvaluation] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/evaluation')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d && d.available) setEvaluation(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const best = evaluation
    ? Object.entries(evaluation.predictors || {})
        .filter(([, v]) => typeof v.auc === 'number')
        .sort((a, b) => b[1].auc - a[1].auc)[0]
    : null;

  if (loading) {
    return (
      <div style={{
        minHeight: '300px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div
          className="metric-label pulse"
          style={{ fontSize: '1rem', letterSpacing: '0.2em' }}
        >
          CURATING DOSSIER…
        </div>
      </div>
    );
  }

  return (
    <div className={`fade-in ${isStale ? 'report-stale' : ''}`} style={{ maxWidth: '1200px' }}>

      {/* Stale Warning */}
      {isStale && (
        <div className="glass-panel" style={{
          padding: '12px 24px',
          marginBottom: '32px',
          background: 'rgba(112, 85, 89, 0.1)',
          borderRadius: 'var(--radius-full)',
          fontSize: '0.8rem',
          fontWeight: 700,
          color: 'var(--tertiary)',
          border: '1px solid var(--tertiary)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}>
          LATENCY DETECTED — DATA FLOW DECOUPLED // SHOWING LAST PERSISTED STATE
        </div>
      )}

      {/* Report Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        marginBottom: 'var(--spacing-12)',
      }}>
        <div style={{ flex: 1 }}>
          <div
            className="metric-label"
            style={{ color: 'var(--primary)', marginBottom: '12px', fontSize: '0.85rem' }}
          >
            POST MORTEM DOSSIER
          </div>
          <h1
            className="display-lg"
            style={{ fontSize: '3.5rem', marginBottom: '24px', lineHeight: 0.9 }}
          >
            {report.name}
            <br />
            <span style={{ color: 'var(--outline)', fontWeight: 300 }}>
              {report.ticker}
            </span>
          </h1>

          {/* Metadata Badges */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{
              padding: '8px 20px',
              background: 'var(--surface-container-low)',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.75rem',
              fontWeight: 800,
              fontFamily: 'var(--font-labels)',
              color: 'var(--secondary)',
            }}>
              {report.case_number}
            </div>
            <div style={{
              padding: '8px 20px',
              background: 'var(--surface-container-low)',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.75rem',
              fontWeight: 800,
              fontFamily: 'var(--font-labels)',
              color: 'var(--secondary)',
            }}>
              FILED: {formatDateTime(report.filed_at)}
            </div>
            <div style={{
              padding: '8px 24px',
              background: 'var(--primary)',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.75rem',
              fontWeight: 800,
              fontFamily: 'var(--font-labels)',
              color: 'white',
            }}>
              EST. TOD: {report.tod_estimate || 'IMMUTABLE'}
            </div>
          </div>
        </div>

        {/* Confidence Gauge */}
        <div style={{ textAlign: 'center', minWidth: '140px' }}>
          <div style={{
            width: '120px',
            height: '120px',
            borderRadius: '50%',
            background: `conic-gradient(var(--primary) ${confPct * 3.6}deg, var(--surface-container-low) 0)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 12px 32px rgba(79, 96, 83, 0.12)',
            margin: '0 auto 16px',
          }}>
            <div style={{
              width: '94px',
              height: '94px',
              borderRadius: '50%',
              background: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1.5rem',
              color: 'var(--primary)',
              fontFamily: 'var(--font-display)',
            }}>
              {confPct}%
            </div>
          </div>
          <div className="metric-label" style={{ fontSize: '0.65rem' }}>
            PRECISION CONFIDENCE
          </div>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.2fr 0.8fr',
        gap: 'var(--spacing-12)',
      }}>

        {/* Left Column: Forensic Observations + Backtest */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-12)' }}>

          {/* Forensic Observations */}
          <div>
            <div className="metric-label" style={{ marginBottom: '24px' }}>
              FORENSIC OBSERVATIONS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {(report.cause_of_failure || []).map((cause, i) => (
                <div key={i} style={{
                  padding: '24px',
                  background: 'var(--surface-container-low)',
                  borderRadius: 'var(--radius-lg)',
                  borderLeft: '6px solid var(--primary)',
                  fontSize: '1.1rem',
                  lineHeight: 1.5,
                  fontWeight: 500,
                  color: 'var(--on-background)',
                  fontFamily: 'var(--font-display)',
                }}>
                  {cause}
                </div>
              ))}
            </div>
          </div>

          {/* Measured Performance Card — real evaluation or nothing */}
          <div className="card" style={{
            background: 'var(--primary)',
            color: 'white',
            border: 'none',
          }}>
            <div className="metric-label" style={{
              color: 'rgba(255,255,255,0.7)',
              marginBottom: '24px',
            }}>
              MEASURED PERFORMANCE
            </div>

            {!evaluation || !best ? (
              <div style={{ fontSize: '0.8rem', opacity: 0.75, lineHeight: 1.7 }}>
                No evaluation has been run against real events yet.
                <div style={{ marginTop: '10px', fontSize: '0.65rem', opacity: 0.8 }}>
                  This space previously showed a fixed 71% accuracy that was not
                  measured from anything.
                </div>
              </div>
            ) : (
              <>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '24px',
                }}>
                  <div>
                    <div style={{ fontSize: '2.5rem', fontWeight: 800, lineHeight: 1 }}>
                      {best[1].auc.toFixed(3)}
                    </div>
                    <div style={{
                      fontSize: '0.65rem', fontWeight: 700,
                      marginTop: '8px', opacity: 0.8,
                    }}>
                      AUC (0.500 = CHANCE)
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '2.5rem', fontWeight: 800, lineHeight: 1 }}>
                      {evaluation.lead_days}
                    </div>
                    <div style={{
                      fontSize: '0.65rem', fontWeight: 700,
                      marginTop: '8px', opacity: 0.8,
                    }}>
                      LEAD DAYS TESTED
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '2.5rem', fontWeight: 800, lineHeight: 1 }}>
                      {best[1].events_used}
                    </div>
                    <div style={{
                      fontSize: '0.65rem', fontWeight: 700,
                      marginTop: '8px', opacity: 0.8,
                    }}>
                      REAL FDA RECALLS
                    </div>
                  </div>
                </div>

                <div style={{
                  marginTop: '20px',
                  paddingTop: '16px',
                  borderTop: '1px solid rgba(255,255,255,0.15)',
                  fontSize: '0.7rem',
                  lineHeight: 1.6,
                  fontFamily: 'var(--font-labels)',
                }}>
                  <div style={{ fontWeight: 800, marginBottom: '6px' }}>
                    VERDICT: {String(best[1].verdict || '').toUpperCase()}
                  </div>
                  <div style={{ opacity: 0.6 }}>
                    Best of {Object.keys(evaluation.predictors || {}).length} predictors
                    ({best[0]}). {evaluation.method}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right Column: Signal Decomposition */}
        <div className="card">
          <div className="metric-label" style={{ marginBottom: '32px' }}>
            SIGNAL DECOMPOSITION
          </div>
          {SIGNAL_ORDER.map(key => {
            const sig = (report.signals || {})[key] || {
              raw: 0, weighted: 0, available: false,
            };
            return (
              <SignalBar
                key={key}
                label={signalKeyToLabel(key)}
                signal={sig}
                available={sig.available !== false}
              />
            );
          })}
          <div style={{
            marginTop: '16px',
            padding: '16px',
            background: 'var(--surface-container-low)',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.75rem',
            lineHeight: 1.6,
            color: 'var(--secondary)',
            fontStyle: 'italic',
            fontFamily: 'var(--font-body)',
          }}>
            Signals are normalised per-company against baseline variance.
            Degraded signals are inferred from secondary FRED and Wikipedia streams.
            Reddit signal removed — replaced with Google Trends OOS velocity.
          </div>
        </div>
      </div>
    </div>
  );
}
