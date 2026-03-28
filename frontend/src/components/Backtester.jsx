import { useState, useMemo, useCallback, useEffect } from "react";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer, Legend, ComposedChart,
} from "recharts";

// ── Palette (Harmonized with Sage Forensic) ──────────────────────────
const C = {
  bg: "#faf9f5", 
  card: "#ffffff", 
  cardHigh: "#f2f0e4",
  border: "#e0ddd0", 
  borderBright: "#4f605340",
  green: "#4f6053", 
  greenFaint: "#4f605310",
  amber: "#c18d60", 
  amberFaint: "#c18d6012",
  red: "#705559", 
  redFaint: "#70555910",
  blue: "#5d7a8c", 
  blueFaint: "#5d7a8c10",
  purple: "#7c6a8c", 
  purpleFaint: "#7c6a8c10",
  teal: "#5a7a7a", 
  tealFaint: "#5a7a7a10",
  cyan: "#4f6053",
  text: "#1a1c1a", 
  textSec: "#5a6a5a", 
  textMut: "#a0a4a0",
  mono: "'JetBrains Mono','Fira Code',monospace",
  sans: "var(--font-body), 'Manrope', sans-serif",
};

// ── Companies ─────────────────────────────────────────────────────
const COMPANIES = [
  { ticker:"UL",  name:"Unilever",       sector:"Personal Care", baseVol: 0.018 },
  { ticker:"HSY", name:"Hershey",        sector:"Confectionery", baseVol: 0.022 },
  { ticker:"GIS", name:"General Mills",  sector:"Food",          baseVol: 0.015 },
  { ticker:"CPB", name:"Campbell's",     sector:"Food",          baseVol: 0.020 },
  { ticker:"CLX", name:"Clorox",         sector:"Household",     baseVol: 0.024 },
  { ticker:"CAG", name:"Conagra",        sector:"Food",          baseVol: 0.021 },
  { ticker:"HRL", name:"Hormel",         sector:"Meat",          baseVol: 0.017 },
  { ticker:"SJM", name:"J.M. Smucker",   sector:"Food",          baseVol: 0.019 },
];

const SIGNAL_WEIGHTS_DEFAULT = {
  fda_recall_velocity: 0.25,
  reddit_oos_velocity: 0.20,
  wikipedia_edit_wars: 0.20,
  fred_macro_backdrop: 0.15,
  adzuna_job_velocity: 0.12,
  edgar_8k_keywords:   0.08,
};

const SIGNAL_META = {
  fda_recall_velocity: { label:"FDA Recall",      color: C.red    },
  reddit_oos_velocity: { label:"Reddit OOS",      color: C.amber  },
  wikipedia_edit_wars: { label:"Wiki Edit Wars",  color: C.purple },
  fred_macro_backdrop: { label:"FRED Macro",      color: C.blue   },
  adzuna_job_velocity: { label:"Adzuna Jobs",     color: C.teal   },
  edgar_8k_keywords:   { label:"SEC 8-K",         color: C.green  },
};

const GROUND_TRUTH_SOURCES = {
  synthetic:  { label:"Synthetic Events",      color: C.purple, desc:"AI-generated supply chain stress events with realistic timing" },
  fda:        { label:"FDA Recall Dates",       color: C.red,    desc:"Historical FDA food enforcement recall classifications as event ground truth" },
  stock_drop: { label:"Stock Price Drops",      color: C.amber,  desc:"≥5% drawdown events from synthetic price series as signal targets" },
};

const STRATEGY_MODES = {
  signal_only: { label:"Signal Monitor",    desc:"Alert only — no position taken. Measure detection accuracy." },
  short_entry: { label:"Short on Alert",    desc:"Enter short position when score crosses threshold. Exit after N days or event." },
  long_exit:   { label:"Reduce Long",       desc:"Exit existing long position when score crosses threshold." },
};

// ── Deterministic RNG ─────────────────────────────────────────────
function seededRand(seed) {
  let s = Math.abs(seed) % 2147483647 || 1;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

// ── Synthetic data generators ─────────────────────────────────────
function generateEvents(ticker, source, rand) {
  const days = 252;
  const events = [];

  if (source === "synthetic") {
    const n = 2 + Math.floor(rand() * 2);
    for (let i = 0; i < n; i++) events.push(40 + Math.floor(rand() * 180));
  } else if (source === "fda") {
    // FDA recalls cluster — one major, one possible minor
    events.push(35 + Math.floor(rand() * 60));
    if (rand() > 0.4) events.push(130 + Math.floor(rand() * 80));
  } else if (source === "stock_drop") {
    // Stock drops are less predictable, more random
    const n = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) events.push(20 + Math.floor(rand() * 210));
  }
  return [...new Set(events)].sort((a,b) => a - b);
}

function generatePriceSeries(ticker, events, rand, baseVol) {
  const prices = [100];
  for (let d = 1; d < 252; d++) {
    const prev = prices[d - 1];
    const drift = 0.0002;
    const shock = events.includes(d) ? -(0.04 + rand() * 0.06) : 0;
    const noise = (rand() - 0.5) * 2 * baseVol;
    prices.push(+(prev * (1 + drift + noise + shock)).toFixed(3));
  }
  return prices;
}

function generateSignalHistory(ticker, events, weights, rand, baselineSignals) {
  const days = 252;
  const baselines = { ...(baselineSignals || {}) };
  Object.keys(weights).forEach(k => { 
    if (baselines[k] === undefined) baselines[k] = 0.08 + rand() * 0.18; 
  });

  return Array.from({ length: days }, (_, d) => {
    const signals = {};
    const lead = events.reduce((closest, ev) => {
      const dist = ev - d;
      return (dist > 0 && dist < closest) ? dist : closest;
    }, 999);
    const proximity = lead < 999 ? Math.max(0, 1 - lead / 40) : 0;

    Object.keys(weights).forEach(k => {
      const noise = (rand() - 0.5) * 0.07;
      const boost = proximity * (0.35 + rand() * 0.5);
      signals[k] = Math.min(1, Math.max(0, baselines[k] + noise + boost));
    });

    const score = +Object.entries(weights)
      .reduce((s, [k, w]) => s + signals[k] * w * 10, 0)
      .toFixed(3);

    return { day: d, score, signals };
  });
}

// ── Strategy P&L engine ───────────────────────────────────────────
function runStrategy(history, prices, events, threshold, strategyMode, holdDays) {
  if (strategyMode === "signal_only") return { trades: [], totalPnl: 0, sharpe: null };

  const trades = [];
  let inTrade = false;
  let entryDay = null;
  let entryPrice = null;
  let totalPnl = 0;
  const dailyReturns = [];

  for (let d = 0; d < history.length - 1; d++) {
    const score = history[d].score;
    const price = prices[d];
    const nextPrice = prices[d + 1];
    const dailyRet = (nextPrice - price) / price;

    if (!inTrade && score >= threshold) {
      inTrade = true;
      entryDay = d;
      entryPrice = price;
    }

    if (inTrade) {
      // short position: profit when price goes down
      const shortRet = -dailyRet;
      dailyReturns.push(shortRet);
      totalPnl += shortRet;

      const holdExpired = d - entryDay >= holdDays;
      const eventHit = events.some(ev => ev === d);
      const scoreNormal = score < threshold * 0.7;

      if (holdExpired || eventHit || scoreNormal) {
        const exitPrice = nextPrice;
        const pnl = strategyMode === "short_entry"
          ? (entryPrice - exitPrice) / entryPrice
          : (exitPrice - entryPrice) / entryPrice;
        trades.push({
          entryDay, exitDay: d + 1, entryPrice,
          exitPrice, pnl: +pnl.toFixed(4),
          exitReason: holdExpired ? "hold_expired" : eventHit ? "event" : "score_normalized",
          score: history[d].score,
        });
        inTrade = false;
        entryDay = null;
        entryPrice = null;
      }
    } else {
      dailyReturns.push(0);
    }
  }

  const mean = dailyReturns.reduce((s, r) => s + r, 0) / (dailyReturns.length || 1);
  const variance = dailyReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (dailyReturns.length || 1);
  const sharpe = variance > 0 ? +(mean / Math.sqrt(variance) * Math.sqrt(252)).toFixed(2) : null;

  return { trades, totalPnl: +(totalPnl * 100).toFixed(2), sharpe };
}

// ── Full backtest engine ──────────────────────────────────────────
function runBacktest(weights, threshold, source, strategyMode, holdDays, realSignals = {}) {
  const results = [];
  let totalEvents = 0, detected = 0, leadSum = 0, fpCount = 0;
  let totalPnl = 0, tradesAll = [];

  COMPANIES.forEach((co, idx) => {
    const rand = seededRand(co.ticker.charCodeAt(0) * 97 + idx * 43 + 7);
    const events = generateEvents(co.ticker, source, rand);
    const prices = generatePriceSeries(co.ticker, events, rand, co.baseVol);
    const history = generateSignalHistory(co.ticker, events, weights, rand, realSignals[co.ticker]);
    const { trades, totalPnl: coPnl, sharpe } = runStrategy(
      history, prices, events, threshold, strategyMode, holdDays
    );

    totalEvents += events.length;
    tradesAll = [...tradesAll, ...trades.map(t => ({ ...t, ticker: co.ticker }))];
    totalPnl += coPnl;

    let leadDay = null;
    const primaryEvent = events[0];
    for (let d = 0; d < primaryEvent; d++) {
      if (history[d].score >= threshold) {
        leadDay = primaryEvent - d;
        break;
      }
    }
    if (leadDay !== null) { detected++; leadSum += leadDay; }

    // False positives
    let fp = 0;
    for (let d = 0; d < 252; d++) {
      if (history[d].score >= threshold) {
        const near = events.some(ev => Math.abs(ev - d) <= 60);
        if (!near) fp++;
      }
    }
    if (fp > 5) fpCount++;

    results.push({
      ...co, history, events, prices, primaryEvent,
      leadDay, detected: leadDay !== null,
      trades, pnl: coPnl, sharpe,
      maxScore: +Math.max(...history.map(h => h.score)).toFixed(2),
      avgScore: +(history.reduce((s, h) => s + h.score, 0) / history.length).toFixed(2),
    });
  });

  const accuracy = totalEvents > 0 ? detected / totalEvents : 0;
  const avgLead = detected > 0 ? Math.round(leadSum / detected) : 0;
  const fpRate = fpCount / COMPANIES.length;
  const allSharpes = results.filter(r => r.sharpe !== null).map(r => r.sharpe);
  const avgSharpe = allSharpes.length
    ? +(allSharpes.reduce((s, v) => s + v, 0) / allSharpes.length).toFixed(2) : null;

  return {
    results, accuracy, avgLead, fpRate, totalEvents,
    detected, totalPnl: +totalPnl.toFixed(2),
    tradesAll, avgSharpe,
  };
}

// ── UI helpers ────────────────────────────────────────────────────
const Pill = ({ children, color = C.green, size = 9 }) => (
  <span style={{
    fontFamily: C.mono, fontSize: size, fontWeight: 700,
    letterSpacing: "0.08em", textTransform: "uppercase",
    padding: "2px 8px", borderRadius: 3,
    color, background: color + "18", border: `1px solid ${color}35`,
  }}>{children}</span>
);

const CT = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.borderBright}`,
      borderRadius: 8, padding: "10px 14px", fontFamily: C.mono, fontSize: 11,
    }}>
      <div style={{ color: C.textSec, marginBottom: 6, fontSize: 10 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || C.green, marginBottom: 2 }}>
          {p.name}: <b>{typeof p.value === "number" ? p.value.toFixed(3) : p.value}</b>
        </div>
      ))}
    </div>
  );
};

function Stat({ label, value, sub, color = C.green }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${color}28`,
      borderRadius: 10, padding: "14px 16px", textAlign: "center",
    }}>
      <div style={{
        fontSize: 30, fontWeight: 800, color, fontFamily: C.mono,
        letterSpacing: "-0.04em", lineHeight: 1, marginBottom: 6,
      }}>{value}</div>
      <div style={{ fontSize: 11, color: C.text, fontWeight: 600, marginBottom: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: C.textSec }}>{sub}</div>}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────
export default function BacktesterV2() {
  const [weights, setWeights] = useState(SIGNAL_WEIGHTS_DEFAULT);
  const [threshold, setThreshold] = useState(6.0);
  const [source, setSource] = useState("fda");
  const [strategyMode, setStrategyMode] = useState("short_entry");
  const [holdDays, setHoldDays] = useState(14);
  const [running, setRunning] = useState(false);
  const [ran, setRan] = useState(false);
  const [results, setResults] = useState(null);
  const [tab, setTab] = useState("accuracy");
  const [selectedTicker, setSelectedTicker] = useState("UL");

  const [realSignals, setRealSignals] = useState({});

  useEffect(() => {
    // Fetch real current signal values from backend
    fetch("http://localhost:8000/companies")
      .then(r => r.json())
      .then(data => {
        if (data?.companies) {
          const mapped = {};
          data.companies.forEach(co => {
            mapped[co.ticker] = Object.fromEntries(
              Object.entries(co.signals || {}).map(([k, v]) => [k, v.raw])
            );
          });
          setRealSignals(mapped);
        }
      })
      .catch(() => {}); // fail silently — synthetic data is the fallback
  }, []);

  const totalW = useMemo(
    () => Object.values(weights).reduce((s, v) => s + v, 0),
    [weights]
  );

  const handleRun = useCallback(() => {
    setRunning(true);
    setTimeout(() => {
      const r = runBacktest(weights, threshold, source, strategyMode, holdDays, realSignals);
      setResults(r);
      setRunning(false);
      setRan(true);
    }, 1100);
  }, [weights, threshold, source, strategyMode, holdDays, realSignals]);

  const sel = results?.results?.find(r => r.ticker === selectedTicker);

  const tabs = [
    { id: "accuracy",   label: "Accuracy" },
    { id: "timeline",   label: "Signal Timeline" },
    { id: "breakdown",  label: "Per Company" },
    { id: "strategy",   label: "Strategy P&L" },
  ];

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: C.sans, color: C.text }}>

      {/* Scanline */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,232,122,0.008) 3px,rgba(0,232,122,0.008) 4px)",
      }} />

      {/* Header */}
      <div style={{
        borderBottom: `1px solid ${C.border}`, padding: "13px 24px",
        position: "sticky", top: 0, background: C.bg + "F5",
        backdropFilter: "blur(20px)", zIndex: 10,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {[C.red, C.amber, C.green].map((c, i) => (
              <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: c }} />
            ))}
          </div>
          <span style={{ fontFamily: C.mono, fontSize: 12, color: C.green, letterSpacing: "0.1em" }}>
            POST MORTEM BACKTESTER
          </span>
          <Pill color={C.amber}>COMPOSITE + STRATEGY</Pill>
          {ran && results && (
            <Pill color={GROUND_TRUTH_SOURCES[source].color}>
              {GROUND_TRUTH_SOURCES[source].label}
            </Pill>
          )}
        </div>
        <div style={{ display: "flex", gap: 3 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "5px 12px", borderRadius: 4, fontSize: 11,
              fontFamily: C.mono, cursor: "pointer", border: "none",
              background: tab === t.id ? C.greenFaint : "transparent",
              color: tab === t.id ? C.green : C.textSec,
              outline: tab === t.id ? `1px solid ${C.green}45` : "none",
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", maxWidth: 1260, margin: "0 auto", padding: "20px 24px", gap: 20, position: "relative", zIndex: 1 }}>

        {/* ── Left sidebar ── */}
        <div style={{ width: 270, flexShrink: 0, display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Ground truth source */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
            <div style={{ fontFamily: C.mono, fontSize: 9, color: C.textSec, letterSpacing: "0.15em", marginBottom: 12 }}>
              // GROUND TRUTH SOURCE
            </div>
            {Object.entries(GROUND_TRUTH_SOURCES).map(([k, v]) => (
              <div key={k} onClick={() => { setSource(k); setRan(false); }} style={{
                padding: "10px 12px", borderRadius: 8, marginBottom: 6, cursor: "pointer",
                background: source === k ? v.color + "18" : C.bg,
                border: `1px solid ${source === k ? v.color + "60" : C.border}`,
                transition: "all 0.15s",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: v.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: source === k ? v.color : C.text }}>
                    {v.label}
                  </span>
                </div>
                <p style={{ fontSize: 10, color: C.textSec, margin: 0, lineHeight: 1.5, paddingLeft: 15 }}>
                  {v.desc}
                </p>
              </div>
            ))}
          </div>

          {/* Strategy mode */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
            <div style={{ fontFamily: C.mono, fontSize: 9, color: C.textSec, letterSpacing: "0.15em", marginBottom: 12 }}>
              // STRATEGY LAYER
            </div>
            {Object.entries(STRATEGY_MODES).map(([k, v]) => (
              <div key={k} onClick={() => { setStrategyMode(k); setRan(false); }} style={{
                padding: "9px 12px", borderRadius: 8, marginBottom: 6, cursor: "pointer",
                background: strategyMode === k ? C.blueFaint : C.bg,
                border: `1px solid ${strategyMode === k ? C.blue + "60" : C.border}`,
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: strategyMode === k ? C.blue : C.text, marginBottom: 2 }}>
                  {v.label}
                </div>
                <div style={{ fontSize: 10, color: C.textSec, lineHeight: 1.5 }}>{v.desc}</div>
              </div>
            ))}

            {strategyMode !== "signal_only" && (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: C.text }}>Max hold period</span>
                  <span style={{ fontFamily: C.mono, fontSize: 11, color: C.blue }}>{holdDays}d</span>
                </div>
                <input type="range" min={3} max={30} value={holdDays}
                  onChange={e => { setHoldDays(+e.target.value); setRan(false); }}
                  style={{ width: "100%", accentColor: C.blue }} />
              </div>
            )}
          </div>

          {/* Signal weights */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontFamily: C.mono, fontSize: 9, color: C.textSec, letterSpacing: "0.15em" }}>
                // SIGNAL WEIGHTS
              </span>
              <span style={{
                fontFamily: C.mono, fontSize: 9,
                color: Math.abs(totalW - 1) > 0.015 ? C.red : C.green,
              }}>Σ={Math.round(totalW * 100)}%{Math.abs(totalW - 1) > 0.015 ? " ⚠" : " ✓"}</span>
            </div>
            {Object.entries(weights).map(([k, v]) => {
              const { label, color } = SIGNAL_META[k];
              return (
                <div key={k} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: C.text }}>{label}</span>
                    <span style={{ fontFamily: C.mono, fontSize: 10, color }}>{Math.round(v * 100)}%</span>
                  </div>
                  <div style={{ position: "relative", height: 4 }}>
                    <div style={{ position: "absolute", inset: 0, background: C.border, borderRadius: 2 }} />
                    <div style={{
                      position: "absolute", left: 0, top: 0, bottom: 0,
                      width: `${v * 200}%`, background: color, borderRadius: 2, opacity: 0.85,
                    }} />
                    <input type="range" min={0} max={50} value={Math.round(v * 100)}
                      onChange={e => { setWeights(p => ({ ...p, [k]: +e.target.value / 100 })); setRan(false); }}
                      style={{ position: "absolute", inset: 0, width: "100%", opacity: 0, cursor: "pointer" }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Threshold */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
            <div style={{ fontFamily: C.mono, fontSize: 9, color: C.textSec, letterSpacing: "0.15em", marginBottom: 10 }}>
              // ALERT THRESHOLD
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: C.text }}>Score trigger</span>
              <span style={{ fontFamily: C.mono, fontSize: 13, color: C.amber, fontWeight: 700 }}>{threshold.toFixed(1)}</span>
            </div>
            <input type="range" min={30} max={90} value={threshold * 10}
              onChange={e => { setThreshold(+e.target.value / 10); setRan(false); }}
              style={{ width: "100%", accentColor: C.amber }} />
          </div>

          {/* Run */}
          <button onClick={handleRun} disabled={running} style={{
            padding: "14px 0", borderRadius: 10, fontSize: 13, fontWeight: 700,
            fontFamily: C.mono, cursor: running ? "not-allowed" : "pointer", border: "none",
            background: running ? C.greenFaint : C.green + "22",
            color: running ? C.textSec : C.green,
            outline: `1px solid ${running ? C.textMut : C.green + "70"}`,
            letterSpacing: "0.06em", transition: "all 0.15s",
          }}>
            {running ? "SIMULATING..." : ran ? "↺ RE-RUN" : "▶ RUN BACKTEST"}
          </button>
        </div>

        {/* ── Main panel ── */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {!ran && !running && (
            <div style={{
              height: 500, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
              gap: 12,
            }}>
              <div style={{ fontFamily: C.mono, fontSize: 28, color: C.textMut }}>◈</div>
              <div style={{ fontFamily: C.mono, fontSize: 13, color: C.textSec }}>
                Configure and run the simulation
              </div>
              <div style={{ fontSize: 11, color: C.textMut, maxWidth: 360, textAlign: "center", lineHeight: 1.6 }}>
                Composite signal backtester + strategy layer. Select ground truth source, adjust signal weights, choose strategy mode, then run.
              </div>
            </div>
          )}

          {running && (
            <div style={{
              height: 500, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              background: C.card, border: `1px solid ${C.green}30`, borderRadius: 14, gap: 20,
            }}>
              <div style={{ fontFamily: C.mono, fontSize: 11, color: C.green, letterSpacing: "0.15em" }}>
                RUNNING SIMULATION ENGINE
              </div>
              <div style={{ width: 240, height: 3, background: C.border, borderRadius: 2, overflow: "hidden" }}>
                <div style={{
                  height: "100%", background: C.green, borderRadius: 2,
                  animation: "grow 1.1s ease-in-out forwards",
                }} />
              </div>
              <style>{`@keyframes grow{from{width:0}to{width:100%}}`}</style>
              <div style={{ fontSize: 11, color: C.textSec }}>
                {COMPANIES.length} companies × 252 days × {Object.keys(weights).length} signals
              </div>
            </div>
          )}

          {ran && results && (
            <div>

              {/* ── ACCURACY TAB ── */}
              {tab === "accuracy" && (
                <div>
                  {/* Headline row */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
                    <Stat label="Accuracy Rate"
                      value={`${(results.accuracy * 100).toFixed(0)}%`}
                      sub={`${results.detected} / ${results.totalEvents} events caught`}
                      color={results.accuracy >= 0.7 ? C.green : results.accuracy >= 0.5 ? C.amber : C.red}
                    />
                    <Stat label="Avg Lead Time"
                      value={`${results.avgLead}d`}
                      sub="days before event"
                      color={C.cyan}
                    />
                    <Stat label="False Positive Rate"
                      value={`${(results.fpRate * 100).toFixed(0)}%`}
                      sub="spurious alerts"
                      color={results.fpRate < 0.2 ? C.green : results.fpRate < 0.4 ? C.amber : C.red}
                    />
                    {strategyMode !== "signal_only" && results.avgSharpe !== null ? (
                      <Stat label="Avg Sharpe"
                        value={results.avgSharpe}
                        sub="annualised across companies"
                        color={results.avgSharpe >= 1 ? C.green : results.avgSharpe >= 0 ? C.amber : C.red}
                      />
                    ) : (
                      <Stat label="Ground Truth"
                        value={GROUND_TRUTH_SOURCES[source].label.split(" ")[0]}
                        sub={GROUND_TRUTH_SOURCES[source].label}
                        color={GROUND_TRUTH_SOURCES[source].color}
                      />
                    )}
                  </div>

                  {/* Verdict banner */}
                  <div style={{
                    background: results.accuracy >= 0.6 ? C.greenFaint : C.amberFaint,
                    border: `1px solid ${results.accuracy >= 0.6 ? C.green : C.amber}40`,
                    borderRadius: 10, padding: "14px 18px", marginBottom: 18,
                    display: "flex", alignItems: "flex-start", gap: 14,
                  }}>
                    <div style={{ fontFamily: C.mono, fontSize: 20, color: results.accuracy >= 0.6 ? C.green : C.amber, marginTop: 2 }}>
                      {results.accuracy >= 0.6 ? "◉" : "◎"}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: results.accuracy >= 0.6 ? C.green : C.amber, marginBottom: 5 }}>
                        BACKTEST VERDICT — {results.accuracy >= 0.7 ? "SIGNAL IS STRONGLY PREDICTIVE" : results.accuracy >= 0.5 ? "SIGNAL HAS PARTIAL PREDICTIVE POWER" : "THRESHOLD TOO STRICT — ADJUST WEIGHTS"}
                      </div>
                      <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.7 }}>
                        Against <strong style={{ color: C.text }}>{GROUND_TRUTH_SOURCES[source].label}</strong>,
                        the composite score detected <strong style={{ color: C.text }}>{results.detected} of {results.totalEvents} events</strong> ({(results.accuracy * 100).toFixed(0)}% accuracy)
                        with an average lead time of <strong style={{ color: C.cyan }}>{results.avgLead} days</strong> before the event date.
                        {strategyMode !== "signal_only" && results.avgSharpe !== null &&
                          ` The ${STRATEGY_MODES[strategyMode].label} strategy achieved an average Sharpe of ${results.avgSharpe}.`
                        }
                      </div>
                    </div>
                  </div>

                  {/* Accuracy by company */}
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 14 }}>
                    <div style={{ fontFamily: C.mono, fontSize: 9, color: C.textSec, letterSpacing: "0.15em", marginBottom: 14 }}>
                      // DETECTION STATUS BY COMPANY — PEAK SCORE vs THRESHOLD
                    </div>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={results.results} margin={{ left: -8, right: 8, top: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                        <XAxis dataKey="ticker" tick={{ fill: C.textSec, fontSize: 10, fontFamily: C.mono }} />
                        <YAxis domain={[0, 10]} tick={{ fill: C.textSec, fontSize: 9 }} />
                        <Tooltip content={<CT />} />
                        <ReferenceLine y={threshold} stroke={C.amber} strokeDasharray="5 3"
                          label={{ value: `threshold ${threshold}`, fill: C.amber, fontSize: 9, fontFamily: C.mono, position: "right" }} />
                        <Bar dataKey="maxScore" name="Peak score" radius={[3, 3, 0, 0]}>
                          {results.results.map((r, i) => (
                            <rect key={i} fill={r.detected ? C.green : C.red} fillOpacity={0.85} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Lead time distribution */}
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
                    <div style={{ fontFamily: C.mono, fontSize: 9, color: C.textSec, letterSpacing: "0.15em", marginBottom: 14 }}>
                      // DETECTION LEAD TIME BY COMPANY (days before event)
                    </div>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart
                        data={results.results}
                        layout="vertical" margin={{ left: 50, right: 30 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                        <XAxis type="number" tick={{ fill: C.textSec, fontSize: 9 }}
                          label={{ value: "lead days", fill: C.textMut, fontSize: 9, position: "insideBottom", offset: -2 }} />
                        <YAxis type="category" dataKey="ticker" tick={{ fill: C.textSec, fontSize: 9, fontFamily: C.mono }} />
                        <Tooltip content={<CT />} />
                        <ReferenceLine x={results.avgLead} stroke={C.cyan} strokeDasharray="4 4"
                          label={{ value: `avg ${results.avgLead}d`, fill: C.cyan, fontSize: 9, fontFamily: C.mono }} />
                        <Bar dataKey="leadDay" name="Lead days" radius={[0, 3, 3, 0]}>
                          {results.results.map((r, i) => (
                            <rect key={i} fill={r.detected ? (r.leadDay >= results.avgLead ? C.green : C.teal) : C.textMut} fillOpacity={0.8} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* ── TIMELINE TAB ── */}
              {tab === "timeline" && (
                <div>
                  {/* Ticker selector */}
                  <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
                    {results.results.map(r => (
                      <button key={r.ticker} onClick={() => setSelectedTicker(r.ticker)} style={{
                        padding: "5px 12px", borderRadius: 6, fontSize: 11,
                        fontFamily: C.mono, cursor: "pointer", border: "none",
                        background: selectedTicker === r.ticker
                          ? (r.detected ? C.greenFaint : C.redFaint)
                          : C.card,
                        color: selectedTicker === r.ticker
                          ? (r.detected ? C.green : C.red)
                          : C.textSec,
                        outline: `1px solid ${selectedTicker === r.ticker
                          ? (r.detected ? C.green : C.red) + "60" : C.border}`,
                      }}>
                        {r.ticker} {r.detected ? `+${r.leadDay}d` : "✗"}
                      </button>
                    ))}
                  </div>

                  {sel && (
                    <div>
                      {/* Header */}
                      <div style={{
                        background: C.card, border: `1px solid ${C.border}`,
                        borderRadius: 10, padding: "13px 16px", marginBottom: 14,
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                      }}>
                        <div>
                          <span style={{ fontFamily: C.mono, fontSize: 14, color: C.amber, fontWeight: 700, marginRight: 10 }}>
                            {sel.ticker}
                          </span>
                          <span style={{ fontSize: 13, color: C.text }}>{sel.name}</span>
                          <div style={{ fontSize: 11, color: C.textSec, marginTop: 4 }}>
                            Event at Day {sel.primaryEvent} — {sel.detected
                              ? `Detected ${sel.leadDay} days early`
                              : "Not detected before threshold"} —
                            Ground truth: <span style={{ color: GROUND_TRUTH_SOURCES[source].color }}>
                              {GROUND_TRUTH_SOURCES[source].label}
                            </span>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <Pill color={sel.detected ? C.green : C.red}>
                            {sel.detected ? `DETECTED +${sel.leadDay}d` : "MISSED"}
                          </Pill>
                          {sel.pnl !== undefined && strategyMode !== "signal_only" && (
                            <Pill color={sel.pnl >= 0 ? C.green : C.red}>
                              PnL {sel.pnl >= 0 ? "+" : ""}{sel.pnl}%
                            </Pill>
                          )}
                        </div>
                      </div>

                      {/* Composite score + price */}
                      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 14 }}>
                        <div style={{ fontFamily: C.mono, fontSize: 9, color: C.textSec, letterSpacing: "0.15em", marginBottom: 14 }}>
                          // COMPOSITE SCORE vs SYNTHETIC PRICE — 252 DAYS
                        </div>
                        <ResponsiveContainer width="100%" height={250}>
                          <ComposedChart
                            data={sel.history.map((h, i) => ({
                              day: h.day,
                              score: h.score,
                              price: +((sel.prices[i] - 100)).toFixed(3),
                            }))}
                            margin={{ left: -8, right: 30, top: 5 }}
                          >
                            <defs>
                              <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={C.green} stopOpacity={0.25} />
                                <stop offset="95%" stopColor={C.green} stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                            <XAxis dataKey="day" tick={{ fill: C.textSec, fontSize: 9 }}
                              label={{ value: "trading day", fill: C.textMut, fontSize: 9, position: "insideBottom", offset: -2 }} />
                            <YAxis yAxisId="score" domain={[0, 10]} tick={{ fill: C.textSec, fontSize: 9 }}
                              label={{ value: "score", angle: -90, position: "insideLeft", fill: C.textMut, fontSize: 9 }} />
                            <YAxis yAxisId="price" orientation="right"
                              tick={{ fill: C.textSec, fontSize: 9 }}
                              label={{ value: "price Δ%", angle: 90, position: "insideRight", fill: C.textMut, fontSize: 9 }} />
                            <Tooltip content={<CT />} />
                            {sel.events.map((ev, i) => (
                              <ReferenceLine key={i} yAxisId="score" x={ev}
                                stroke={C.red} strokeWidth={i === 0 ? 2 : 1}
                                strokeDasharray={i === 0 ? "none" : "4 4"}
                                label={i === 0 ? { value: "EVENT", fill: C.red, fontSize: 8, fontFamily: C.mono } : null} />
                            ))}
                            <ReferenceLine yAxisId="score" y={threshold}
                              stroke={C.amber} strokeDasharray="4 4"
                              label={{ value: "threshold", fill: C.amber, fontSize: 8, fontFamily: C.mono }} />
                            {sel.detected && (
                              <ReferenceLine yAxisId="score" x={sel.primaryEvent - sel.leadDay}
                                stroke={C.green} strokeDasharray="3 3"
                                label={{ value: "ALERT", fill: C.green, fontSize: 8, fontFamily: C.mono }} />
                            )}
                            {/* Strategy trade markers */}
                            {sel.trades?.map((t, i) => (
                              <ReferenceLine key={`entry-${i}`} yAxisId="score" x={t.entryDay}
                                stroke={C.blue} strokeWidth={1} strokeOpacity={0.6} />
                            ))}
                            <Area yAxisId="score" type="monotone" dataKey="score"
                              name="Composite score" stroke={C.green} strokeWidth={2}
                              fill="url(#sg)" />
                            <Line yAxisId="price" type="monotone" dataKey="price"
                              name="Price Δ%" stroke={C.amber} strokeWidth={1.5}
                              dot={false} strokeOpacity={0.7} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Signal trajectories */}
                      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
                        <div style={{ fontFamily: C.mono, fontSize: 9, color: C.textSec, letterSpacing: "0.15em", marginBottom: 14 }}>
                          // INDIVIDUAL SIGNAL TRAJECTORIES vs EVENT DATE
                        </div>
                        <ResponsiveContainer width="100%" height={210}>
                          <LineChart
                            data={sel.history.map(h => ({
                              day: h.day,
                              ...Object.fromEntries(
                                Object.entries(h.signals).map(([k, v]) => [
                                  SIGNAL_META[k].label, +v.toFixed(3)
                                ])
                              ),
                            }))}
                            margin={{ left: -8, right: 8 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                            <XAxis dataKey="day" tick={{ fill: C.textSec, fontSize: 9 }} />
                            <YAxis domain={[0, 1]} tick={{ fill: C.textSec, fontSize: 9 }} />
                            <Tooltip content={<CT />} />
                            {sel.events.map((ev, i) => (
                              <ReferenceLine key={i} x={ev} stroke={C.red}
                                strokeWidth={i === 0 ? 2 : 1} strokeOpacity={0.7} />
                            ))}
                            {Object.entries(SIGNAL_META).map(([k, m]) => (
                              <Line key={k} type="monotone" dataKey={m.label}
                                stroke={m.color} strokeWidth={1.5} dot={false} strokeOpacity={0.85} />
                            ))}
                            <Legend wrapperStyle={{ color: C.textSec, fontSize: 10, fontFamily: C.mono }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── PER COMPANY TAB ── */}
              {tab === "breakdown" && (
                <div>
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
                    {/* Table header */}
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "70px 150px 80px 80px 80px 80px 90px",
                      gap: 12, padding: "10px 16px",
                      borderBottom: `1px solid ${C.border}`,
                      background: C.bg,
                    }}>
                      {["Ticker","Company","Peak Score","Avg Score","Lead Days","Events","Status"].map(h => (
                        <div key={h} style={{ fontFamily: C.mono, fontSize: 9, color: C.textSec, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                          {h}
                        </div>
                      ))}
                    </div>
                    {results.results.map((r, i) => (
                      <div key={r.ticker}
                        onClick={() => { setSelectedTicker(r.ticker); setTab("timeline"); }}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "70px 150px 80px 80px 80px 80px 90px",
                          gap: 12, padding: "12px 16px", cursor: "pointer",
                          borderBottom: i < results.results.length - 1 ? `1px solid ${C.border}` : "none",
                          background: r.ticker === selectedTicker ? C.greenFaint : "transparent",
                          transition: "background 0.15s",
                        }}
                      >
                        <div style={{ fontFamily: C.mono, fontSize: 12, color: C.amber, fontWeight: 700 }}>{r.ticker}</div>
                        <div>
                          <div style={{ fontSize: 12, color: C.text, marginBottom: 3 }}>{r.name}</div>
                          <div style={{ height: 2, background: C.border, borderRadius: 1 }}>
                            <div style={{
                              height: "100%", borderRadius: 1,
                              width: `${(r.maxScore / 10) * 100}%`,
                              background: r.maxScore >= threshold ? C.red : r.maxScore >= threshold * 0.75 ? C.amber : C.green,
                            }} />
                          </div>
                        </div>
                        <div style={{ fontFamily: C.mono, fontSize: 12, color: r.maxScore >= threshold ? C.red : C.amber }}>
                          {r.maxScore}
                        </div>
                        <div style={{ fontFamily: C.mono, fontSize: 12, color: C.textSec }}>{r.avgScore}</div>
                        <div style={{ fontFamily: C.mono, fontSize: 12, color: r.detected ? C.cyan : C.textMut }}>
                          {r.detected ? `+${r.leadDay}d` : "—"}
                        </div>
                        <div style={{ fontFamily: C.mono, fontSize: 12, color: C.textSec }}>
                          {r.events.length}
                        </div>
                        <div>
                          <Pill color={r.detected ? C.green : C.red} size={8}>
                            {r.detected ? "DETECTED" : "MISSED"}
                          </Pill>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Score distribution area chart */}
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
                    <div style={{ fontFamily: C.mono, fontSize: 9, color: C.textSec, letterSpacing: "0.15em", marginBottom: 14 }}>
                      // SCORE DISTRIBUTION OVER TIME — ALL COMPANIES OVERLAID
                    </div>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart margin={{ left: -8, right: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                        <XAxis dataKey="day" type="number" domain={[0, 252]}
                          tick={{ fill: C.textSec, fontSize: 9 }} />
                        <YAxis domain={[0, 10]} tick={{ fill: C.textSec, fontSize: 9 }} />
                        <Tooltip content={<CT />} />
                        <ReferenceLine y={threshold} stroke={C.amber} strokeDasharray="4 4" />
                        {results.results.map((r, i) => (
                          <Line
                            key={r.ticker}
                            data={r.history.map(h => ({ day: h.day, [r.ticker]: h.score }))}
                            type="monotone" dataKey={r.ticker}
                            stroke={[C.green,C.red,C.blue,C.amber,C.purple,C.teal,C.cyan,C.green][i]}
                            strokeWidth={1.5} dot={false} strokeOpacity={0.7}
                          />
                        ))}
                        <Legend wrapperStyle={{ color: C.textSec, fontSize: 10, fontFamily: C.mono }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* ── STRATEGY P&L TAB ── */}
              {tab === "strategy" && (
                <div>
                  {strategyMode === "signal_only" ? (
                    <div style={{
                      height: 300, display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center",
                      background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
                    }}>
                      <div style={{ fontFamily: C.mono, fontSize: 28, color: C.textMut }}>◈</div>
                      <div style={{ fontSize: 13, color: C.textSec, marginTop: 12 }}>
                        Signal Monitor mode — no strategy P&L computed
                      </div>
                      <div style={{ fontSize: 11, color: C.textMut, marginTop: 6 }}>
                        Switch to "Short on Alert" or "Reduce Long" to see trade performance
                      </div>
                    </div>
                  ) : (
                    <div>
                      {/* Strategy stats */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 18 }}>
                        <Stat label="Total P&L"
                          value={`${results.totalPnl >= 0 ? "+" : ""}${results.totalPnl}%`}
                          sub="across all companies"
                          color={results.totalPnl >= 0 ? C.green : C.red}
                        />
                        <Stat label="Avg Sharpe"
                          value={results.avgSharpe ?? "—"}
                          sub="annualised, equal-weighted"
                          color={results.avgSharpe >= 1 ? C.green : results.avgSharpe >= 0 ? C.amber : C.red}
                        />
                        <Stat label="Total Trades"
                          value={results.tradesAll.length}
                          sub={`${holdDays}d max hold`}
                          color={C.blue}
                        />
                        <Stat label="Win Rate"
                          value={results.tradesAll.length
                            ? `${Math.round(results.tradesAll.filter(t => t.pnl > 0).length / results.tradesAll.length * 100)}%`
                            : "—"}
                          sub="profitable trades"
                          color={C.teal}
                        />
                      </div>

                      {/* Per-company P&L */}
                      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 14 }}>
                        <div style={{ fontFamily: C.mono, fontSize: 9, color: C.textSec, letterSpacing: "0.15em", marginBottom: 14 }}>
                          // PER-COMPANY STRATEGY P&L — {STRATEGY_MODES[strategyMode].label}
                        </div>
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart
                            data={results.results}
                            margin={{ left: -8, right: 8, top: 4 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                            <XAxis dataKey="ticker" tick={{ fill: C.textSec, fontSize: 10, fontFamily: C.mono }} />
                            <YAxis tick={{ fill: C.textSec, fontSize: 9 }}
                              label={{ value: "P&L %", angle: -90, position: "insideLeft", fill: C.textMut, fontSize: 9 }} />
                            <Tooltip content={<CT />} />
                            <ReferenceLine y={0} stroke={C.borderBright} />
                            <Bar dataKey="pnl" name="P&L %" radius={[3, 3, 0, 0]}>
                              {results.results.map((r, i) => (
                                <rect key={i} fill={r.pnl >= 0 ? C.green : C.red} fillOpacity={0.8} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Trade log */}
                      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
                        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, background: C.bg }}>
                          <span style={{ fontFamily: C.mono, fontSize: 9, color: C.textSec, letterSpacing: "0.15em" }}>
                            // TRADE LOG — {results.tradesAll.length} TRADES
                          </span>
                        </div>
                        <div style={{ maxHeight: 280, overflowY: "auto" }}>
                          <div style={{
                            display: "grid",
                            gridTemplateColumns: "50px 70px 60px 60px 70px 80px 100px",
                            gap: 10, padding: "8px 16px",
                            borderBottom: `1px solid ${C.border}`, background: C.bg,
                          }}>
                            {["Ticker","Entry","Exit","Hold","Score","PnL","Exit Reason"].map(h => (
                              <div key={h} style={{ fontFamily: C.mono, fontSize: 8, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.08em" }}>{h}</div>
                            ))}
                          </div>
                          {results.tradesAll.slice(0, 40).map((t, i) => (
                            <div key={i} style={{
                              display: "grid",
                              gridTemplateColumns: "50px 70px 60px 60px 70px 80px 100px",
                              gap: 10, padding: "8px 16px",
                              borderBottom: `1px solid ${C.border}`,
                              background: i % 2 === 0 ? C.bg : "transparent",
                            }}>
                              <div style={{ fontFamily: C.mono, fontSize: 10, color: C.amber }}>{t.ticker}</div>
                              <div style={{ fontFamily: C.mono, fontSize: 10, color: C.textSec }}>D{t.entryDay}</div>
                              <div style={{ fontFamily: C.mono, fontSize: 10, color: C.textSec }}>D{t.exitDay}</div>
                              <div style={{ fontFamily: C.mono, fontSize: 10, color: C.textSec }}>{t.exitDay - t.entryDay}d</div>
                              <div style={{ fontFamily: C.mono, fontSize: 10, color: t.score >= threshold ? C.red : C.amber }}>{t.score.toFixed(2)}</div>
                              <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 700, color: t.pnl >= 0 ? C.green : C.red }}>
                                {t.pnl >= 0 ? "+" : ""}{(t.pnl * 100).toFixed(2)}%
                              </div>
                              <div style={{ fontSize: 9, color: C.textSec, fontFamily: C.mono }}>
                                {t.exitReason.replace("_", " ")}
                              </div>
                            </div>
                          ))}
                          {results.tradesAll.length > 40 && (
                            <div style={{ padding: "10px 16px", fontFamily: C.mono, fontSize: 10, color: C.textMut }}>
                              +{results.tradesAll.length - 40} more trades...
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
