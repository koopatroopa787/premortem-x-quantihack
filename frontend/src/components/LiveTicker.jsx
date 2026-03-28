/**
 * components/LiveTicker.jsx
 * Horizontally scrolling live signal ticker.
 * The Pre-Mortem Machine
 */

import React, { forwardRef, useImperativeHandle, useState, useRef, useEffect } from 'react';
import { formatDelta, formatTime, statusToLabel } from '../utils/formatters.js';

const MAX_QUEUE = 20;

const ITEM_COLORS = {
  CRITICAL: 'var(--tertiary)',
  ELEVATED: 'var(--primary)',
  STABLE:   'var(--primary)',
};

const LiveTicker = forwardRef(function LiveTicker({ initialMessage }, ref) {
  const [queue, setQueue]         = useState([]);
  const [running, setRunning]     = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  useImperativeHandle(ref, () => ({
    push(changes, updatedAt) {
      if (!changes || changes.length === 0) {
        setLastUpdate(updatedAt || new Date().toISOString());
        return;
      }
      const items = changes.map(c => ({
        id:     `${c.ticker}-${Date.now()}-${Math.random()}`,
        ticker: c.ticker,
        delta:  c.delta,
        status: c.status || 'STABLE',
      }));
      setQueue(prev => [...items, ...prev].slice(0, MAX_QUEUE));
      setLastUpdate(updatedAt || new Date().toISOString());
    },
    start() { setRunning(true); },
    stop()  { setRunning(false); },
  }));

  const nominaText = lastUpdate
    ? `ALL SIGNALS NOMINAL // SYNCED: ${formatTime(lastUpdate)}`
    : (initialMessage || 'SURVEILLANCE ACTIVE // AWAITING STREAM');

  return (
    <div style={{
      background: 'var(--surface-container-lowest)',
      borderBottom: '1px solid var(--outline-variant)',
      padding: '8px 0',
      overflow: 'hidden',
      position: 'relative',
      height: '36px',
      display: 'flex',
      alignItems: 'center',
    }}>
      <div
        className={running ? 'ticker-scrolling' : ''}
        style={{
          display: 'flex',
          gap: '64px',
          whiteSpace: 'nowrap',
          fontSize: '0.65rem',
          fontWeight: 800,
          fontFamily: 'var(--font-labels)',
          letterSpacing: '0.12em',
          paddingLeft: queue.length === 0 ? '2rem' : undefined,
          animationPlayState: running ? 'running' : 'paused',
          textTransform: 'uppercase'
        }}
      >
        {queue.length === 0 ? (
          <span style={{ color: 'var(--primary)', opacity: 0.8 }}>{nominaText}</span>
        ) : (
          <>
            {queue.map(item => (
              <span key={item.id} style={{ color: ITEM_COLORS[item.status] || ITEM_COLORS.STABLE, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 900 }}>{item.ticker}</span>
                <span style={{ opacity: 0.8 }}>{item.delta > 0 ? '▲' : '▼'}{Math.abs(item.delta).toFixed(1)}</span>
                <span style={{ fontSize: '0.55rem', opacity: 0.6 }}>[{statusToLabel(item.status)}]</span>
              </span>
            ))}
            {/* pad with nominal if few items */}
            {queue.length < 5 && (
              <span style={{ color: 'var(--secondary)', opacity: 0.4 }}>{nominaText}</span>
            )}
          </>
        )}
      </div>
    </div>
  );
});

export default LiveTicker;
