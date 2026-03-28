"""
scoring/blame_chain.py
BlameChainAnalyser — traces supplier-level contagion propagation across CPG companies.
Must complete in under 2 seconds (no external calls).
"""

import json
import os
import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

_HERE = os.path.dirname(os.path.abspath(__file__))
BLAME_CHAIN_PATH = os.path.join(_HERE, "..", "store", "blame_chain_static.json")

# ─── Synthetic Supplier Graph ─────────────────────────────────────────────────
_SYNTHETIC_GRAPH = {
    "UL":   ["supplier_vietnam_01", "supplier_palm_01", "supplier_plastic_01"],
    "PG":   ["supplier_vietnam_01", "supplier_packaging_01", "supplier_plastic_01"],
    "KO":   ["supplier_sweetener_01", "supplier_aluminium_01"],
    "PEP":  ["supplier_sweetener_01", "supplier_corn_01", "supplier_aluminium_01"],
    "HSY":  ["supplier_cacao_01", "supplier_cacao_02", "supplier_palm_01"],
    "GIS":  ["supplier_cacao_02", "supplier_wheat_01", "supplier_corn_01"],
    "K":    ["supplier_wheat_01", "supplier_packaging_01", "supplier_corn_01"],
    "MDLZ": ["supplier_cacao_01", "supplier_palm_01", "supplier_wheat_01"],
    "CPB":  ["supplier_packaging_01", "supplier_tomato_01"],
    "SJM":  ["supplier_glass_01", "supplier_corn_01"],
    "CAG":  ["supplier_potato_01", "supplier_packaging_01"],
    "HRL":  ["supplier_pork_01", "supplier_plastic_01"],
    "TSN":  ["supplier_pork_01", "supplier_beef_01"],
    "CLX":  ["supplier_plastic_01", "supplier_chemical_01"],
    "CL":   ["supplier_chemical_01", "supplier_palm_01"],
    "CHD":  ["supplier_chemical_01", "supplier_packaging_01"],
    "KHC":  ["supplier_tomato_01", "supplier_pork_01"],
    "MKC":  ["supplier_spice_01"],
    "LANC": ["supplier_potato_01", "supplier_sweetener_01"],
    "THS":  ["supplier_glass_01", "supplier_tomato_01"],
}


def _load_or_create_graph() -> Dict[str, List[str]]:
    if os.path.exists(BLAME_CHAIN_PATH):
        try:
            with open(BLAME_CHAIN_PATH, "r", encoding="utf-8") as fh:
                return json.load(fh)
        except (json.JSONDecodeError, IOError):
            pass
    try:
        os.makedirs(os.path.dirname(BLAME_CHAIN_PATH), exist_ok=True)
        with open(BLAME_CHAIN_PATH, "w", encoding="utf-8") as fh:
            json.dump(_SYNTHETIC_GRAPH, fh, indent=2)
    except IOError:
        pass
    return _SYNTHETIC_GRAPH


def _lag_for_ticker(ticker: str) -> int:
    """Deterministic lag in days based on ticker hash (15-50 range)."""
    seed = sum(ord(c) for c in ticker)
    return 15 + (seed % 7) * 5


def _shared_suppliers(t1: str, t2: str, graph: Dict[str, List[str]]) -> List[str]:
    s1 = set(graph.get(t1, []))
    s2 = set(graph.get(t2, []))
    return sorted(s1 & s2)


def _find_origin_supplier(patient_zero: str, graph: Dict[str, List[str]]) -> Optional[str]:
    suppliers = graph.get(patient_zero, [])
    return suppliers[0] if suppliers else None


class BlameChainAnalyser:

    def analyse(self, ticker: str, scored_companies: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        """
        Trace the blame chain for a given trigger company.
        scored_companies is injected by the server; if None, imports CompositeScorer inline.
        Runs in <2s — no external calls.
        """
        graph = _load_or_create_graph()
        ticker = ticker.upper()

        # Get all scores (lazy import to avoid circular dependency)
        if scored_companies is None:
            from scoring.composite import CompositeScorer
            scored_companies = CompositeScorer().compute_all()

        score_map: Dict[str, Dict[str, Any]] = {c["ticker"]: c for c in scored_companies}

        # ── 1. Patient Zero ───────────────────────────────────────────────────
        # The company whose score is highest among all currently ELEVATED/CRITICAL companies
        elevated = [
            c for c in scored_companies
            if c.get("score", 0) >= 6.0
        ]
        if elevated:
            patient_zero_data = max(elevated, key=lambda c: c.get("score", 0))
        else:
            patient_zero_data = score_map.get(ticker, {"ticker": ticker, "score": 0.0, "name": ticker})

        pz_ticker = patient_zero_data["ticker"]
        pz_score = patient_zero_data.get("score", 0.0)
        signal_fired_at = patient_zero_data.get("last_updated", datetime.now(timezone.utc).isoformat())

        # ── 2. Propagation Path ───────────────────────────────────────────────
        pz_suppliers = set(graph.get(pz_ticker, []))
        propagation: List[Dict[str, Any]] = []

        for co in scored_companies:
            t = co["ticker"]
            if t == pz_ticker:
                continue
            shared = _shared_suppliers(pz_ticker, t, graph)
            if shared:
                propagation.append({
                    "ticker":           t,
                    "name":             co.get("name", t),
                    "shared_suppliers": shared,
                    "lag_days":         _lag_for_ticker(t),
                    "score":            co.get("score", 0.0),
                    "status":           co.get("status", "STABLE"),
                })

        # Sort by shared supplier count desc, then score desc
        propagation.sort(key=lambda x: (-len(x["shared_suppliers"]), -x["score"]))

        # ── 3. Next Victim ────────────────────────────────────────────────────
        # Highest-scoring company NOT yet CRITICAL that shares a supplier with anyone in propagation path
        path_tickers = {p["ticker"] for p in propagation} | {pz_ticker}
        all_suppliers_in_path: set = pz_suppliers.copy()
        for p in propagation:
            all_suppliers_in_path.update(graph.get(p["ticker"], []))

        next_victim: Optional[Dict[str, Any]] = None
        best_confidence = -1.0
        for co in scored_companies:
            t = co["ticker"]
            if t in path_tickers:
                continue
            if co.get("status") == "CRITICAL":
                continue
            co_suppliers = set(graph.get(t, []))
            shared_count = len(co_suppliers & all_suppliers_in_path)
            if shared_count == 0:
                continue
            total_co_suppliers = max(len(co_suppliers), 1)
            score = co.get("score", 0.0)
            # confidence = (shared / total) * normalised_score
            raw_confidence = (shared_count / total_co_suppliers) * (score / 10.0)
            confidence = round(min(1.0, raw_confidence), 3)
            if confidence > best_confidence:
                best_confidence = confidence
                next_victim = {
                    "ticker":        t,
                    "name":          co.get("name", t),
                    "confidence":    confidence,
                    "lag_days":      _lag_for_ticker(t) + 15,
                    "current_score": score,
                    "alert":         "NOT YET PRICED IN",
                }

        origin_supplier = _find_origin_supplier(pz_ticker, graph)

        return {
            "patient_zero": {
                "ticker":          pz_ticker,
                "name":            patient_zero_data.get("name", pz_ticker),
                "signal_fired_at": signal_fired_at,
                "score":           pz_score,
            },
            "propagation_path": propagation,
            "next_victim":      next_victim,
            "origin_supplier":  origin_supplier,
        }
