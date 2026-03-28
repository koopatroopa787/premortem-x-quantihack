"""
api/server.py
The Pre-Mortem Machine — FastAPI backend
All 5 endpoints + /health + CORS + request timing middleware.
Start with: uvicorn api.server:app --reload --port 8000
"""

import json
import os
import time
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ─── Path Setup ────────────────────────────────────────────────────────────────
_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.abspath(os.path.join(_HERE, "..", ".."))

# Allow running from backend/ or project root
import sys
_BACKEND = os.path.join(_ROOT, "backend")
for _p in [_BACKEND, _ROOT]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

from scoring.composite  import CompositeScorer
from scoring.canary     import CanaryRanker
from scoring.blame_chain import BlameChainAnalyser
from scoring.backtest   import BacktestEngine

LIVE_SNAPSHOT_PATH = os.path.join(_HERE, "..", "store", "live_snapshot.json")

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%SZ",
)
logger = logging.getLogger("premortem")

# ─── Instances ────────────────────────────────────────────────────────────────
scorer    = CompositeScorer()
ranker    = CanaryRanker()
blamer    = BlameChainAnalyser()
backtester = BacktestEngine()

# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="The Pre-Mortem Machine",
    description="Forensic supply chain intelligence for CPG companies.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    t0 = time.perf_counter()
    response = await call_next(request)
    elapsed = round((time.perf_counter() - t0) * 1000, 1)
    logger.info(f"{request.method} {request.url.path}  →  {response.status_code}  ({elapsed}ms)")
    return response


# ─── Helpers ──────────────────────────────────────────────────────────────────
def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_call(fn, *args, **kwargs):
    """Wraps any scorer call; on exception returns (None, error_string)."""
    try:
        return fn(*args, **kwargs), None
    except Exception as exc:
        logger.error(f"Scorer error: {exc}")
        return None, str(exc)


def _cause_of_failure(report: Dict[str, Any], blame: Dict[str, Any]) -> List[str]:
    """Generate human-readable forensic cause bullets."""
    causes = []
    signals = report.get("signals", {})

    fda = signals.get("fda_recall_velocity", {})
    if fda.get("raw", 0) >= 0.6:
        causes.append(f"FDA: High recall velocity signal ({fda['raw']:.0%} of critical threshold) — Source: openFDA")

    reddit = signals.get("reddit_oos_velocity", {})
    if reddit.get("raw", 0) >= 0.6:
        sigma = round(reddit["raw"] * 3, 1)
        causes.append(f"Consumer: Reddit out-of-stock mentions up {sigma}σ from brand baseline")

    wiki = signals.get("wikipedia_edit_wars", {})
    if wiki.get("raw", 0) >= 0.5:
        causes.append(f"Reputation: Wikipedia edit frequency elevated — potential brand narrative disruption")

    path = blame.get("propagation_path", [])
    if path:
        crit_connected = sum(1 for p in path if p.get("score", 0) >= 7.0)
        causes.append(
            f"Supply chain: Shared supplier with {len(path)} companies, "
            f"{crit_connected} currently CRITICAL"
        )

    edgar = signals.get("edgar_8k_keywords", {})
    if edgar.get("raw", 0) >= 0.5:
        causes.append(f"Regulatory: SEC 8-K filings contain elevated keyword density — Source: EDGAR")

    if not causes:
        causes.append("Signal levels are within normal range — monitoring continues")

    return causes


def _tod_estimate(score: float) -> str:
    if score >= 8.0:
        return "15-45 days"
    if score >= 7.0:
        return "60-90 days"
    if score >= 5.0:
        return "90-120 days"
    return "No imminent event detected"


def _confidence(score: float, degraded: List[str]) -> float:
    base = min(score / 10.0, 1.0)
    penalty = len(degraded) * 0.03
    return round(max(0.0, base - penalty), 2)


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    feeds = ["fda_recall_velocity", "reddit_oos_velocity", "wikipedia_edit_wars",
             "fred_macro_backdrop", "adzuna_job_velocity", "edgar_8k_keywords"]
    return JSONResponse({"status": "ok", "feeds": feeds, "uptime": _now_iso()})


@app.get("/companies")
async def get_companies():
    """All tracked CPG companies sorted by score descending."""
    companies, err = _safe_call(scorer.compute_all)
    if companies is None:
        return JSONResponse({
            "companies": [], "updated_at": _now_iso(),
            "feeds_active": 0, "stale": True, "error": err,
        })

    # Annotate with canary rank
    canary_list, _ = _safe_call(ranker.rank, companies)
    canary_map = {c["ticker"]: c.get("rank") for c in (canary_list or [])}

    for co in companies:
        co["canary_rank"] = canary_map.get(co["ticker"])

    companies.sort(key=lambda c: c.get("score", 0), reverse=True)
    return JSONResponse({
        "companies":   companies,
        "updated_at":  _now_iso(),
        "feeds_active": 6,
    })


@app.get("/company/{ticker}")
async def get_company_report(ticker: str):
    """Full Preliminary Post-Mortem Report for one company."""
    ticker = ticker.upper()
    today  = datetime.now(timezone.utc).strftime("%Y%m%d")

    report, err = _safe_call(scorer.compute_one, ticker)
    if report is None:
        return JSONResponse({"ticker": ticker, "stale": True, "error": err}, status_code=503)

    # Get all scores for blame chain context
    all_scores, _ = _safe_call(scorer.compute_all)
    blame, _ = _safe_call(blamer.analyse, ticker, all_scores)
    backtest, _ = _safe_call(backtester.run)

    blame    = blame    or {}
    backtest = backtest or {}

    score     = report.get("score", 0.0)
    degraded  = report.get("degraded_signals", [])
    bt_per_co = backtest.get("per_company", {}).get(ticker, {})

    return JSONResponse({
        "report_title":  "PRELIMINARY POST-MORTEM REPORT",
        "case_number":   f"PMM-2026-{ticker}-{today}",
        "filed_at":      _now_iso(),
        "ticker":        ticker,
        "name":          report.get("name", ticker),
        "confidence":    _confidence(score, degraded),
        "tod_estimate":  _tod_estimate(score),
        "status":        report.get("status", "STABLE"),
        "score":         score,
        "signals":       report.get("signals", {}),
        "degraded_signals": degraded,
        "blame_chain":   blame,
        "backtest_summary": {
            "avg_lead_days":  bt_per_co.get("avg_lead", backtest.get("avg_lead_days", 0)),
            "accuracy_rate":  bt_per_co.get("accuracy", backtest.get("accuracy_rate", 0)),
            "events_analysed": bt_per_co.get("events", 0),
            "methodology":    backtest.get("methodology", ""),
        },
        "cause_of_failure": _cause_of_failure(report, blame),
    })


@app.get("/canary")
async def get_canary_leaderboard():
    """Ranked list of companies by historical canary lead time."""
    all_scores, err = _safe_call(scorer.compute_all)
    if all_scores is None:
        return JSONResponse({"canaries": [], "stale": True, "error": err})

    canary_list, err2 = _safe_call(ranker.rank, all_scores)
    if canary_list is None:
        return JSONResponse({"canaries": [], "stale": True, "error": err2})

    top = ranker.get_top_canary(all_scores)
    return JSONResponse({
        "canaries":    canary_list,
        "top_canary":  top,
        "updated_at":  _now_iso(),
    })


@app.get("/blame-chain/{ticker}")
async def get_blame_chain(ticker: str):
    """Patient zero identification and full propagation path."""
    all_scores, _ = _safe_call(scorer.compute_all)
    result, err = _safe_call(blamer.analyse, ticker.upper(), all_scores)
    if result is None:
        return JSONResponse({"stale": True, "error": err}, status_code=503)
    return JSONResponse(result)


@app.get("/live")
async def get_live_updates():
    """
    Returns companies whose score changed >= 0.3 since last poll.
    Updates the live snapshot after every call.
    """
    current_scores, _ = _safe_call(scorer.compute_all)
    current_scores = current_scores or []
    current_map: Dict[str, float] = {c["ticker"]: c.get("score", 0) for c in current_scores}

    # Load previous snapshot
    prev_map: Dict[str, float] = {}
    if os.path.exists(LIVE_SNAPSHOT_PATH):
        try:
            with open(LIVE_SNAPSHOT_PATH, "r", encoding="utf-8") as fh:
                snap = json.load(fh)
            prev_map = snap.get("scores", {})
        except (json.JSONDecodeError, IOError):
            pass

    # Compute changes
    changes = []
    for ticker, curr in current_map.items():
        prev = prev_map.get(ticker, curr)
        delta = round(curr - prev, 3)
        if abs(delta) >= 0.3:
            changes.append({"ticker": ticker, "score": curr, "delta": delta})

    # Persist new snapshot
    try:
        os.makedirs(os.path.dirname(LIVE_SNAPSHOT_PATH), exist_ok=True)
        with open(LIVE_SNAPSHOT_PATH, "w", encoding="utf-8") as fh:
            json.dump({"scores": current_map, "snapshot_at": _now_iso()}, fh, indent=2)
    except IOError:
        pass

    payload: Dict[str, Any] = {"updated_at": _now_iso(), "changes": changes}
    if not changes:
        payload["message"] = "No significant changes"
    return JSONResponse(payload)


# ─── Server entry ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api.server:app", host="0.0.0.0", port=8000, reload=True)
