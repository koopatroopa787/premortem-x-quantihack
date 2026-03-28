/**
 * components/ScoreList.jsx
 * Live company list with scores, status pills, and canary rank badges.
 * The Pre-Mortem Machine
 */

import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { formatScore, statusToClass, statusToLabel } from '../utils/formatters.js';

const MOCK_COMPANIES = [
  { ticker: 'UL',   name: 'Unilever',         score: 7.4, status: 'CRITICAL',  canary_rank: 1, degraded_signals: [] },
  { ticker: 'HSY',  name: 'Hershey',           score: 6.8, status: 'CRITICAL',  canary_rank: 2, degraded_signals: [] },
  { ticker: 'MDLZ', name: 'Mondelez',          score: 6.2, status: 'ELEVATED',  canary_rank: 3, degraded_signals: [] },
  { ticker: 'K',    name: "Kellogg's",         score: 5.9, status: 'ELEVATED',  canary_rank: null, degraded_signals: [] },
  { ticker: 'PG',   name: 'Procter & Gamble',  score: 5.2, status: 'ELEVATED',  canary_rank: null, degraded_signals: [] },
  { ticker: 'GIS',  name: 'General Mills',     score: 4.5, status: 'STABLE',    canary_rank: null, degraded_signals: [] },
  { ticker: 'PEP',  name: 'PepsiCo',           score: 4.1, status: 'STABLE',    canary_rank: null, degraded_signals: [] },
  { ticker: 'KO',   name: 'Coca-Cola',         score: 3.8, status: 'STABLE',    canary_rank: null, degraded_signals: [] },
];

const STATUS_COLORS = {
  CRITICAL: 'var(--primary)',
  ELEVATED: '#b45a00',
  STABLE:   'var(--tertiary)',
};

const ScoreList = forwardRef(function ScoreList(
  { companies: companiesProp, selectedTicker, onSelect },
  ref
) {
  const [overrides, setOverrides] = useState({});  // { ticker: { score, status } }
  const companies = (companiesProp && companiesProp.length > 0) ? companiesProp : MOCK_COMPANIES;

  // Expose update(ticker, newScore, newStatus) for partial live updates
  useImperativeHandle(ref, () => ({
    update(ticker, newScore, newStatus) {
      setOverrides(prev => ({
        ...prev,
        [ticker]: { score: newScore, status: newStatus },
      }));
    },
  }));

  return (
    <nav style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{
        fontSize: '0.7rem', fontWeight: 800,
        color: 'var(--primary)', marginBottom: '4px',
        textTransform: 'uppercase', letterSpacing: '0.12em',
        fontFamily: 'var(--font-labels)', opacity: 0.8
      }}>
        SURVEILLANCE QUEUE
      </div>

      {companies.map(co => {
        const ov     = overrides[co.ticker] || {};
        const score  = ov.score  ?? co.score  ?? 0;
        const status = ov.status ?? co.status ?? 'STABLE';
        const isSelected = co.ticker === selectedTicker;

        return (
          <button
            key={co.ticker}
            onClick={() => onSelect(co.ticker)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              padding: '12px 20px',
              borderRadius: 'var(--radius-full)',
              border: 'none',
              background: isSelected ? 'var(--primary)' : 'var(--surface-container-low)',
              color: isSelected ? 'white' : 'var(--on-background)',
              cursor: 'pointer',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              textAlign: 'left',
              gap: '12px',
              boxShadow: isSelected ? '0 8px 24px rgba(79, 96, 83, 0.2)' : 'none'
            }}
          >
            {/* Status Indicator */}
            <div style={{
              width: '10px', height: '10px', borderRadius: '50%',
              background: isSelected ? 'white' : (status === 'CRITICAL' ? 'var(--tertiary)' : 'var(--primary)'),
              opacity: status === 'STABLE' && !isSelected ? 0.3 : 1
            }} />

            {/* Entity Name */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <span style={{ 
                fontWeight: 700, fontSize: '0.95rem', 
                fontFamily: 'var(--font-display)',
                lineHeight: 1.2
              }}>
                {co.name}
              </span>
              <span style={{ 
                fontSize: '0.65rem', fontWeight: 600, 
                fontFamily: 'var(--font-labels)',
                opacity: isSelected ? 0.8 : 0.6,
                letterSpacing: '0.05em'
              }}>
                {co.ticker} {co.canary_rank ? `• CANARY #${co.canary_rank}` : ''}
              </span>
            </div>

            {/* Score Badge */}
            <div style={{
              background: isSelected ? 'rgba(255,255,255,0.2)' : 'var(--surface-container-high)',
              padding: '4px 12px',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.85rem',
              fontWeight: 800,
              fontFamily: 'var(--font-display)',
              minWidth: '28px',
              textAlign: 'center'
            }}>
              {formatScore(score)}
            </div>
          </button>
        );
      })}
    </nav>
  );
});

export default ScoreList;
