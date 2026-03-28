import React from 'react';
import './index.css';

const DotMatrixIcon = ({ pattern = [], activeColor = "#FFFFFF" }) => {
  // pattern is an array of indices [0...575] that should be active in a 24x24 grid
  return (
    <div className="dot-grid" style={{ width: '120px', height: '120px' }}>
      {Array.from({ length: 576 }).map((_, i) => (
        <div 
          key={i} 
          className={`dot ${pattern.includes(i) ? 'active' : ''}`}
          style={pattern.includes(i) ? { backgroundColor: activeColor, boxShadow: `0 0 4px ${activeColor}` } : {}}
        />
      ))}
    </div>
  );
};

export default DotMatrixIcon;
