import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';

const date = (value) => value ? value.slice(0, 10) : '—';
const percent = (value) => value == null ? 'Not measured yet' : `${Math.round(value * 100)}%`;

function Outcome({ forecast }) {
  const status = forecast.outcome?.status || 'PENDING';
  const words = {
    HIT: 'Confirmed within window',
    MISS: 'No matching recall in window',
    FALSE_NEGATIVE: 'Recall occurred despite quiet call',
    CORRECT_QUIET: 'No matching recall in quiet window',
    PENDING: 'Awaiting outcome',
    ABSTAINED: 'No dated claim made',
  };
  return <strong style={{ color: status === 'HIT' || status === 'CORRECT_QUIET' ? 'var(--primary)' : 'var(--tertiary)' }}>
    {words[status] || status}
  </strong>;
}

function ForecastCard({ forecast }) {
  if (!forecast) return <p>No prospective forecast has been recorded for this company yet.</p>;
  const claim = forecast.kind === 'dated_alert'
    ? `A Class I/II recall is flagged for ${date(forecast.window_start)} to ${date(forecast.window_end)}.`
    : forecast.kind === 'quiet_30d'
      ? `No Class I/II recall is flagged through ${date(forecast.window_end)}.`
      : 'The score is in an intermediate range; the model abstained from a dated call.';
  return <div className="card" style={{ marginBottom: '24px' }}>
    <div className="metric-label" style={{ marginBottom: '12px' }}>LATEST SEALED CALL · {forecast.ticker}</div>
    <h3 style={{ fontSize: '1.35rem', margin: '0 0 12px', color: 'var(--on-background)' }}>{claim}</h3>
    <p style={{ margin: '0 0 12px', color: 'var(--secondary)' }}>
      Issued {date(forecast.issued_at)} UTC · Score {forecast.score.toFixed(2)}/10 · Model {forecast.model_version}
    </p>
    <Outcome forecast={forecast} />
    {forecast.outcome?.status === 'PENDING' && forecast.window_end && <p style={{ marginBottom: 0, color: 'var(--secondary)' }}>
      A verdict is withheld until 14 days after {date(forecast.window_end)}, allowing time for FDA reporting.
    </p>}
    {(forecast.outcome?.matched_events || []).map((event) => <p key={event.recall_number} style={{ marginBottom: 0 }}>
      <a href={event.source_url} target="_blank" rel="noreferrer">FDA {event.recall_number}</a> · {event.classification} · {date(event.date)}
    </p>)}
  </div>;
}

export default function Validation({ selectedTicker }) {
  const [audit, setAudit] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const result = await api.getAudit();
      if (!active) return;
      if (result?.error) setError(true);
      else { setAudit(result); setError(false); }
    };
    load();
    const timer = setInterval(load, 60_000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  const latest = audit?.latest?.find((row) => row.ticker === selectedTicker);
  const totals = audit?.totals || {};

  return <div className="fade-in" style={{ maxWidth: '1200px' }}>
    <div style={{ marginBottom: '28px' }}>
      <div className="metric-label" style={{ color: 'var(--primary)', marginBottom: '10px' }}>PREDICTION AUDIT</div>
      <h2 className="display-lg" style={{ fontSize: '2.3rem', marginBottom: '12px' }}>Did the call come true?</h2>
      <p style={{ color: 'var(--secondary)', lineHeight: 1.6, maxWidth: '780px' }}>
        Each call is saved before the outcome. We check its dated window against later, publicly reported FDA Class I/II recalls.
        A recall is a measurable stress proxy, not proof that an entire supply chain failed. This is prospective evidence,
        separate from the interactive simulation in Backtester.
      </p>
    </div>

    {error && !audit && <div className="card">The audit is temporarily unavailable. No performance figure is being substituted.</div>}
    {!error && !audit && <div className="card">Loading sealed forecasts…</div>}
    {audit && <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {[
          ['Calls recorded', totals.issued ?? 0],
          ['Independent windows', totals.independent_windows ?? 0],
          ['Alert hit rate', percent(audit.metrics?.alert_hit_rate)],
          ['Quiet-call accuracy', percent(audit.metrics?.quiet_accuracy)],
        ].map(([label, value]) => <div className="card" key={label} style={{ padding: '22px' }}>
          <div className="metric-label" style={{ marginBottom: '12px' }}>{label}</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary)' }}>{value}</div>
        </div>)}
      </div>
      <ForecastCard forecast={latest} />
      <div className="card">
        <div className="metric-label" style={{ marginBottom: '16px' }}>RESOLVED EVIDENCE</div>
        {audit.recent_resolutions?.length ? audit.recent_resolutions.slice(0, 12).map((row) => <div key={row.id} style={{ padding: '12px 0', borderTop: '1px solid var(--outline-variant)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <span>{row.ticker} · Issued {date(row.issued_at)} · Window ended {date(row.window_end)}</span>
          <Outcome forecast={row} />
          {(row.outcome?.matched_events || []).map((event) => <a key={event.recall_number} href={event.source_url} target="_blank" rel="noreferrer">FDA {event.recall_number}</a>)}
        </div>) : <p style={{ marginBottom: 0, color: 'var(--secondary)' }}>No window has matured yet. The first verdicts cannot appear until the forecast window and the 14-day reporting allowance have passed.</p>}
      </div>
      <p style={{ color: 'var(--secondary)', fontSize: '0.78rem', lineHeight: 1.6, marginTop: '16px' }}>
        {audit.method} Daily calls overlap, so only non-overlapping company windows contribute to the headline rates.
        A missing or incomplete FDA refresh never counts as a correct quiet call.
      </p>
    </>}
  </div>;
}
