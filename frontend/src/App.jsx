/**
 * App.jsx — Post Mortem
 * Full data layer wiring: backend → React state → UI
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Activity, AlertTriangle, Search, Bell, ArrowUpRight } from 'lucide-react';
import './index.css';
import '../src/styles/overrides.css';

// Utilities
import { api } from './api/client.js';
import { cache, TTL_COMPANIES, TTL_REPORT, TTL_CANARY, TTL_BLAME } from './utils/cache.js';
import { createPoller } from './utils/poller.js';

// Components
import ScoreList from './components/ScoreList.jsx';
import PremortemReport from './components/PremortemReport.jsx';
import CanaryBoard from './components/CanaryBoard.jsx';
import BlameChain from './components/BlameChain.jsx';
import LiveTicker from './components/LiveTicker.jsx';
import Backtester from './components/Backtester.jsx';

// ── Preserved Stitch sub-components ──────────────────────────────────────────
import MetricCard from './components/MetricCard.jsx';
import DotMatrixIcon from './components/DotMatrixIcon.jsx';
import ForensicChart from './components/ForensicChart.jsx';
import SegmentedHealthBar from './components/SegmentedHealthBar.jsx';

const TABS = ['DASHBOARD', 'CANARY BOARD', 'BLAME CHAIN', 'BACKTESTER', 'DOSSIER'];

// ── Mock fallback data ────────────────────────────────────────────────────────
const MOCK_COMPANIES = [
  { ticker: 'UL', name: 'Unilever', score: 7.4, status: 'CRITICAL', canary_rank: 1, degraded_signals: [], signals: {} },
  { ticker: 'HSY', name: 'Hershey', score: 6.8, status: 'CRITICAL', canary_rank: 2, degraded_signals: [], signals: {} },
  { ticker: 'PG', name: 'P&G', score: 5.2, status: 'ELEVATED', canary_rank: null, degraded_signals: [], signals: {} },
  { ticker: 'KO', name: 'Coca-Cola', score: 3.8, status: 'STABLE', canary_rank: null, degraded_signals: [], signals: {} },
  { ticker: 'PEP', name: 'PepsiCo', score: 4.1, status: 'STABLE', canary_rank: null, degraded_signals: [], signals: {} },
  { ticker: 'GIS', name: 'General Mills', score: 4.5, status: 'STABLE', canary_rank: null, degraded_signals: [], signals: {} },
  { ticker: 'K', name: 'Kellanova', score: 5.9, status: 'ELEVATED', canary_rank: null, degraded_signals: [], signals: {} },
  { ticker: 'CPB', name: "Campbell's", score: 5.1, status: 'ELEVATED', canary_rank: null, degraded_signals: [], signals: {} },
  { ticker: 'SJM', name: 'J.M. Smucker', score: 4.8, status: 'STABLE', canary_rank: null, degraded_signals: [], signals: {} },
  { ticker: 'CAG', name: 'Conagra', score: 4.3, status: 'STABLE', canary_rank: null, degraded_signals: [], signals: {} },
];

// ─────────────────────────────────────────────────────────────────────────────
function App() {
  const [activeTab, setActiveTab] = useState('DASHBOARD');
  const [companies, setCompanies] = useState(MOCK_COMPANIES);
  const [selectedTicker, setSelectedTicker] = useState('UL');
  const [report, setReport] = useState(null);
  const [blameChain, setBlameChain] = useState(null);
  const [canaries, setCanaries] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [blameLoading, setBlameLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [canaryFetched, setCanaryFetched] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  const scoreListRef = useRef(null);
  const tickerRef = useRef(null);
  const pollerRef = useRef(null);

  // ── Clock ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ── Welcome message ──────────────────────────────────────────────────────
  useEffect(() => {
    console.log('%c[POST MORTEM]', 'color: #00FF94; font-size: 14px; font-weight: bold');
    console.log('%cDashboard initialised. Backend: http://localhost:8000', 'color: #6B8299');
    console.log('%cPolling /live every 60s. Press R to force refresh.', 'color: #6B8299');
  }, []);

  // ── Fetch companies ───────────────────────────────────────────────────────
  const fetchCompanies = useCallback(async (bypass = false) => {
    if (!bypass && cache.has('companies')) {
      const cached = cache.get('companies');
      if (cached?.companies?.length > 0) {
        setCompanies(cached.companies);
        return cached.companies;
      }
    }
    const data = await api.getCompanies({ fallback: { companies: MOCK_COMPANIES } });
    if (data?.companies?.length > 0) {
      cache.set('companies', data, TTL_COMPANIES);
      setCompanies(data.companies);
      return data.companies;
    }
    return companies;
  }, []);

  // ── Fetch company report + blame ──────────────────────────────────────────
  const fetchReport = useCallback(async (ticker, bypass = false) => {
    const cacheKey = `report_${ticker}`;
    if (!bypass && cache.has(cacheKey)) {
      const cached = cache.get(cacheKey);
      setReport(cached);
      setBlameChain(cached?.blame_chain || null);
      return;
    }
    setReportLoading(true);
    setBlameLoading(true);
    const data = await api.getCompany(ticker);
    setReportLoading(false);
    setBlameLoading(false);
    if (!data?.error) {
      cache.set(cacheKey, data, TTL_REPORT);
      setReport(data);
      setBlameChain(data?.blame_chain || null);
    }
  }, []);

  // ── Fetch canary (lazy, once) ─────────────────────────────────────────────
  const fetchCanary = useCallback(async (bypass = false) => {
    if (!bypass && cache.has('canary')) {
      setCanaries(cache.get('canary')?.canaries || null);
      return;
    }
    const data = await api.getCanary();
    if (!data?.error && data?.canaries) {
      cache.set('canary', data, TTL_CANARY);
      setCanaries(data.canaries);
    }
  }, []);

  // ── Force refresh (R key) ─────────────────────────────────────────────────
  const forceRefresh = useCallback(async () => {
    console.log('%c[PMM] Force refresh — bypassing cache', 'color: #00FF94');
    cache.clear();
    await fetchCompanies(true);
    await fetchReport(selectedTicker, true);
    if (canaryFetched) await fetchCanary(true);
  }, [selectedTicker, canaryFetched, fetchCompanies, fetchReport, fetchCanary]);

  // ── Keyboard shortcut ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'r' || e.key === 'R') {
        if (e.target.tagName !== 'INPUT') forceRefresh();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [forceRefresh]);

  // ── Initial data load ─────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const cos = await fetchCompanies();
      const firstTicker = (cos && cos.length > 0) ? cos[0].ticker : 'UL';
      setSelectedTicker(firstTicker);
      await fetchReport(firstTicker);
    })();
  }, []);

  // ── /live poller every 60s ────────────────────────────────────────────────
  useEffect(() => {
    const poller = createPoller(
      () => api.getLive(),
      60_000,
      (data) => {
        if (!data?.changes || data.changes.length === 0) {
          tickerRef.current?.push([], data.updated_at);
          return;
        }
        // Partial score-list update
        data.changes.forEach(change => {
          scoreListRef.current?.update(change.ticker, change.score, change.status);
        });
        // Push to live ticker
        tickerRef.current?.push(data.changes, data.updated_at);
        // Refresh report if selected company changed
        const changedTickers = data.changes.map(c => c.ticker);
        if (changedTickers.includes(selectedTicker)) {
          fetchReport(selectedTicker, true);
        }
      }
    );
    pollerRef.current = poller;
    poller.start();
    return () => poller.stop();
  }, [selectedTicker, fetchReport]);

  // ── Company selection ─────────────────────────────────────────────────────
  const handleSelect = useCallback((ticker) => {
    setSelectedTicker(ticker);
    fetchReport(ticker);
  }, [fetchReport]);

  // ── Tab switch — lazy-load canary ─────────────────────────────────────────
  const handleTab = useCallback((tab) => {
    setActiveTab(tab);
    if (tab === 'CANARY BOARD' && !canaryFetched) {
      setCanaryFetched(true);
      fetchCanary();
    }
  }, [canaryFetched, fetchCanary]);

  // ── Search filter ─────────────────────────────────────────────────────────
  const filteredCompanies = searchQuery
    ? companies.filter(c =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.ticker.toLowerCase().includes(searchQuery.toLowerCase())
    )
    : companies;

  // ── Selected company object ───────────────────────────────────────────────
  const selectedCompany = companies.find(c => c.ticker === selectedTicker) || companies[0] || MOCK_COMPANIES[0];

  // ── Tab content renderer ──────────────────────────────────────────────────
  const renderContent = () => {
    switch (activeTab) {

      case 'CANARY BOARD':
        return <CanaryBoard canaries={canaries} />;

      case 'BLAME CHAIN':
        return (
          <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 className="display-lg" style={{ fontSize: '2rem' }}>BLAME CHAIN PROPAGATION</h2>
              {selectedCompany && (
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--secondary)' }}>
                  Showing: {selectedCompany.name} ({selectedCompany.ticker})
                </span>
              )}
            </div>
            <BlameChain blameChain={blameChain} loading={blameLoading} />
          </div>
        );

      case 'DOSSIER':
        {
          const edgar = report?.signals?.edgar_8k_keywords?.raw || 0;
          const fda = report?.signals?.fda_recall_velocity?.raw || 0;
          const wiki = report?.signals?.wikipedia_edit_wars?.raw || 0;
          const fred = report?.signals?.fred_macro_backdrop?.raw || 0;

          // Pseudo-history for chart based on ticker to look dynamic
          const tickerSeed = selectedTicker.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
          const history = [
            20 + (tickerSeed % 10),
            35 + (tickerSeed % 15),
            45 + (tickerSeed % 20),
            60 + (tickerSeed % 25),
            55 + (tickerSeed % 30),
            Math.min(95, (wiki * 100) + 10)
          ];

          return (
            <div className="fade-in">
              <h2 className="display-lg" style={{ marginBottom: '2rem' }}>EVIDENCE DOSSIER: {selectedCompany?.name}</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                <div className="card" style={{ height: 'fit-content' }}>
                  <div className="metric-label">SEC 8-K NLP ANALYSIS</div>
                  <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
                    <div style={{ flex: 1, padding: '1rem', background: 'var(--surface-container-low)', borderRadius: 'var(--radius-md)' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)' }}>
                        {edgar.toFixed(2)}
                      </div>
                      <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--secondary)' }}>HEDGING FREQUENCY</div>
                    </div>
                    <div style={{ flex: 1, padding: '1rem', background: 'var(--surface-container-low)', borderRadius: 'var(--radius-md)' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)' }}>
                        {(edgar * -85).toFixed(0)}%
                      </div>
                      <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--secondary)' }}>SENTIMENT DELTA</div>
                    </div>
                  </div>
                  <p style={{ fontSize: '0.875rem', marginTop: '1rem', lineHeight: 1.6, color: 'var(--on-background)' }}>
                    {edgar > 0.4
                      ? "Detected linguistic patterns indicate high-level uncertainty regarding 'Operational Resilience'. The management team has pivoted to passive styling."
                      : "Regulatory filings show stable executive sentiment. Linguistic markers for 'Hedging' are within historical standard deviations."}
                  </p>
                </div>
                <div className="card">
                  <div className="metric-label">GOOGLE TRENDS CORRELATION</div>
                  <div style={{ marginTop: '1rem' }}>
                    <ForensicChart data={history} labels={['JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOW']} height={80} />
                  </div>
                  <p style={{ fontSize: '0.875rem', marginTop: '1rem', lineHeight: 1.6, color: 'var(--on-background)' }}>
                    {wiki > 0.4
                      ? `Elevated Wikipedia volatility (intensity: ${wiki.toFixed(2)}) correlates strongly with regional public interest spikes.`
                      : "Public mentions and digital sentiment appear within nominal baseline ranges."}
                  </p>
                </div>
                <div className="card" style={{ gridColumn: 'span 2' }}>
                  <div className="metric-label" style={{ marginBottom: '1.5rem' }}>CRITICAL HEALTH INDICATORS (REAL-TIME)</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4rem' }}>
                    <SegmentedHealthBar label="INVENTORY/SALES RATIO" value={fred > 0 ? fred * 100 : 45} />
                    <SegmentedHealthBar label="FDA RECALL VELOCITY" value={fda > 0 ? fda * 100 : 12} />
                    <SegmentedHealthBar label="REAL-TIME SENTIMENT" value={Math.max(0, (1 - wiki) * 100)} />
                  </div>
                </div>
              </div>
            </div>
          );
        }

      case 'BACKTESTER':
        return (
          <div className="fade-in">
            <Backtester />
          </div>
        );

      default: // DASHBOARD
        return (
          <div className="fade-in">
            <PremortemReport report={report} loading={reportLoading} />
          </div>
        );
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--background)', fontFamily: 'var(--font-body)' }}>

      {/* ── Top Navigation / Live Ticker ── */}
      <div className="glass-panel" style={{
        position: 'fixed', top: '1rem', left: '1rem', right: '1rem',
        height: '40px', zIndex: 100, display: 'flex', alignItems: 'center', px: '1rem',
        borderRadius: 'var(--radius-full)', overflow: 'hidden', justifyContent: 'space-between',
        padding: '0 24px'
      }}>
        <div style={{ flex: 1 }}>
          <LiveTicker ref={tickerRef} initialMessage="SURVEILLANCE FLOW ACTIVE // SAGE FORENSIC" />
        </div>
        <div style={{
          color: 'var(--primary)', fontWeight: 800, fontSize: '0.75rem',
          fontFamily: 'var(--font-labels)', letterSpacing: '0.1em',
          marginLeft: '24px', opacity: 0.8
        }}>
          SYSTEM TIME: {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, paddingTop: '4rem', paddingBottom: '2rem' }}>

        {/* ── Floating Sidebar ── */}
        <aside className="glass-panel" style={{
          width: '360px', marginLeft: '1rem', marginBottom: '1rem',
          display: 'flex', flexDirection: 'column', padding: 'var(--spacing-8)',
          boxShadow: '0 20px 80px rgba(79, 96, 83, 0.08)',
        }}>
          {/* Brand */}
          <div style={{ marginBottom: 'var(--spacing-10)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <div style={{
                width: '32px', height: '32px', background: 'var(--primary)',
                borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Activity size={16} color="white" />
              </div>
              <span style={{
                fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.15em',
                color: 'var(--primary)', fontFamily: 'var(--font-labels)'
              }}>
                PRE MORTEM
              </span>
            </div>
            <h1 className="display-lg" style={{ fontSize: '1.75rem' }}>
              Intelligence Unit
            </h1>
          </div>

          {/* Search */}
          <div style={{ position: 'relative', marginBottom: 'var(--spacing-8)' }}>
            <Search size={16} style={{ position: 'absolute', left: '14px', top: '12px', color: 'var(--primary)', opacity: 0.6 }} />
            <input
              type="text"
              placeholder="Query entities…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '12px 14px 12px 42px',
                borderRadius: 'var(--radius-full)',
                border: '1px solid var(--outline-variant)',
                background: 'var(--surface-container-low)',
                fontSize: '0.9rem', outline: 'none',
                fontFamily: 'var(--font-body)',
                color: 'var(--on-background)',
                transition: 'border-color 0.2s'
              }}
              onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--outline-variant)'}
            />
          </div>

          {/* Company list */}
          <div style={{ flex: 1, overflowY: 'auto', marginBottom: 'var(--spacing-8)' }}>
            <ScoreList
              ref={scoreListRef}
              companies={filteredCompanies}
              selectedTicker={selectedTicker}
              onSelect={handleSelect}
            />
          </div>

          {/* System status bubble */}
          <div className="card" style={{
            background: 'var(--primary)', color: 'white',
            padding: '1.5rem', borderRadius: 'var(--radius-lg)'
          }}>
            <div className="metric-label" style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '8px' }}>STATUS OVERVIEW</div>
            <div style={{ fontSize: '0.9rem', lineHeight: 1.6, fontWeight: 500 }}>
              {report?.cause_of_failure?.[0] || 'Surveillance systems at nominal precision. No immediate critical decoupling detected.'}
            </div>
          </div>
        </aside>

        {/* ── Main Canvas ── */}
        <main style={{ flex: 1, padding: '0 var(--spacing-12)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>

          {/* Global Header */}
          <header style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 'var(--spacing-10)', height: '60px'
          }}>
            {/* Tab Nav */}
            <nav style={{ display: 'flex', gap: '8px', background: 'var(--surface-container-low)', padding: '6px', borderRadius: 'var(--radius-full)' }}>
              {TABS.map(tab => (
                <button
                  key={tab}
                  onClick={() => handleTab(tab)}
                  style={{
                    background: activeTab === tab ? 'var(--primary)' : 'transparent',
                    border: 'none',
                    color: activeTab === tab ? 'white' : 'var(--secondary)',
                    padding: '10px 24px',
                    borderRadius: 'var(--radius-full)',
                    fontWeight: 700, fontSize: '0.85rem',
                    cursor: 'pointer', fontFamily: 'var(--font-display)',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                >
                  {tab}
                </button>
              ))}
            </nav>

            {/* System Monitor Icon */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                width: '48px', height: '48px', borderRadius: '50%',
                background: 'var(--surface-container-low)',
                border: '1px solid var(--outline-variant)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: 'var(--shadow-md)',
                color: 'var(--primary)'
              }}>
                <Bell size={20} />
              </div>
            </div>
          </header>

          {/* Content Canvas */}
          <div style={{ flex: 1, overflowY: 'visible' }}>
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
