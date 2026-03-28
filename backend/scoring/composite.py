"""
scoring/composite.py
CompositeScorer — The core forensic fragility scoring engine.
Reads data_store.json with a 60-second in-memory cache.
"""

import json
import os
import time
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

# ─── Constants ────────────────────────────────────────────────────────────────
WEIGHTS: Dict[str, float] = {
    "fda_recall_velocity": 0.35,
    "wikipedia_edit_wars": 0.25,
    "fred_macro_backdrop": 0.20,
    "adzuna_job_velocity": 0.12,
    "edgar_8k_keywords":    0.08,
}

# ─── Status Labels ────────────────────────────────────────────────────────────
STATUS_LABELS = [
    (7.0, "CRITICAL"),
    (4.0, "ELEVATED"),
    (0.0, "STABLE"),
]

# Paths resolved from this file's location (works from any cwd)
_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.abspath(os.path.join(_HERE, "..", ".."))

DATA_STORE_PATH = os.path.join(_HERE, "..", "store", "data_store.json")
COMPANIES_PATH  = os.path.join(_ROOT, "companies.json")

# ─── Cache ────────────────────────────────────────────────────────────────────
_cache: Dict[str, Any] = {
    "data":       {},
    "companies":  [],
    "loaded_at":  0.0,
    "co_loaded":  0.0,
}
CACHE_TTL = 5  # seconds (reduced from 60 for presentation responsiveness)


def _normalise_raw(value: float) -> float:
    """Clamp a raw signal value to [0.0, 1.0]."""
    return max(0.0, min(1.0, float(value)))


def _load_data_store() -> Dict[str, Any]:
    """Return data_store contents, respecting 60s cache."""
    now = time.time()
    if now - _cache["loaded_at"] < CACHE_TTL and _cache["data"]:
        return _cache["data"]
    try:
        with open(DATA_STORE_PATH, "r", encoding="utf-8") as fh:
            raw = json.load(fh)
        _cache["data"] = raw
        _cache["loaded_at"] = now
        return raw
    except FileNotFoundError:
        return _cache["data"]  # return last known value
    except json.JSONDecodeError:
        return _cache["data"]


def _load_companies() -> List[Dict[str, Any]]:
    now = time.time()
    if now - _cache["co_loaded"] < CACHE_TTL and _cache["companies"]:
        return _cache["companies"]
    try:
        with open(COMPANIES_PATH, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        companies = data.get("companies", [])
        _cache["companies"] = companies
        _cache["co_loaded"] = now
        return companies
    except (FileNotFoundError, json.JSONDecodeError):
        return _cache["companies"]


def _get_status(score: float) -> str:
    for threshold, label in STATUS_LABELS:
        if score >= threshold:
            return label
    return "STABLE"


def _normalise_signals(raw_signals: Dict[str, Any]) -> Dict[str, float]:
    """
    Returns a clean dict {canonical_key: float 0-1}.
    Strictly follows the 6-signal lowercase contract.
    """
    out: Dict[str, float] = {}
    for k, v in raw_signals.items():
        key = k.lower()
        if key in WEIGHTS:
            try:
                out[key] = _normalise_raw(float(v))
            except (ValueError, TypeError):
                out[key] = 0.0
    return out


# ─── Main class ───────────────────────────────────────────────────────────────
class CompositeScorer:

    def _score_company(self, ticker: str, company_data: Dict[str, Any]) -> Dict[str, Any]:
        """Compute a full forensic report for one company data blob."""
        raw_signals = company_data.get("signals", {})
        normed = _normalise_signals(raw_signals)

        signals_output: Dict[str, Any] = {}
        degraded: List[str] = []
        total_score = 0.0

        for signal, weight in WEIGHTS.items():
            available = signal in normed
            if not available:
                degraded.append(signal)
            raw_val = normed.get(signal, 0.0)
            weighted = round(raw_val * weight, 4)
            total_score += weighted
            signals_output[signal] = {
                "raw":       round(raw_val, 4),
                "weighted":  weighted,
                "available": available,
            }

        # Scale to 0-10
        score = round(min(total_score * 10, 10.0), 2)
        status = _get_status(score)
        last_updated = company_data.get("last_updated") or datetime.now(timezone.utc).isoformat()

        return {
            "ticker":           ticker,
            "signals":          signals_output,
            "score":            score,
            "status":           status,
            "degraded_signals": degraded,
            "last_updated":     last_updated,
        }

    def compute_one(self, ticker: str) -> Optional[Dict[str, Any]]:
        """Return composite score for a single company ticker."""
        data = _load_data_store()
        companies = _load_companies()

        # Look up company name
        name_map = {c["ticker"]: c["name"] for c in companies}
        ticker = ticker.upper()

        if ticker not in data:
            # Return empty scaffold — never crash
            return {
                "ticker":           ticker,
                "name":             name_map.get(ticker, ticker),
                "score":            0.0,
                "status":           "STABLE",
                "signals":          {},
                "degraded_signals": list(WEIGHTS.keys()),
                "last_updated":     datetime.now(timezone.utc).isoformat(),
                "error":            "No data available for ticker",
                "stale":            True,
            }

        result = self._score_company(ticker, data[ticker])
        result["name"] = name_map.get(ticker, ticker)
        return result

    def compute_all(self) -> List[Dict[str, Any]]:
        """Return composite scores for every company in companies.json."""
        companies = _load_companies()
        data = _load_data_store()
        name_map = {c["ticker"]: c["name"] for c in companies}
        results = []
        for company in companies:
            ticker = company["ticker"]
            company_data = data.get(ticker, {})
            result = self._score_company(ticker, company_data)
            result["name"] = name_map.get(ticker, ticker)
            if not company_data:
                result["stale"] = True
                result["error"] = "No signal data available"
            results.append(result)
        return results
