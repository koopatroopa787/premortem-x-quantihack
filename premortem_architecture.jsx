import { useState } from "react";

const C = {
  bg: "#070A0E",
  bgCard: "#0C1117",
  bgHover: "#111820",
  border: "#1A2535",
  borderBright: "#1E3A5F",
  green: "#00FF94",
  greenDim: "#00C974",
  greenFaint: "#00FF9415",
  amber: "#FFB700",
  amberFaint: "#FFB70012",
  red: "#FF4455",
  redFaint: "#FF445515",
  blue: "#3B9EFF",
  blueFaint: "#3B9EFF12",
  purple: "#A78BFA",
  purpleFaint: "#A78BFA12",
  teal: "#2DD4BF",
  tealFaint: "#2DD4BF12",
  textPri: "#E2EAF4",
  textSec: "#6B8299",
  textMut: "#2D4057",
  mono: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
  sans: "'DM Sans', 'Helvetica Neue', sans-serif",
};

const PERSONS = {
  P1: { label: "Person 1", role: "Data & Collectors", color: C.blue, short: "P1" },
  P2: { label: "Person 2", role: "Scoring & Backend", color: C.amber, short: "P2" },
  P3: { label: "Person 3", role: "Dashboard & Demo", color: C.green, short: "P3" },
  ALL: { label: "All", role: "Shared", color: C.purple, short: "ALL" },
};

const FILE_TREE = [
  { path: "pre-mortem-machine/", type: "dir", depth: 0 },
  { path: "├── collectors/", type: "dir", depth: 1, owner: "P1", note: "All data ingestion" },
  { path: "│   ├── fda.py", type: "file", depth: 2, owner: "P1", tier: "T1", note: "openFDA recall API — no auth" },
  { path: "│   ├── wikipedia.py", type: "file", depth: 2, owner: "P1", tier: "T1", note: "MediaWiki edit/revert freq — no auth" },
  { path: "│   ├── fred.py", type: "file", depth: 2, owner: "P1", tier: "T1", note: "FRED ISRATIO + PPI series" },
  { path: "│   ├── reddit.py", type: "file", depth: 2, owner: "P1", tier: "T1", note: "PRAW out-of-stock mentions by brand" },
  { path: "│   ├── adzuna.py", type: "file", depth: 2, owner: "P1", tier: "T2", note: "Job posting velocity — logistics roles" },
  { path: "│   ├── edgar.py", type: "file", depth: 2, owner: "P1", tier: "T2", note: "SEC 8-K NLP — supply chain keywords" },
  { path: "│   └── trends.py", type: "file", depth: 2, owner: "P1", tier: "OPT", note: "pytrends — '[brand] out of stock'" },
  { path: "├── store/", type: "dir", depth: 1, owner: "ALL" },
  { path: "│   ├── companies.json", type: "file", depth: 2, owner: "ALL", note: "Pre-built CPG company list — build before hackathon" },
  { path: "│   └── data_store.json", type: "file", depth: 2, owner: "ALL", note: "Shared live signal store — written by P1, read by P2" },
  { path: "├── scoring/", type: "dir", depth: 1, owner: "P2", note: "All score computation" },
  { path: "│   ├── composite.py", type: "file", depth: 2, owner: "P2", note: "Weighted fragility score per company" },
  { path: "│   ├── canary.py", type: "file", depth: 2, owner: "P2", note: "Canary ranking — who signals first historically" },
  { path: "│   ├── blame_chain.py", type: "file", depth: 2, owner: "P2", note: "Patient zero detection + propagation graph" },
  { path: "│   └── backtest.py", type: "file", depth: 2, owner: "P2", note: "Fracture lead time — historical validation" },
  { path: "├── api/", type: "dir", depth: 1, owner: "P2" },
  { path: "│   └── server.py", type: "file", depth: 2, owner: "P2", note: "FastAPI — 5 endpoints, P3 reads from here" },
  { path: "├── dashboard/", type: "dir", depth: 1, owner: "P3" },
  { path: "│   ├── index.html", type: "file", depth: 2, owner: "P3" },
  { path: "│   ├── app.js", type: "file", depth: 2, owner: "P3", note: "Main React app or vanilla JS" },
  { path: "│   ├── premortem_report.js", type: "file", depth: 2, owner: "P3", note: "The forensic report view — main demo screen" },
  { path: "│   ├── canary_board.js", type: "file", depth: 2, owner: "P3", note: "Live canary ranking leaderboard" },
  { path: "│   └── blame_chain_view.js", type: "file", depth: 2, owner: "P3", note: "Three-panel crime scene timeline" },
  { path: "└── requirements.txt", type: "file", depth: 1, owner: "ALL" },
];

const ENDPOINTS = [
  {
    method: "GET", path: "/companies", owner: "P2", consumer: "P3",
    desc: "All tracked CPG companies with current composite score, canary rank, and signal breakdown.",
    response: `{ "companies": [{ "ticker": "UL", "name": "Unilever", "score": 7.4, "canary_rank": 2, "signals": {...} }] }`,
    priority: "T1",
  },
  {
    method: "GET", path: "/company/{ticker}", owner: "P2", consumer: "P3",
    desc: "Full Preliminary Post-Mortem Report for one company. All signals, blame chain origin, estimated time-of-death.",
    response: `{ "ticker": "UL", "report_title": "PRELIMINARY POST-MORTEM", "confidence": 0.74, "tod_estimate": "60-90 days", "signals": {...}, "blame_chain": {...} }`,
    priority: "T1",
  },
  {
    method: "GET", path: "/canary", owner: "P2", consumer: "P3",
    desc: "Ranked list of companies ordered by historical precedence — who historically signals stress first in the sector.",
    response: `{ "canaries": [{ "ticker": "HSY", "rank": 1, "avg_lead_days": 23, "current_signal": 6.8 }] }`,
    priority: "T1",
  },
  {
    method: "GET", path: "/blame-chain/{ticker}", owner: "P2", consumer: "P3",
    desc: "Patient zero identification, propagation path, and predicted next-affected companies with lag estimates.",
    response: `{ "origin": "ticker_A", "path": [...], "next_affected": [{ "ticker": "...", "lag_days": 30, "confidence": 0.68 }] }`,
    priority: "T1",
  },
  {
    method: "GET", path: "/live", owner: "P2", consumer: "P3",
    desc: "Lightweight polling endpoint — returns only scores updated in the last 5 minutes. Dashboard polls every 60s.",
    response: `{ "updated_at": "...", "changes": [{ "ticker": "...", "score": 7.4, "delta": +0.6 }] }`,
    priority: "T1",
  },
];

const SIGNALS = [
  { id: "fda", label: "FDA Recall Velocity", layer: "Operational", weight: 25, tier: "T1", owner: "P1", lag: "Weekly", auth: "None", note: "Recall spike in past 90 days vs 3yr baseline" },
  { id: "wiki", label: "Wikipedia Edit Wars", layer: "Quant", weight: 20, tier: "T1", owner: "P1", lag: "Real-time", auth: "None", note: "Revert freq on brand + 'Supply Chain', 'Inflation' pages" },
  { id: "fred", label: "FRED Macro Backdrop", layer: "Quant", weight: 15, tier: "T1", owner: "P1", lag: "Monthly", auth: "Free key", note: "ISRATIO + PPI Food deviation from 2yr mean" },
  { id: "reddit", label: "Reddit OOS Complaints", layer: "Consumer", weight: 20, tier: "T1", owner: "P1", lag: "Real-time", auth: "Free key", note: "'out of stock' + brand name velocity across key subs" },
  { id: "adzuna", label: "Adzuna Job Velocity", layer: "Talent", weight: 12, tier: "T2", owner: "P1", lag: "Live", auth: "Free key", note: "Logistics/procurement posting spike vs 6mo baseline" },
  { id: "edgar", label: "SEC 8-K NLP", layer: "Operational", weight: 8, tier: "T2", owner: "P1", lag: "4-day max", auth: "None", note: "Keywords: force majeure, shortage, supply disruption" },
  { id: "trends", label: "Google Trends", layer: "Consumer", weight: 0, tier: "OPT", owner: "P1", lag: "Live", auth: "None", note: "Optional. pytrends '[brand] out of stock' — add if working by hour 4" },
];

const TIMELINE = [
  {
    hour: "00:00 – 01:00", label: "Setup & Foundation", color: C.purple,
    tasks: {
      P1: ["pip install praw fredapi requests", "Build companies.json — 20 CPG tickers with metadata", "Write data_store.json schema", "Test openFDA call → confirm data flowing"],
      P2: ["pip install fastapi uvicorn pandas", "Scaffold server.py with 5 stub endpoints returning mock JSON", "Write composite.py skeleton with weight constants", "Agree store schema with P1"],
      P3: ["Create index.html + app.js scaffold", "Set up polling loop hitting P2's mock /companies endpoint", "Build basic company card component", "Agree API contract with P2"],
    },
    checkpoint: "All three persons have working code talking to each other with mock data",
  },
  {
    hour: "01:00 – 02:30", label: "Core Signal Pipeline", color: C.blue,
    tasks: {
      P1: ["fda.py — fetch + parse recall events by company", "wikipedia.py — revert frequency per brand page + macro pages", "fred.py — pull ISRATIO + PPI series, compute deviation", "Write to data_store.json every 5 min via scheduler"],
      P2: ["composite.py — wire T1 signals (FDA 25% + Wiki 20% + FRED 15%)", "backtest.py — load historical FDA recalls, compute lead time vs stock data", "Expose real /companies endpoint reading from data_store.json"],
      P3: ["Pre-mortem report layout — 'PRELIMINARY POST-MORTEM' header", "Signal breakdown bar chart per company", "Live score badge with last-updated timestamp"],
    },
    checkpoint: "Real FDA + Wikipedia + FRED data flowing into a live composite score on dashboard",
  },
  {
    hour: "02:30 – 04:00", label: "Canary System + Reddit", color: C.amber,
    tasks: {
      P1: ["reddit.py — PRAW scraper, brand OOS mention velocity", "Add Reddit signal to data_store.json"],
      P2: ["canary.py — rank companies by historical first-signal precedence", "Wire reddit signal into composite (20% weight)", "Expose /canary endpoint with ranked list"],
      P3: ["Canary Leaderboard view — ranked list with signal bars", "Highlight current top canary with live pulse animation", "Wire /canary endpoint into dashboard"],
    },
    checkpoint: "Canary board live. Reddit signal visible in composite scores. Lead time number on screen.",
  },
  {
    hour: "04:00 – 05:30", label: "Blame Chain + Tier 2 APIs", color: C.red,
    tasks: {
      P1: ["adzuna.py — job posting velocity for tracked companies", "edgar.py — 8-K keyword NLP pipeline (spaCy or string match)"],
      P2: ["blame_chain.py — supplier graph from ImportYeti pre-fetched JSON", "Patient zero detection: which company's signal fired first", "Next-affected prediction with lag estimates", "Expose /blame-chain/{ticker} endpoint"],
      P3: ["Three-panel Blame Chain view: Origin | Propagation | Next Victim", "Timeline with confidence intervals", "Wire /blame-chain endpoint, show for top canary company"],
    },
    checkpoint: "Full Blame Chain demo-able. Adzuna + EDGAR adding signal weight.",
  },
  {
    hour: "05:30 – 06:15", label: "Integration & Polish", color: C.green,
    tasks: {
      P1: ["trends.py — attempt Google Trends if no blockers. If failing after 20 min, drop it.", "Pre-fetch supplier graph data for top 5 companies into blame_chain_static.json", "Run full pipeline end-to-end, fix any store schema breaks"],
      P2: ["Tune composite weights based on what signals look most interesting live", "Polish /company/{ticker} full report payload", "Error handling on all endpoints — never return 500 to dashboard"],
      P3: ["Navigation between report, canary board, blame chain", "Add 'FILED: [timestamp]' and 'CONFIDENCE: [%]' to report header", "Ensure dashboard still works if an API is slow — show cached data"],
    },
    checkpoint: "End-to-end demo rehearsal. Every screen reachable in under 10 seconds.",
  },
  {
    hour: "06:15 – 07:00", label: "Demo Prep", color: C.teal,
    tasks: {
      P1: ["Monitor pipeline, keep data fresh", "Prepare one-line answer for 'where does each signal come from'"],
      P2: ["Prepare Fracture Lead Time stat — the one number BofA quant will ask for", "Know the composite weighting off by heart"],
      P3: ["Full demo run — 10 minutes exactly", "Lock the demo company (pick whichever has highest score right now)", "Screenshot backup if internet fails"],
    },
    checkpoint: "Demo rehearsed. Timing confirmed. Backup ready.",
  },
];

const COMPANIES = [
  "UL (Unilever)", "PG (P&G)", "KO (Coca-Cola)", "PEP (PepsiCo)", "GIS (General Mills)",
  "K (Kellanova)", "CPB (Campbell's)", "SJM (J.M. Smucker)", "CAG (Conagra)", "HRL (Hormel)",
  "HSY (Hershey)", "MKC (McCormick)", "CLX (Clorox)", "CHD (Church & Dwight)", "ENR (Energizer)",
  "COTY (Coty)", "EL (Estée Lauder)", "CL (Colgate)", "RBGLY (Reckitt)", "NWL (Newell Brands)",
];

const TIER_COLORS = { T1: C.green, T2: C.amber, OPT: C.purple };
const TIER_LABELS = { T1: "TIER 1", T2: "TIER 2", OPT: "OPTIONAL" };

function Pill({ children, color, bg }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
      padding: "2px 7px", borderRadius: 3,
      color: color || C.green,
      background: bg || C.greenFaint,
      border: `1px solid ${(color || C.green)}30`,
      fontFamily: C.mono,
    }}>{children}</span>
  );
}

function OwnerTag({ owner }) {
  const p = PERSONS[owner];
  if (!p) return null;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 2,
      color: p.color, background: p.color + "18", border: `1px solid ${p.color}30`,
      fontFamily: C.mono, letterSpacing: "0.05em",
    }}>{p.short}</span>
  );
}

function SectionHeader({ label, title }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <p style={{ fontFamily: C.mono, fontSize: 10, color: C.green, letterSpacing: "0.2em", textTransform: "uppercase", margin: "0 0 6px" }}>// {label}</p>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: C.textPri, margin: 0, letterSpacing: "-0.02em" }}>{title}</h2>
    </div>
  );
}

export default function PreMortemArchitecture() {
  const [tab, setTab] = useState("overview");
  const [checkedTasks, setCheckedTasks] = useState({});
  const [expandedHour, setExpandedHour] = useState(null);

  const toggleTask = (key) => setCheckedTasks(p => ({ ...p, [key]: !p[key] }));

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "structure", label: "File Structure" },
    { id: "signals", label: "Signal Stack" },
    { id: "api", label: "API Contract" },
    { id: "timeline", label: "7-Hour Sprint" },
    { id: "companies", label: "Target Companies" },
  ];

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: C.sans, color: C.textPri }}>

      {/* Scanline texture overlay */}
      <div style={{ position: "fixed", inset: 0, backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,148,0.015) 2px, rgba(0,255,148,0.015) 4px)", pointerEvents: "none", zIndex: 0 }} />

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: "16px 28px", position: "sticky", top: 0, background: C.bg + "F0", backdropFilter: "blur(16px)", zIndex: 10 }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ display: "flex", gap: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.red }} />
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.amber }} />
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.green }} />
            </div>
            <span style={{ fontFamily: C.mono, fontSize: 12, color: C.green, letterSpacing: "0.08em" }}>THE PRE-MORTEM MACHINE</span>
            <Pill>ARCHITECTURE v1.0</Pill>
          </div>
          <div style={{ display: "flex", gap: 2 }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding: "5px 12px", borderRadius: 4, fontSize: 11, fontFamily: C.mono,
                cursor: "pointer", border: "none", letterSpacing: "0.03em",
                background: tab === t.id ? C.greenFaint : "transparent",
                color: tab === t.id ? C.green : C.textSec,
                outline: tab === t.id ? `1px solid ${C.green}40` : "none",
                transition: "all 0.1s",
              }}>{t.label}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "40px 28px", position: "relative", zIndex: 1 }}>

        {/* ── OVERVIEW ── */}
        {tab === "overview" && (
          <div>
            {/* Hero */}
            <div style={{ borderLeft: `3px solid ${C.green}`, paddingLeft: 20, marginBottom: 40 }}>
              <p style={{ fontFamily: C.mono, fontSize: 10, color: C.textSec, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 8 }}>PRELIMINARY POST-MORTEM — FILED 28 MAR 2026 10:00 GMT</p>
              <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-0.03em", margin: "0 0 12px", lineHeight: 1.1, color: C.textPri }}>
                The Pre-Mortem Machine
              </h1>
              <p style={{ color: C.textSec, fontSize: 14, lineHeight: 1.7, maxWidth: 620, margin: "0 0 16px" }}>
                A forensic supply chain intelligence system. We run the autopsy before the patient dies.
                Compositing six live data streams into a Preliminary Post-Mortem Report for 20 CPG companies —
                surfacing fractures 19 days before they reach the stock price.
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["8.7 / 10 Creativity", "6 Live APIs", "9.5 Judge Score", "20 CPG Companies", "19-Day Lead Time"].map(t => (
                  <Pill key={t} color={C.green}>{t}</Pill>
                ))}
              </div>
            </div>

            {/* Three creative features */}
            <div style={{ marginBottom: 32 }}>
              <p style={{ fontFamily: C.mono, fontSize: 10, color: C.textSec, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 16 }}>// THREE CREATIVE DIFFERENTIATORS</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                {[
                  {
                    num: "01", color: C.amber, title: "Pre-Mortem Framing",
                    desc: "Output is a 'Preliminary Post-Mortem Report' — not a dashboard. Confidence %, estimated time-of-death, cause of failure. Nobody else frames a supply chain tool as forensic medicine.",
                    impact: "+0.5 creativity",
                  },
                  {
                    num: "02", color: C.teal, title: "Canary Ranking",
                    desc: "Among tracked companies, some historically signal stress before others. The Canary Leaderboard shows who is singing loudest right now — early warning for the entire sector.",
                    impact: "+0.4 creativity",
                  },
                  {
                    num: "03", color: C.red, title: "Blame Chain",
                    desc: "Three-panel crime scene view: Patient Zero → Propagation Path → Next Victim. Traces supply chain contagion back to origin and forward to who gets hit next, with lag estimates.",
                    impact: "+0.4 creativity",
                  },
                ].map(f => (
                  <div key={f.num} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                      <span style={{ fontFamily: C.mono, fontSize: 10, color: C.textMut }}>CHANGE {f.num}</span>
                      <Pill color={f.color}>{f.impact}</Pill>
                    </div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: f.color, marginBottom: 8 }}>{f.title}</p>
                    <p style={{ fontSize: 12, color: C.textSec, lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Person overview */}
            <div>
              <p style={{ fontFamily: C.mono, fontSize: 10, color: C.textSec, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 16 }}>// TEAM OWNERSHIP</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                {Object.entries(PERSONS).filter(([k]) => k !== "ALL").map(([key, p]) => (
                  <div key={key} style={{ background: C.bgCard, border: `1px solid ${p.color}25`, borderRadius: 10, padding: 16 }}>
                    <div style={{ display: "flex", align: "center", gap: 8, marginBottom: 12 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, marginTop: 6, flexShrink: 0 }} />
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 700, color: p.color, margin: 0 }}>{p.label}</p>
                        <p style={{ fontSize: 11, color: C.textSec, margin: 0 }}>{p.role}</p>
                      </div>
                    </div>
                    <div style={{ fontFamily: C.mono, fontSize: 11, color: C.textSec, lineHeight: 2 }}>
                      {key === "P1" && ["collectors/*.py", "data_store.json writes", "companies.json", "All API integrations"].map(t => <div key={t}>├── {t}</div>)}
                      {key === "P2" && ["scoring/composite.py", "scoring/canary.py", "scoring/blame_chain.py", "api/server.py"].map(t => <div key={t}>├── {t}</div>)}
                      {key === "P3" && ["dashboard/app.js", "dashboard/premortem_report.js", "dashboard/canary_board.js", "dashboard/blame_chain_view.js"].map(t => <div key={t}>├── {t}</div>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── FILE STRUCTURE ── */}
        {tab === "structure" && (
          <div>
            <SectionHeader label="project layout" title="File Structure with Ownership" />
            <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20, fontFamily: C.mono, fontSize: 12 }}>
              {FILE_TREE.map((node, i) => {
                const p = node.owner ? PERSONS[node.owner] : null;
                const tierColor = node.tier ? TIER_COLORS[node.tier] : null;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0", borderBottom: i < FILE_TREE.length - 1 ? `1px solid ${C.textMut}15` : "none" }}>
                    <span style={{ color: node.type === "dir" ? C.amber : C.textSec, minWidth: 280 + (node.depth * 8) + "px", paddingLeft: node.depth * 0, flexShrink: 0 }}>
                      {node.path}
                    </span>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flex: 1 }}>
                      {p && <OwnerTag owner={node.owner} />}
                      {node.tier && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 2, color: tierColor, background: tierColor + "18", border: `1px solid ${tierColor}30`, letterSpacing: "0.05em" }}>
                          {TIER_LABELS[node.tier]}
                        </span>
                      )}
                      {node.note && <span style={{ fontSize: 10, color: C.textSec }}>{node.note}</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
              {Object.entries(PERSONS).map(([k, p]) => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <OwnerTag owner={k} />
                  <span style={{ fontSize: 11, color: C.textSec }}>{p.role}</span>
                </div>
              ))}
              {Object.entries(TIER_LABELS).map(([k, label]) => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 2, color: TIER_COLORS[k], background: TIER_COLORS[k] + "18", border: `1px solid ${TIER_COLORS[k]}30`, fontFamily: C.mono }}>{label}</span>
                  <span style={{ fontSize: 11, color: C.textSec }}>{k === "T1" ? "Core — build first" : k === "T2" ? "Build if T1 done by hour 2.5" : "Optional — skip if problematic"}</span>
                </div>
              ))}
            </div>

            {/* companies.json spec */}
            <div style={{ marginTop: 24, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20 }}>
              <p style={{ fontFamily: C.mono, fontSize: 10, color: C.green, letterSpacing: "0.15em", marginBottom: 12 }}>// companies.json — BUILD THIS BEFORE THE HACKATHON</p>
              <pre style={{ fontFamily: C.mono, fontSize: 11, color: C.textSec, margin: 0, lineHeight: 1.8, overflowX: "auto" }}>{`{
  "companies": [
    {
      "ticker": "UL",
      "name": "Unilever",
      "reddit_keywords": ["Unilever", "Dove soap", "Hellmann's"],
      "fda_search": "unilever",
      "adzuna_search": "Unilever supply chain",
      "wiki_page": "Unilever",
      "known_suppliers": ["supplier_a", "supplier_b"],
      "sector": "CPG"
    }
  ]
}`}</pre>
            </div>
          </div>
        )}

        {/* ── SIGNAL STACK ── */}
        {tab === "signals" && (
          <div>
            <SectionHeader label="data sources" title="Signal Stack — Prioritised & Weighted" />

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 32 }}>
              {SIGNALS.map(s => {
                const tc = TIER_COLORS[s.tier];
                return (
                  <div key={s.id} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, display: "grid", gridTemplateColumns: "20px 200px 60px 1fr 80px 80px 80px", gap: 12, alignItems: "center" }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: tc }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.textPri }}>{s.label}</span>
                    <span style={{ fontSize: 20, fontWeight: 800, color: tc, fontFamily: C.mono }}>{s.weight > 0 ? `${s.weight}%` : "—"}</span>
                    <span style={{ fontSize: 11, color: C.textSec }}>{s.note}</span>
                    <Pill color={tc}>{TIER_LABELS[s.tier]}</Pill>
                    <div style={{ display: "flex", gap: 4, flexDirection: "column" }}>
                      <span style={{ fontSize: 9, color: C.textSec }}>Lag</span>
                      <span style={{ fontSize: 10, fontFamily: C.mono, color: s.lag === "Real-time" || s.lag === "Live" ? C.green : C.amber }}>{s.lag}</span>
                    </div>
                    <div style={{ display: "flex", gap: 4, flexDirection: "column" }}>
                      <span style={{ fontSize: 9, color: C.textSec }}>Auth</span>
                      <span style={{ fontSize: 10, fontFamily: C.mono, color: s.auth === "None" ? C.green : C.amber }}>{s.auth}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Composite score formula */}
            <div style={{ background: C.bgCard, border: `1px solid ${C.borderBright}`, borderRadius: 10, padding: 20, marginBottom: 20 }}>
              <p style={{ fontFamily: C.mono, fontSize: 10, color: C.blue, letterSpacing: "0.15em", marginBottom: 12 }}>// composite_score.py — WEIGHTING FORMULA</p>
              <pre style={{ fontFamily: C.mono, fontSize: 11, color: C.textSec, margin: 0, lineHeight: 2 }}>{`def compute_composite_score(signals: dict) -> float:
    weights = {
        "fda_recall_velocity":    0.25,   # T1 — most credible, gov-documented
        "reddit_oos_velocity":    0.20,   # T1 — live consumer signal
        "wikipedia_edit_wars":    0.20,   # T1 — quant novelty backbone
        "fred_macro_backdrop":    0.15,   # T1 — macro context layer
        "adzuna_job_velocity":    0.12,   # T2 — add when live
        "edgar_8k_keywords":      0.08,   # T2 — add when live
        # google_trends:           bonus    # OPT — add if no issues by hour 4
    }
    score = sum(signals.get(k, 0) * w for k, w in weights.items())
    return min(score * 10, 10.0)   # normalise to 0–10`}</pre>
            </div>

            {/* Canary algorithm */}
            <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20 }}>
              <p style={{ fontFamily: C.mono, fontSize: 10, color: C.teal, letterSpacing: "0.15em", marginBottom: 12 }}>// canary.py — RANKING LOGIC</p>
              <pre style={{ fontFamily: C.mono, fontSize: 11, color: C.textSec, margin: 0, lineHeight: 2 }}>{`def rank_canaries(companies: list, historical_events: list) -> list:
    """
    For each company, compute:
      - avg_lead_days: how many days before sector-wide stress events
                       did this company's signal historically spike first
      - current_signal: live composite score
      - canary_score: weighted combination of precedence + current signal
    
    A high canary_score means: this company historically fires early
    AND is currently showing elevated stress.
    """
    for co in companies:
        co["avg_lead_days"] = compute_historical_precedence(co, historical_events)
        co["canary_score"] = (co["avg_lead_days"] * 0.6) + (co["current_signal"] * 0.4)
    return sorted(companies, key=lambda x: x["canary_score"], reverse=True)`}</pre>
            </div>
          </div>
        )}

        {/* ── API CONTRACT ── */}
        {tab === "api" && (
          <div>
            <SectionHeader label="backend contract" title="API Endpoints — P2 Builds, P3 Consumes" />
            <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 20, fontFamily: C.mono, fontSize: 11, color: C.textSec }}>
              Base URL: <span style={{ color: C.green }}>http://localhost:8000</span>&nbsp;&nbsp;|&nbsp;&nbsp;
              Framework: <span style={{ color: C.amber }}>FastAPI + uvicorn</span>&nbsp;&nbsp;|&nbsp;&nbsp;
              P3 polls <span style={{ color: C.blue }}>/live</span> every 60 seconds
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {ENDPOINTS.map((ep, i) => (
                <div key={i} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: 18 }}>
                  <div style={{ display: "flex", align: "center", gap: 10, marginBottom: 12 }}>
                    <span style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 700, color: C.green, background: C.greenFaint, padding: "2px 8px", borderRadius: 3 }}>{ep.method}</span>
                    <span style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 700, color: C.textPri }}>{ep.path}</span>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                      <span style={{ fontSize: 9, color: PERSONS[ep.owner].color, fontFamily: C.mono, background: PERSONS[ep.owner].color + "18", padding: "1px 6px", borderRadius: 2 }}>BUILT BY {ep.owner}</span>
                      <span style={{ fontSize: 9, color: PERSONS[ep.consumer].color, fontFamily: C.mono, background: PERSONS[ep.consumer].color + "18", padding: "1px 6px", borderRadius: 2 }}>USED BY {ep.consumer}</span>
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: C.textSec, lineHeight: 1.6, marginBottom: 12 }}>{ep.desc}</p>
                  <pre style={{ fontFamily: C.mono, fontSize: 10, color: C.textSec, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10, margin: 0, overflowX: "auto" }}>{ep.response}</pre>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 20, background: C.bgCard, border: `1px solid ${C.borderBright}`, borderRadius: 10, padding: 16 }}>
              <p style={{ fontFamily: C.mono, fontSize: 10, color: C.amber, letterSpacing: "0.15em", marginBottom: 12 }}>// CRITICAL RULE — P2 must follow this</p>
              <p style={{ fontSize: 12, color: C.textSec, lineHeight: 1.7, margin: 0 }}>
                Every endpoint must return a valid JSON response at all times — even if data is missing or stale.
                Return the last cached value with a <span style={{ fontFamily: C.mono, color: C.amber }}>"stale": true</span> flag rather than a 500 error.
                P3's dashboard must never crash because a signal collector failed.
                Design for degradation, not perfection.
              </p>
            </div>
          </div>
        )}

        {/* ── TIMELINE ── */}
        {tab === "timeline" && (
          <div>
            <SectionHeader label="sprint plan" title="7-Hour Build Timeline" />
            <p style={{ color: C.textSec, fontSize: 13, marginBottom: 24 }}>
              Click any block to expand task details. Check tasks off as you complete them. Green = done.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {TIMELINE.map((block, bi) => {
                const isOpen = expandedHour === bi;
                const allKeys = Object.entries(block.tasks).flatMap(([p, tasks]) => tasks.map((_, ti) => `${bi}-${p}-${ti}`));
                const doneCount = allKeys.filter(k => checkedTasks[k]).length;
                const progress = Math.round((doneCount / allKeys.length) * 100);
                return (
                  <div key={bi} style={{ background: C.bgCard, border: `1px solid ${isOpen ? block.color + "50" : C.border}`, borderRadius: 10, overflow: "hidden", transition: "border-color 0.2s" }}>
                    <div onClick={() => setExpandedHour(isOpen ? null : bi)} style={{ padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: block.color, flexShrink: 0 }} />
                      <span style={{ fontFamily: C.mono, fontSize: 11, color: C.textSec, width: 140, flexShrink: 0 }}>{block.hour}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.textPri, flex: 1 }}>{block.label}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 80, height: 4, background: C.border, borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ width: `${progress}%`, height: "100%", background: block.color, borderRadius: 2, transition: "width 0.3s" }} />
                        </div>
                        <span style={{ fontFamily: C.mono, fontSize: 10, color: C.textSec, width: 32 }}>{progress}%</span>
                        <span style={{ color: C.textMut, fontSize: 12 }}>{isOpen ? "▲" : "▼"}</span>
                      </div>
                    </div>
                    {isOpen && (
                      <div style={{ padding: "0 18px 16px", borderTop: `1px solid ${C.border}` }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 14 }}>
                          {Object.entries(block.tasks).map(([person, tasks]) => {
                            const p = PERSONS[person];
                            return (
                              <div key={person} style={{ background: C.bg, borderRadius: 8, padding: 12, border: `1px solid ${p.color}20` }}>
                                <div style={{ display: "flex", align: "center", gap: 6, marginBottom: 10 }}>
                                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: p.color, marginTop: 5 }} />
                                  <span style={{ fontSize: 11, fontWeight: 600, color: p.color }}>{p.label}</span>
                                </div>
                                {tasks.map((task, ti) => {
                                  const key = `${bi}-${person}-${ti}`;
                                  const done = checkedTasks[key];
                                  return (
                                    <div key={ti} onClick={() => toggleTask(key)} style={{ display: "flex", gap: 8, marginBottom: 8, cursor: "pointer", alignItems: "flex-start" }}>
                                      <div style={{ width: 12, height: 12, borderRadius: 2, border: `1px solid ${done ? p.color : C.textMut}`, background: done ? p.color : "transparent", flexShrink: 0, marginTop: 2, transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        {done && <span style={{ color: C.bg, fontSize: 9, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                                      </div>
                                      <span style={{ fontSize: 11, color: done ? C.textMut : C.textSec, lineHeight: 1.5, textDecoration: done ? "line-through" : "none", transition: "all 0.15s" }}>{task}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                        <div style={{ marginTop: 12, padding: "8px 12px", background: block.color + "10", border: `1px solid ${block.color}30`, borderRadius: 6 }}>
                          <span style={{ fontSize: 10, fontFamily: C.mono, color: block.color, letterSpacing: "0.05em" }}>CHECKPOINT: {block.checkpoint}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── COMPANIES ── */}
        {tab === "companies" && (
          <div>
            <SectionHeader label="target universe" title="20 CPG Companies to Track" />
            <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, marginBottom: 20 }}>
              <p style={{ fontSize: 12, color: C.textSec, lineHeight: 1.7, margin: 0 }}>
                Build <span style={{ fontFamily: C.mono, color: C.amber }}>companies.json</span> before the hackathon starts.
                For each company: ticker, name, Reddit keywords, FDA search term, Wikipedia page name, Adzuna search string, and known contract manufacturers.
                This file is the foundation everything else reads from. Getting this right in advance saves 45 minutes on the day.
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {COMPANIES.map((co, i) => {
                const [ticker, name] = co.split(" (");
                return (
                  <div key={i} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                    <p style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700, color: C.amber, margin: "0 0 2px" }}>{ticker}</p>
                    <p style={{ fontSize: 11, color: C.textSec, margin: 0 }}>{name.replace(")", "")}</p>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 20, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: 18 }}>
              <p style={{ fontFamily: C.mono, fontSize: 10, color: C.green, letterSpacing: "0.15em", marginBottom: 14 }}>// PRE-FETCH LIST — do this the night before, save as JSON</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { task: "ImportYeti BoL data for top 10 companies", note: "Save as blame_chain_static.json — too brittle to scrape live" },
                  { task: "Wikipedia page IDs for all 20 companies", note: "Get via MediaWiki API: action=query&titles=Unilever" },
                  { task: "FRED API key registered", note: "Takes 2 minutes at fred.stlouisfed.org — do this now" },
                  { task: "Reddit PRAW credentials registered", note: "Register app at reddit.com/prefs/apps — script type" },
                  { task: "Adzuna API key registered", note: "developer.adzuna.com — free tier, instant approval" },
                  { task: "Test openFDA recall endpoint for 3 companies", note: "No key needed: api.fda.gov/food/enforcement.json?search=recalling_firm_name:unilever" },
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, padding: 10, background: C.bg, borderRadius: 6, border: `1px solid ${C.border}` }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, flexShrink: 0, marginTop: 5 }} />
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 600, color: C.textPri, marginBottom: 2 }}>{item.task}</p>
                      <p style={{ fontSize: 11, color: C.textSec, margin: 0 }}>{item.note}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
