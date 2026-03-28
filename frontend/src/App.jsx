import React, { useState, useEffect } from 'react';
import './index.css';
import MetricCard from './components/MetricCard';
import DotMatrixIcon from './components/DotMatrixIcon';

function App() {
  const [activeTab, setActiveTab] = useState('REPORT');
  
  // Mock data representing the Pre-Mortem Machine state
  const currentCompany = {
    ticker: "UL",
    name: "Unilever",
    score: 7.4,
    confidence: 87,
    status: "CRITICAL",
    signals: [
      { label: "FDA RECALL VELOCITY", value: 45, unit: "pts", trend: 12 },
      { label: "REDDIT OOS MENTIONS", value: 82, unit: "ppm", trend: 34, critical: true },
      { label: "WIKI EDIT FREQ", value: 2.4, unit: "hz", trend: -5 },
      { label: "JOB POSTING VELOCITY", value: 15, unit: "%", trend: 8 }
    ]
  };

  // Dot matrix pattern for "Warning/Alert"
  const warningPattern = [
    276, 300, 324, 348, // Vertical line
    420, 444,           // Dot at bottom
  ];

  return (
    <div style={{ padding: '32px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '48px' }}>
        <div>
          <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>NEXUS AI // PRE-MORTEM MACHINE</div>
          <div style={{ fontSize: '24px', fontWeight: '700' }}>FILED: 28 MAR 2026</div>
        </div>
        <div style={{ display: 'flex', gap: '24px' }}>
          {['REPORT', 'CANARY', 'CHAIN'].map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: 'none', border: 'none', color: activeTab === tab ? '#FFF' : '#444',
                fontFamily: 'var(--font-mono)', cursor: 'pointer', transition: 'color 0.2s'
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Hero Section - Large Numerical Display */}
      <div style={{ marginBottom: '64px', borderLeft: '2px solid #FFF', paddingLeft: '32px' }}>
        <div style={{ fontSize: '12px', color: '#888' }}>COMPOSITE FRAGILITY SCORE</div>
        <div style={{ fontSize: '120px', fontWeight: '700', lineHeight: '1' }}>{currentCompany.score}</div>
        <div style={{ display: 'flex', gap: '16px', marginTop: '16px' }}>
          <div className="card" style={{ padding: '4px 12px', fontSize: '12px', border: '1px solid #FFF' }}>
            CONFIDENCE: {currentCompany.confidence}%
          </div>
          <div className="card critical-alert" style={{ padding: '4px 12px', fontSize: '12px' }}>
            STATUS: {currentCompany.status}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
        {/* Left Panel: Signal Stack */}
        <div>
          <h2 style={{ fontSize: '14px', marginBottom: '24px' }}>SIGNAL STACK // {currentCompany.ticker}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {currentCompany.signals.map((sig, i) => (
              <MetricCard key={i} {...sig} />
            ))}
          </div>
        </div>

        {/* Right Panel: Forensic Visual */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ marginBottom: '24px' }}>
             <DotMatrixIcon pattern={warningPattern} activeColor={currentCompany.status === 'CRITICAL' ? '#E63946' : '#FFFFFF'} />
          </div>
          <div style={{ fontSize: '12px', textAlign: 'center', maxWidth: '300px' }}>
            DETECTION OF ANOMALOUS CONTAGION AT PATIENT ZERO. CHAIN PROPAGATION ESTIMATED AT 23 DAYS.
          </div>
        </div>
      </div>

      {/* Footer / Location */}
      <div style={{ marginTop: '64px', borderTop: '1px solid #222', paddingTop: '24px', display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '10px', color: '#444' }}>LOCATION: e.Anti-gravity.quantihack</div>
        <div style={{ fontSize: '10px', color: '#444' }}>© 2026 NOTHING TECHNOLOGY LTD.</div>
      </div>
    </div>
  );
}

export default App;
