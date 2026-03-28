/**
 * components/PremortemReport.jsx
 * Full Forensic Sage Intelligence view.
 * Forensic Sage
 */

import React from 'react';
import {
  formatDateTime, formatScore, formatConfidence,
  signalKeyToLabel,
} from '../utils/formatters.js';

const SIGNAL_ORDER = [
  'fda_recall_velocity',
  'reddit_oos_velocity',
  'wikipedia_edit_wars',
  'fred_macro_backdrop',
  'adzuna_job_velocity',
  'edgar_8k_keywords',
];

const MOCK_REPORT = {
  report_title: 'FORENSIC SAGE DOSSIER',
  case_number:  'PMM-2026-UL-0328',
  filed_at:     '2026-03-28T10:23:00Z',
  ticker:       'UL',
  name:         'Unilever',
  confidence:   0.74,
  tod_estimate: '60-90 days',
  status:       'CRITICAL',
  score:        7.4,
  cause_of_failure: [
    'FDA: High recall velocity signal — Source: openFDA',
    'Consumer: Reddit out-of-stock mentions up 1.8σ from brand baseline',
    'Supply chain: Shared supplier with 2 companies, 1 currently CRITICAL',
  ],
  backtest_summary: { avg_lead_days: 19, accuracy_rate: 0.71, events_analysed: 6 },
  signals: {
    fda_recall_velocity: { raw: 0.8, weighted: 0.20, available: true },
    reddit_oos_velocity: { raw: 0.6, weighted: 0.12, available: true },
    wikipedia_edit_wars: { raw: 0.5, weighted: 0.10, available: true },
    fred_macro_backdrop: { raw: 0.4, weighted: 0.06, available: true },
    adzuna_job_velocity: { raw: 0.3, weighted: 0.04, available: true },
    edgar_8k_keywords:   { raw: 0.2, weighted: 0.02, available: false },
  },
  stale: false,
};

function SignalBar({ label, signal, available }) {
  const rawPct = Math.round((signal?.raw ?? 0) * 100);
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ 
          fontSize: '0.75rem', fontWeight: 800, 
          color: 'var(--primary)', 
          fontFamily: 'var(--font-labels)',
          letterSpacing: '0.05em',
          opacity: available ? 1 : 0.4
        }}>
          {label.toUpperCase()}
          {!available && <span style={{ marginLeft: '8px', color: 'var(--tertiary)', fontSize: '0.65rem' }}>// DEGRADED</span>}
        </span>
        <span style={{ 
          fontSize: '0.8rem', fontWeight: 800, 
          color: 'var(--on-background)',
          fontFamily: 'var(--font-display)',
          opacity: available ? 1 : 0.4
        }}>
          {rawPct}%
        </span>
      </div>
      <div style={{ height: '8px', background: 'var(--surface-container-low)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
        <div style={{
          width: `${rawPct}%`, height: '100%',
          background: available ? 'var(--primary)' : 'var(--outline-variant)',
          borderRadius: 'var(--radius-full)',
          transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)',
        }} />
      </div>
    </div>
  );
}

export default function PremortemReport({ report: reportProp, loading }) {
  const report = reportProp || MOCK_REPORT;
  const isStale = report.stale === true;
  const confPct = Math.round((report.confidence ?? 0) * 100);
  const bt = report.backtest_summary || {};

  if (loading) {
    return (
      <div style={{ minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="metric-label pulse" style={{ fontSize: '1rem', letterSpacing: '0.2em' }}>CURATING DOSSIER…</div>
      </div>
    );
  }

  return (
    <div className={`fade-in ${isStale ? 'report-stale' : ''}`} style={{ maxWidth: '1200px' }}>

      {/* Stale Warning */}
      {isStale && (
        <div className="glass-panel" style={{
          padding: '12px 24px', marginBottom: '32px',
          background: 'rgba(112, 85, 89, 0.1)', borderRadius: 'var(--radius-full)',
          fontSize: '0.8rem', fontWeight: 700, color: 'var(--tertiary)',
          border: '1px solid var(--tertiary)', display: 'flex', alignItems: 'center', gap: '12px'
        }}>
          <AlertTriangle size={16} />
          LATENCY DETECTED — DATA FLOW DECOUPLED // SHOWING LAST PERSISTED STATE
        </div>
      )}

      {/* Report Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 'var(--spacing-12)' }}>
        <div style={{ flex: 1 }}>
          <div className="metric-label" style={{ color: 'var(--primary)', marginBottom: '12px', fontSize: '0.85rem' }}>
            POST MORTEM DOSSIER
          </div>
          <h1 className="display-lg" style={{ fontSize: '3.5rem', marginBottom: '24px', lineHeight: 0.9 }}>
            {report.name} <br/>
            <span style={{ color: 'var(--outline)', fontWeight: 300 }}>{report.ticker}</span>
          </h1>
          
          {/* Metadata Badges */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ 
              padding: '8px 20px', background: 'var(--surface-container-low)', 
              borderRadius: 'var(--radius-full)', fontSize: '0.75rem', fontWeight: 800,
              fontFamily: 'var(--font-labels)', color: 'var(--secondary)'
            }}>
              {report.case_number}
            </div>
            <div style={{ 
              padding: '8px 20px', background: 'var(--surface-container-low)', 
              borderRadius: 'var(--radius-full)', fontSize: '0.75rem', fontWeight: 800,
              fontFamily: 'var(--font-labels)', color: 'var(--secondary)'
            }}>
              FILED: {formatDateTime(report.filed_at)}
            </div>
            <div style={{ 
              padding: '8px 24px', background: 'var(--primary)', 
              borderRadius: 'var(--radius-full)', fontSize: '0.75rem', fontWeight: 800,
              fontFamily: 'var(--font-labels)', color: 'white'
            }}>
              EST. TOD: {report.tod_estimate || 'IMMUTABLE'}
            </div>
          </div>
        </div>

        {/* Confidence Gauge */}
        <div style={{ textAlign: 'center', minWidth: '140px' }}>
          <div style={{
            width: '120px', height: '120px', borderRadius: '50%',
            background: `conic-gradient(var(--primary) ${confPct * 3.6}deg, var(--surface-container-low) 0)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 12px 32px rgba(79, 96, 83, 0.12)',
            margin: '0 auto 16px',
            position: 'relative'
          }}>
            <div style={{
              width: '94px', height: '94px', borderRadius: '50%',
              background: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: '1.5rem', color: 'var(--primary)',
              fontFamily: 'var(--font-display)'
            }}>
              {confPct}%
            </div>
          </div>
          <div className="metric-label" style={{ fontSize: '0.65rem' }}>PRECISION CONFIDENCE</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 'var(--spacing-12)' }}>

        {/* Left Column: Forensic Observations */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-12)' }}>
          <div>
            <div className="metric-label" style={{ marginBottom: '24px' }}>FORENSIC OBSERVATIONS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {(report.cause_of_failure || []).map((cause, i) => (
                <div key={i} style={{
                  padding: '24px', background: 'var(--surface-container-low)',
                  borderRadius: 'var(--radius-lg)', borderLeft: '6px solid var(--primary)',
                  fontSize: '1.1rem', lineHeight: 1.5, fontWeight: 500,
                  color: 'var(--on-background)', fontFamily: 'var(--font-display)'
                }}>
                  {cause}
                </div>
              ))}
            </div>
          </div>

          {/* Validation Metrics */}
          <div className="card" style={{ background: 'var(--primary)', color: 'white', border: 'none' }}>
            <div className="metric-label" style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '24px' }}>BACKTEST VALIDATION</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
              <div>
                <div style={{ fontSize: '2.5rem', fontWeight: 800, lineHeight: 1 }}>
                  {bt.avg_lead_days ?? '—'}
                </div>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, marginTop: '8px', opacity: 0.8 }}>AVG LEAD DAYS</div>
              </div>
              <div>
                <div style={{ fontSize: '2.5rem', fontWeight: 800, lineHeight: 1 }}>
                  {bt.accuracy_rate != null ? Math.round(bt.accuracy_rate * 100) + '%' : '—'}
                </div>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, marginTop: '8px', opacity: 0.8 }}>ACCURACY</div>
              </div>
              <div>
                <div style={{ fontSize: '2.5rem', fontWeight: 800, lineHeight: 1 }}>
                  {bt.events_analysed}
                </div>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, marginTop: '8px', opacity: 0.8 }}>EVENTS TRACKED</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Signal Decomposition */}
        <div className="card">
          <div className="metric-label" style={{ marginBottom: '32px' }}>SIGNAL DECOMPOSITION</div>
          {SIGNAL_ORDER.map(key => {
            const sig = (report.signals || {})[key] || { raw: 0, weighted: 0, available: false };
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
            marginTop: '16px', padding: '16px', background: 'var(--surface-container-low)', 
            borderRadius: 'var(--radius-md)', fontSize: '0.75rem', lineHeight: 1.6,
            color: 'var(--secondary)', fontStyle: 'italic', fontFamily: 'var(--font-body)'
          }}>
            Signals are normalized by the Composite Scorer using regional variance benchmarks. 
            Degraded signals are inferred from secondary Reddit/Wikipedia streams.
          </div>
        </div>
      </div>
    </div>
  );
}
