import React, { useEffect, useRef } from 'react';

const TrendChart = ({ trend }) => {
  const points = trend > 0 
    ? "M0,45 C15,40 25,48 40,30 C55,12 70,20 85,15 L100,5"
    : "M0,5 C15,10 25,2 40,20 C55,38 70,30 85,45 L100,50";
  
  const color = trend > 0 ? "var(--tertiary)" : "var(--primary)";

  return (
    <div className="sparkline-container" style={{ position: 'relative', height: '64px', marginTop: '16px', overflow: 'hidden' }}>
      <svg viewBox="0 0 100 50" preserveAspectRatio="none" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
        <defs>
          <linearGradient id={`grad-${trend}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.15" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Subtle Grid Lines */}
        {[0.2, 0.5, 0.8].map((p, i) => (
          <line 
            key={i} 
            x1="0" y1={50 * p} 
            x2="100" y2={50 * p} 
            stroke="var(--outline-variant)" 
            strokeWidth="0.5" 
            strokeDasharray="2 2" 
          />
        ))}

        {/* Area Fill */}
        <path
          d={`${points} L100,50 L0,50 Z`}
          fill={`url(#grad-${trend})`}
          style={{ opacity: 0, animation: 'fade-in 1s ease 1.2s forwards' }}
        />

        {/* Main Line */}
        <path
          className="sparkline-path"
          d={points}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            strokeDasharray: 200,
            strokeDashoffset: 200,
            animation: 'draw-sparkline 1.5s cubic-bezier(0.4, 0, 0.2, 1) forwards'
          }}
        />
      </svg>
      <style>{`
        @keyframes draw-sparkline {
          to { stroke-dashoffset: 0; }
        }
        @keyframes fade-in {
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
};

const MetricCard = ({ label, value, unit = "", trend = 0, critical = false }) => {
  return (
    <div className="card" style={{ 
      background: 'var(--surface-container-lowest)',
      border: critical ? '2px solid var(--primary)' : '1px solid var(--outline-variant)',
      transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
      cursor: 'pointer',
      padding: '24px',
      borderRadius: 'var(--radius-xl)',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    }} onMouseEnter={e => {
      e.currentTarget.style.transform = 'scale(1.02)';
      e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
    }} onMouseLeave={e => {
      e.currentTarget.style.transform = 'scale(1)';
      e.currentTarget.style.boxShadow = 'var(--shadow-md)';
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="metric-label" style={{ fontSize: '0.65rem', letterSpacing: '0.1em' }}>{label}</div>
        {trend !== 0 && (
          <span style={{ 
            fontSize: '0.7rem', 
            padding: '4px 12px',
            borderRadius: 'var(--radius-full)',
            background: trend > 0 ? 'var(--tertiary)' : 'var(--primary)',
            color: 'white',
            fontWeight: 800,
            fontFamily: 'var(--font-labels)'
          }}>
            {trend > 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
      
      <div style={{ 
        fontSize: '2.5rem', 
        fontWeight: 800, 
        color: 'var(--on-background)',
        fontFamily: 'var(--font-display)',
        lineHeight: 1
      }}>
        {value}<span style={{ fontSize: '1rem', opacity: 0.6, marginLeft: '4px' }}>{unit}</span>
      </div>
      
      <TrendChart trend={trend} />

      <div style={{ 
        height: '6px', 
        background: 'var(--surface-container-low)', 
        borderRadius: 'var(--radius-full)', 
        overflow: 'hidden',
        marginTop: 'auto',
        paddingTop: '12px'
      }}>
        <div style={{ 
          width: `${Math.min(value, 100)}%`, 
          height: '6px', 
          background: critical ? 'var(--primary)' : 'var(--secondary)',
          borderRadius: 'var(--radius-full)',
          transition: 'width 1.5s cubic-bezier(0.34, 1.56, 0.64, 1)'
        }} />
      </div>
    </div>
  );
};

export default MetricCard;



