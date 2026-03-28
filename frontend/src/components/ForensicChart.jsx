import React from 'react';

const ForensicChart = ({ data = [30, 45, 32, 64, 48, 80], labels = ['MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT'], height = 120, color = 'var(--primary)' }) => {
  const width = 400;
  const max = Math.max(...data, 100);
  const min = 0;
  
  const points = data.map((d, i) => ({
    x: (i / (data.length - 1)) * width,
    y: height - ((d - min) / (max - min)) * height
  }));

  // Generating cubic bezier path
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cp1x = p0.x + (p1.x - p0.x) / 3;
    const cp2x = p0.x + (2 * (p1.x - p0.x)) / 3;
    path += ` C ${cp1x} ${p0.y}, ${cp2x} ${p1.y}, ${p1.x} ${p1.y}`;
  }

  const fillPath = `${path} L ${width} ${height} L 0 ${height} Z`;

  return (
    <div className="fade-in" style={{ width: '100%', position: 'relative' }}>
      <svg viewBox={`0 0 ${width} ${height + 40}`} style={{ width: '100%', overflow: 'visible' }}>
        <defs>
          <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.15" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Minimal Horizontal Grid */}
        {[0, 0.5, 1].map((p, i) => (
          <line 
            key={i} 
            x1="0" y1={height * p} 
            x2={width} y2={height * p} 
            stroke="var(--outline-variant)" 
            strokeWidth="0.5" 
            strokeDasharray="4 4" 
            opacity="0.5"
          />
        ))}

        {/* Area Fill */}
        <path d={fillPath} fill="url(#chartGradient)" />

        {/* Main Line */}
        <path 
          d={path} 
          fill="none" 
          stroke="var(--primary)" 
          strokeWidth="4" 
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ 
            strokeDasharray: 1000, 
            strokeDashoffset: 1000, 
            animation: 'draw 2.5s cubic-bezier(0.4, 0, 0.2, 1) forwards' 
          }}
        />

        {/* X-Axis Labels */}
        {labels.map((label, i) => (
          <text 
            key={i} 
            x={(i / (labels.length - 1)) * width} 
            y={height + 25} 
            textAnchor="middle"
            style={{ 
              fontSize: '10px', 
              fontWeight: 800, 
              fill: 'var(--secondary)', 
              fontFamily: 'var(--font-labels)',
              letterSpacing: '0.05em'
            }}
          >
            {label}
          </text>
        ))}
      </svg>
      <style>{`
        @keyframes draw {
          to { stroke-dashoffset: 0; }
        }
      `}</style>
    </div>
  );
};

export default ForensicChart;
