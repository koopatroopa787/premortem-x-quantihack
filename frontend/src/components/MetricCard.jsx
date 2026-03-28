import React from 'react';

const MetricCard = ({ label, value, unit = "", trend = 0, critical = false }) => {
  return (
    <div className={`card ${critical ? 'critical-alert' : ''}`}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">
        {value}{unit}
        {trend !== 0 && (
          <span style={{ fontSize: '14px', marginLeft: '8px', color: trend > 0 ? '#4CAF50' : '#E63946' }}>
            {trend > 0 ? '↑' : '↓'}{Math.abs(trend)}%
          </span>
        )}
      </div>
      <div style={{ height: '4px', background: '#222', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ 
          width: `${Math.min(value, 100)}%`, 
          height: '100%', 
          background: critical ? '#E63946' : '#FFFFFF',
          transition: 'width 0.5s'
        }} />
      </div>
    </div>
  );
};

export default MetricCard;
