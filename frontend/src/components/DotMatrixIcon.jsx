import React from 'react';

const DotMatrixIcon = ({ status = 'CRITICAL' }) => {
  const isCritical = status === 'CRITICAL';
  const color = isCritical ? 'var(--primary)' : 'var(--tertiary)';
  
  return (
    <div style={{ position: 'relative', width: '120px', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg viewBox="0 0 120 120" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
        {/* Outer Ring */}
        <circle cx="60" cy="60" r="58" fill="none" stroke={color} strokeWidth="1" strokeDasharray="4 6" opacity="0.2">
          <animateTransform attributeName="transform" type="rotate" from="0 60 60" to="360 60 60" dur="20s" repeatCount="indefinite" />
        </circle>
        
        {/* Ambient Glow */}
        <circle cx="60" cy="60" r="40" fill={color} opacity="0.05">
          <animate attributeName="opacity" values="0.05;0.1;0.05" dur="3s" repeatCount="indefinite" />
        </circle>

        {/* Core Matrix */}
        {[0, 1, 2, 3, 4].map(i => (
          [0, 1, 2, 3, 4].map(j => (
            <rect
              key={`${i}-${j}`}
              x={32 + i * 14}
              y={32 + j * 14}
              width="8"
              height="8"
              rx="4"
              fill={color}
              style={{ opacity: 0.4 }}
            >
              <animate 
                attributeName="opacity" 
                values="0.4;1;0.4" 
                dur={`${2 + Math.random() * 2}s`} 
                begin={`${Math.random() * 2}s`}
                repeatCount="indefinite" 
              />
              <animate 
                attributeName="height" 
                values="8;4;8" 
                dur="4s" 
                repeatCount="indefinite" 
              />
            </rect>
          ))
        ))}
      </svg>
    </div>
  );
};

export default DotMatrixIcon;


