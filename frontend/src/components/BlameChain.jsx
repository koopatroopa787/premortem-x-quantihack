/**
 * components/BlameChain.jsx
 * Three-panel blame chain propagation view.
 * The Pre-Mortem Machine
 */

import React from 'react';
import { formatDateTime, formatScore } from '../utils/formatters.js';

export default function BlameChain({ blameChain: blameChainProp, loading }) {
  const bc = blameChainProp;

  if (loading) {
    return (
      <div className="fade-in" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem' }}>
        {[1, 2, 3].map(i => (
          <div key={i} className="card" style={{ minHeight: '200px', opacity: 0.4 }}>
            <div className="metric-label">LOADING...</div>
          </div>
        ))}
      </div>
    );
  }

  if (!bc) return <div className="card">Supplier-link data is unavailable. No example graph is being substituted.</div>;

  const pz   = bc.patient_zero   || {};
  const path = bc.propagation_path || [];
  const nv   = bc.next_victim    || {};

  return (
    <div className="fade-in">
      <p style={{ color: 'var(--secondary)', lineHeight: 1.6, marginBottom: '20px' }}>
        Illustrative supplier graph only: the links and lag days are seeded examples, not verified suppliers or calibrated forecasts.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2rem' }}>

      {/* ── Panel Zero ── */}
      <div className="card" style={{
        background: 'var(--surface-container-low)',
        display: 'flex', flexDirection: 'column', gap: '20px',
        borderTop: '6px solid var(--primary)',
        borderRadius: 'var(--radius-xl)'
      }}>
        <div className="metric-label" style={{ color: 'var(--primary)', letterSpacing: '0.12em' }}>
          SELECTED RISK NODE
        </div>

        <div style={{ fontSize: '4rem', fontWeight: 800, color: 'var(--primary)', lineHeight: 1, fontFamily: 'var(--font-display)' }}>
          {pz.ticker || '—'}
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ 
            padding: '8px 24px', background: 'var(--primary)', 
            borderRadius: 'var(--radius-full)', color: 'white', 
            fontWeight: 800, fontSize: '1.1rem', fontFamily: 'var(--font-display)'
          }}>
            {formatScore(pz.score)}
          </div>
          <span className="metric-label" style={{ fontSize: '0.65rem' }}>SCORE / 10</span>
        </div>

        <div style={{ fontSize: '0.85rem', color: 'var(--on-background)', fontWeight: 500, fontFamily: 'var(--font-body)' }}>
          <span style={{ fontWeight: 800, color: 'var(--primary)' }}>LATEST SCORE TIME: </span><br/>
          {formatDateTime(pz.signal_fired_at)}
        </div>

        {bc.origin_supplier && (
          <div style={{ fontSize: '0.85rem', color: 'var(--on-background)', fontWeight: 500, fontFamily: 'var(--font-body)' }}>
            <span style={{ fontWeight: 800, color: 'var(--primary)' }}>ORIGIN NODE: </span><br/>
            {bc.origin_supplier}
          </div>
        )}
      </div>

      {/* ── Panel Path ── */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div className="metric-label" style={{ letterSpacing: '0.1em' }}>
          ILLUSTRATIVE CONNECTIONS // {path.length} NODES
        </div>

        {/* Timeline spine */}
        <div style={{ position: 'relative', paddingLeft: '24px' }}>
          <div style={{
            position: 'absolute', left: '4px', top: '8px', bottom: '8px',
            width: '2px', background: 'var(--outline-variant)',
          }} />

          {path.length === 0 && (
            <div style={{ color: 'var(--secondary)', fontSize: '0.9rem', fontStyle: 'italic' }}>Sequential flow pending…</div>
          )}

          {path.map((company, idx) => (
            <div key={company.ticker} style={{
              position: 'relative', zIndex: 1,
              marginBottom: idx < path.length - 1 ? '32px' : 0,
            }}>
              <div style={{
                position: 'absolute', left: '-25px', top: '6px',
                width: '12px', height: '12px', borderRadius: '50%',
                background: 'var(--primary-container)',
                border: '3px solid white',
              }} />
              <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--on-background)', fontFamily: 'var(--font-display)' }}>
                {company.ticker} <span style={{ fontWeight: 400, color: 'var(--secondary)' }}>— {company.name}</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--secondary)', marginTop: '4px', fontWeight: 600, fontFamily: 'var(--font-labels)' }}>
                {company.lag_days} ASSUMED DAY LAG // {company.shared_suppliers?.length || 0} SHARED EXAMPLE NODES
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Panel Victim ── */}
      <div className="card" style={{
        background: 'var(--surface-container-low)',
        display: 'flex', flexDirection: 'column', gap: '20px',
        borderTop: '6px solid var(--tertiary)',
        borderRadius: 'var(--radius-xl)'
      }}>
        <div className="metric-label" style={{ color: 'var(--tertiary)', letterSpacing: '0.12em' }}>
          ILLUSTRATIVE NEXT NODE
        </div>

        <div style={{ fontSize: '4rem', fontWeight: 800, color: 'var(--tertiary)', lineHeight: 1, fontFamily: 'var(--font-display)' }}>
          {nv.ticker || '—'}
        </div>

        <div style={{ fontWeight: 700, fontSize: '1.2rem', color: 'var(--on-background)', fontFamily: 'var(--font-display)' }}>
          {nv.name}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div className="card" style={{ padding: '12px', background: 'white', border: 'none', borderRadius: 'var(--radius-lg)', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--tertiary)', fontFamily: 'var(--font-display)' }}>
              {nv.confidence != null ? Math.round(nv.confidence * 100) + '%' : '—'}
            </div>
            <div className="metric-label" style={{ fontSize: '0.55rem' }}>HEURISTIC INDEX</div>
          </div>
          <div className="card" style={{ padding: '12px', background: 'white', border: 'none', borderRadius: 'var(--radius-lg)', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--on-background)', fontFamily: 'var(--font-display)' }}>
              {nv.lag_days != null ? `${nv.lag_days}D` : '—'}
            </div>
            <div className="metric-label" style={{ fontSize: '0.55rem' }}>ASSUMED LAG</div>
          </div>
        </div>

        {nv.alert && (
          <div style={{
            padding: '12px 16px', borderRadius: 'var(--radius-full)',
            background: 'var(--tertiary)',
            fontSize: '0.75rem', fontWeight: 800,
            color: 'white', letterSpacing: '0.05em', textAlign: 'center',
            fontFamily: 'var(--font-labels)'
          }}>
            Illustrative only · Not a market-price conclusion
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
