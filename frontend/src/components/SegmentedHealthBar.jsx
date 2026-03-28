import React from 'react';

const SegmentedHealthBar = ({ value = 50, label = "Health Status" }) => {
  // Sage Forensic editorial segments
  const segments = [
    { color: 'var(--tertiary)', label: 'DEGRADED' },
    { color: 'var(--surface-container-high)', label: 'STABLE' },
    { color: 'var(--primary)', label: 'OPTIMAL' }
  ];

  return (
    <div style={{ marginBottom: '2rem', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', alignItems: 'flex-end' }}>
        <div className="metric-label" style={{ fontSize: '0.65rem', opacity: 0.8 }}>{label}</div>
        <div style={{ 
          fontSize: '1.5rem', fontWeight: 800, color: 'var(--on-background)', 
          fontFamily: 'var(--font-display)', lineHeight: 1 
        }}>
          {value.toFixed(1)}
        </div>
      </div>
      
      <div style={{ position: 'relative', height: '14px', display: 'flex', gap: '6px' }}>
        {segments.map((s, i) => (
          <div 
            key={i} 
            style={{ 
              flex: 1, 
              background: s.color, 
              borderRadius: 'var(--radius-full)',
              opacity: 0.2
            }} 
          />
        ))}
        
        {/* Pointer / Marker */}
        <div style={{ 
          position: 'absolute', 
          left: `${value}%`, 
          top: '0', bottom: '0',
          width: '6px',
          background: 'var(--primary)',
          borderRadius: 'var(--radius-full)',
          boxShadow: '0 0 12px var(--primary)',
          transform: 'translateX(-50%)',
          transition: 'left 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
          zIndex: 2
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
        <span style={{ fontSize: '0.55rem', fontWeight: 800, color: 'var(--tertiary)', letterSpacing: '0.05em' }}>ISOLATION</span>
        <span style={{ fontSize: '0.55rem', fontWeight: 800, color: 'var(--primary)', letterSpacing: '0.05em' }}>EQUILIBRIUM</span>
      </div>
    </div>
  );
};

export default SegmentedHealthBar;
