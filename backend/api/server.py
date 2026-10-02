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

# ─── Path Setup ───────────────────────────────────────────────────────────────
_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.abspath(os.path.join(_HERE, "..", ".."))

import sys
_BACKEND = os.path.join(_ROOT, "backend")
for _p in [_BACKEND, _ROOT]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

from scoring.composite   import CompositeScorer, WEIGHTS
from scoring.canary      import CanaryRanker
from scoring.blame_chain import BlameChainAnalyser
from backend.scoring.forecast_audit import LEDGER_PATH, audit_summary

LIVE_SNAPSHOT_PATH = os.path.join(_HERE, "..", "store", "live_snapshot.json")

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%SZ",
)
logger = logging.getLogger("premortem")

# ─── Instances ────────────────────────────────────────────────────────────────
scorer     = CompositeScorer()
ranker     = CanaryRanker()
blamer     = BlameChainAnalyser()

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
    logger.info(
        f"{request.method} {request.url.path}  →  {response.status_code}  ({elapsed}ms)"
    )
    return response


# ─── Helpers ──────────────────────────────────────────────────────────────────
def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_call(fn, *args, **kwargs):
    """Wraps any scorer call. On exception returns (None, error_string)."""
    try:
        return fn(*args, **kwargs), None
    except Exception as exc:
        logger.error(f"Scorer error in {fn.__name__}: {exc}")
        return None, str(exc)


def _cause_of_failure(report: Dict[str, Any], blame: Dict[str, Any]) -> List[str]:
    """
    Generate human-readable forensic cause bullets from live signal values.
    Reddit removed — replaced with Google Trends as the consumer signal.
    """
    causes = []
    signals = report.get("signals", {})

    fda = signals.get("fda_recall_velocity", {})
    if fda.get("raw", 0) >= 0.6:
        causes.append(
            f"FDA: High recall velocity signal ({fda['raw']:.0%} of critical threshold)"
            f" — Source: openFDA Enforcement Reports"
        )

    # Search-interest changes can corroborate attention, not prove shortages.
    trends = signals.get("google_trends", {})
    if trends.get("raw", 0) >= 0.5:
        causes.append(
            f"Consumer attention: Google Trends brand-search velocity elevated"
            f" ({trends['raw']:.0%}); this is not proof of a shortage"
        )

    wiki = signals.get("wikipedia_edit_wars", {})
    if wiki.get("raw", 0) >= 0.5:
        causes.append(
            "Reputation: Wikipedia edit frequency elevated"
            " — potential brand narrative disruption in progress"
        )

    fred = signals.get("fred_macro_backdrop", {})
    if fred.get("raw", 0) >= 0.6:
        causes.append(
            f"Macro: FRED inventory-to-sales ratio and PPI elevated"
            f" ({fred['raw']:.0%}) — sector-wide input cost stress"
        )

    adzuna = signals.get("adzuna_job_velocity", {})
    if adzuna.get("raw", 0) >= 0.5:
        causes.append(
            f"Operational: Elevated logistics and supply chain job postings"
            f" ({adzuna['raw']:.0%}) — Source: Adzuna"
        )

    edgar = signals.get("edgar_8k_keywords", {})
    if edgar.get("raw", 0) >= 0.5:
        causes.append(
            f"Regulatory: SEC 8-K filings contain elevated supply disruption"
            f" keyword density ({edgar['raw']:.0%}) — Source: EDGAR"
        )

    if not causes:
        causes.append(
            "All signal levels within normal operating range — monitoring continues"
        )

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


def _feed_coverage(companies: List[Dict[str, Any]]) -> Dict[str, Dict[str, int]]:
    return {
        name: {
            "available": sum(bool(co.get("signals", {}).get(name, {}).get("available")) for co in companies),
            "total": len(companies),
        }
        for name in WEIGHTS
    }


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    """Server status and observed feed coverage, not a static 'all active' claim."""
    feeds = [
        "fda_recall_velocity",
        "wikipedia_edit_wars",
        "fred_macro_backdrop",
        "adzuna_job_velocity",
        "edgar_8k_keywords",
        "google_trends",
    ]
    companies, _ = _safe_call(scorer.compute_all)
    return JSONResponse({
        "status": "ok", "feeds": feeds,
        "feed_coverage": _feed_coverage(companies or []),
        "checked_at": _now_iso(),
    })


@app.get("/companies")
async def get_companies():
    """All 20 tracked CPG companies sorted by composite score descending."""
    companies, err = _safe_call(scorer.compute_all)
    if companies is None:
        return JSONResponse({
            "companies":    [],
            "updated_at":   _now_iso(),
            "feeds_active": 0,
            "stale":        True,
            "error":        err,
        })

    # Annotate with canary rank
    canary_list, _ = _safe_call(ranker.rank, companies)
    canary_map = {c["ticker"]: c.get("rank") for c in (canary_list or [])}

    for co in companies:
        co["canary_rank"] = canary_map.get(co["ticker"])

    companies.sort(key=lambda c: c.get("score", 0), reverse=True)

    return JSONResponse({
        "companies":    companies,
        "updated_at":   _now_iso(),
        "feeds_active": sum(row["available"] > 0 for row in _feed_coverage(companies).values()),
        "feed_coverage": _feed_coverage(companies),
    })


@app.get("/company/{ticker}")
async def get_company_report(ticker: str):
    """Full Preliminary Post-Mortem Report for a single company."""
    ticker = ticker.upper()
    today  = datetime.now(timezone.utc).strftime("%Y%m%d")

    report, err = _safe_call(scorer.compute_one, ticker)
    if report is None:
        return JSONResponse(
            {"ticker": ticker, "stale": True, "error": err},
            status_code=503,
        )

    # Blame-chain lookup is best-effort. Synthetic legacy backtest numbers are
    # deliberately not included in a company report.
    all_scores, _ = _safe_call(scorer.compute_all)
    blame, _      = _safe_call(blamer.analyse, ticker, all_scores)

    blame    = blame    or {}

    score    = report.get("score", 0.0)
    degraded = report.get("degraded_signals", [])

    return JSONResponse({
        "report_title":     "PRELIMINARY POST-MORTEM REPORT",
        "case_number":      f"PMM-2026-{ticker}-{today}",
        "filed_at":         _now_iso(),
        "ticker":           ticker,
        "name":             report.get("name", ticker),
        "confidence":       _confidence(score, degraded),
        "confidence_kind":  "uncalibrated_score_transform",
        "tod_estimate":     _tod_estimate(score),
        "tod_kind":         "untested_score_band_heuristic",
        "status":           report.get("status", "STABLE"),
        "score":            score,
        "signals":          report.get("signals", {}),
        "google_trends_detail": report.get("google_trends_detail", {}),
        "degraded_signals": degraded,
        "blame_chain":      blame,
        "cause_of_failure": _cause_of_failure(report, blame),
    })


@app.get("/canary")
async def get_canary_leaderboard():
    """Companies ranked by historical canary lead time."""
    all_scores, err = _safe_call(scorer.compute_all)
    if all_scores is None:
        return JSONResponse({"canaries": [], "stale": True, "error": err})

    canary_list, err2 = _safe_call(ranker.rank, all_scores)
    if canary_list is None:
        return JSONResponse({"canaries": [], "stale": True, "error": err2})

    top = ranker.get_top_canary(all_scores)
    return JSONResponse({
        "canaries":   canary_list,
        "top_canary": top,
        "updated_at": _now_iso(),
    })


@app.get("/blame-chain/{ticker}")
async def get_blame_chain(ticker: str):
    """Patient zero identification and full supplier propagation path."""
    all_scores, _ = _safe_call(scorer.compute_all)
    result, err   = _safe_call(blamer.analyse, ticker.upper(), all_scores)
    if result is None:
        return JSONResponse({"stale": True, "error": err}, status_code=503)
    return JSONResponse(result)


@app.get("/live")
async def get_live_updates():
    """
    Delta-only endpoint. Returns companies whose composite score changed
    by >= 0.3 since the last poll. Updates the live snapshot on every call.
    Polled by the React dashboard every 60 seconds.
    """
    current_scores, _ = _safe_call(scorer.compute_all)
    current_scores = current_scores or []
    current_map: Dict[str, float] = {
        c["ticker"]: c.get("score", 0) for c in current_scores
    }

    # Load previous snapshot
    prev_map: Dict[str, float] = {}
    if os.path.exists(LIVE_SNAPSHOT_PATH):
        try:
            with open(LIVE_SNAPSHOT_PATH, "r", encoding="utf-8") as fh:
                snap = json.load(fh)
            prev_map = snap.get("scores", {})
        except (json.JSONDecodeError, IOError):
            pass

    # Compute deltas
    changes = []
    for ticker, curr in current_map.items():
        prev  = prev_map.get(ticker, curr)
        delta = round(curr - prev, 3)
        if abs(delta) >= 0.3:
            changes.append({"ticker": ticker, "score": curr, "delta": delta})

    # Persist new snapshot
    try:
        os.makedirs(os.path.dirname(LIVE_SNAPSHOT_PATH), exist_ok=True)
        with open(LIVE_SNAPSHOT_PATH, "w", encoding="utf-8") as fh:
            json.dump(
                {"scores": current_map, "snapshot_at": _now_iso()},
                fh, indent=2,
            )
    except IOError:
        pass

    payload: Dict[str, Any] = {"updated_at": _now_iso(), "changes": changes}
    if not changes:
        payload["message"] = "No significant changes since last poll"
    return JSONResponse(payload)


# ─── Reality check: what actually happened, and did we call it ────────────────

_STORE_DIR = os.path.join(_HERE, "..", "store")


def _load_store_file(filename: str) -> Dict[str, Any]:
    path = os.path.join(_STORE_DIR, filename)
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError) as exc:
        logger.warning("could not read %s: %s", filename, exc)
        return {}


@app.get("/audit")
async def get_prediction_audit():
    """Prospective forecast ledger and non-overlapping matured outcome counts."""
    return JSONResponse(audit_summary(_load_store_file(LEDGER_PATH.name)))


@app.get("/audit/{ticker}")
async def get_company_prediction_audit(ticker: str):
    return JSONResponse(audit_summary(_load_store_file(LEDGER_PATH.name), ticker))


@app.get("/news/{ticker}")
async def get_news(ticker: str):
    """Recent supply-chain news for one company — the 'what actually happened'."""
    store = _load_store_file("news.json")
    company = store.get("companies", {}).get(ticker.upper())
    if company is None:
        raise HTTPException(status_code=404, detail=f"No news for {ticker}")
    return JSONResponse({
        "ticker": ticker.upper(),
        "generated_at": store.get("generated_at"),
        "source": store.get("source"),
        **company,
    })


@app.get("/events/{ticker}")
async def get_events(ticker: str):
    """
    Real FDA recall history for one company. Every entry carries an FDA
    recall_number, so each one can be independently verified.
    """
    store = _load_store_file("fda_events.json")
    company = store.get("companies", {}).get(ticker.upper())
    if company is None:
        raise HTTPException(status_code=404, detail=f"No event history for {ticker}")
    events = company.get("events", [])
    return JSONResponse({
        "ticker": ticker.upper(),
        "source": store.get("source"),
        "event_count": len(events),
        "events": list(reversed(events))[:50],
    })


@app.get("/evaluation")
async def get_evaluation():
    """
    Measured predictive performance against real FDA recalls.

    This is deliberately blunt: it reports AUC against real events, including
    when that AUC says the signal is no better than chance. It replaces the old
    "backtest", which scored the model against events invented by
    random.Random(42).
    """
    results = _load_store_file("evaluation.json")
    if not results:
        return JSONResponse({
            "available": False,
            "message": "No evaluation has been run yet.",
        })
    return JSONResponse({"available": True, **results})


# ─── Server entry ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api.server:app", host="0.0.0.0", port=8000, reload=True)
