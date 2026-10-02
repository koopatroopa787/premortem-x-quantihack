/**
 * components/CanaryBoard.jsx
 * Ranked canary leaderboard — pulled from GET /canary.
 * The Pre-Mortem Machine
 */

import React, { useRef, useState, useCallback } from 'react';
import { formatScore, statusToClass } from '../utils/formatters.js';

const MAX_LEAD_DAYS = 35;

export default function CanaryBoard({ canaries: canariesProp }) {
  const canaries = canariesProp || [];
  const [flashTicker, setFlashTicker] = useState(null);

  const highlight = useCallback((ticker) => {
    setFlashTicker(ticker);
    setTimeout(() => setFlashTicker(null), 800);
  }, []);

  return (
    <div className="fade-in" style={{ maxWidth: '1000px' }}>
      <div className="metric-label" style={{ color: 'var(--primary)', marginBottom: '12px' }}>EXPERIMENTAL RANKING</div>
      <h2 className="display-lg" style={{ marginBottom: 'var(--spacing-10)', fontSize: '2.5rem' }}>
        Canary Leaderboard
      </h2>
      <p style={{ color: 'var(--secondary)', lineHeight: 1.6, marginTop: '-20px', marginBottom: '24px' }}>
        Current scores are collected data. Lead-day assumptions are seeded examples, not measured historical lead times; this ranking is illustrative until validated.
      </p>
      {!canaries.length && <div className="card">Canary data is unavailable. No example leaderboard is being substituted.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {canaries.map((c, idx) => {
          const isTop   = idx === 0;
          const barPct  = Math.min((c.avg_lead_days / MAX_LEAD_DAYS) * 100, 100);

          return (
            <div
              key={c.ticker}
              className="card"
              style={{
                padding: '24px 32px',
                background: isTop ? 'var(--surface-container-low)' : 'var(--surface-container-lowest)',
                border: isTop ? '2px solid var(--primary)' : '1px solid var(--outline-variant)',
                borderRadius: 'var(--radius-xl)',
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                {/* Rank Pill */}
                <div style={{
                  width: '56px', height: '56px', borderRadius: '50%',
                  background: isTop ? 'var(--primary)' : 'var(--surface-container-high)',
                  color: isTop ? 'white' : 'var(--primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.5rem', fontWeight: 800, fontFamily: 'var(--font-display)',
                  flexShrink: 0
                }}>
                  {c.rank}
                </div>

                {/* Name + Ticker */}
                <div style={{ flex: 1 }}>
                  <div style={{ 
                    fontWeight: 800, fontSize: '1.2rem', 
                    color: 'var(--on-background)',
                    fontFamily: 'var(--font-display)',
                    marginBottom: '4px'
                  }}>
                    {c.name}
                  </div>
                  <div style={{ 
                    fontSize: '0.75rem', color: 'var(--secondary)', 
                    fontWeight: 700, fontFamily: 'var(--font-labels)',
                    letterSpacing: '0.1em'
                  }}>
                    IDENTIFIER: {c.ticker}
                  </div>
                </div>

                {/* Lead Days Display */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ 
                    fontSize: '1.75rem', fontWeight: 800, 
                    color: isTop ? 'var(--primary)' : 'var(--on-background)',
                    fontFamily: 'var(--font-display)',
                    lineHeight: 1
                  }}>
                    {c.avg_lead_days}
                  </div>
                  <div className="metric-label" style={{ fontSize: '0.6rem' }}>ASSUMED LEAD DAYS</div>
                </div>
              </div>

              {/* Visualization Bar */}
              <div style={{ marginTop: '20px', height: '10px', background: 'var(--surface-container-low)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                <div style={{
                  width: `${barPct}%`, height: '100%',
                  background: isTop ? 'var(--primary)' : 'var(--primary-container)',
                  borderRadius: 'var(--radius-full)',
                  transition: 'width 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
                }} />
              </div>

              {/* Interpretation */}
              <div style={{
                marginTop: '16px',
                fontSize: '0.9rem', color: 'var(--on-background)',
                opacity: 0.8, lineHeight: 1.6, fontWeight: 500,
                fontFamily: 'var(--font-body)',
                fontStyle: 'italic'
              }}>
                Illustrative lead-time assumption; current score {formatScore(c.current_signal)}/10 ({c.status}).
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
