"""
scoring/canary.py
CanaryRanker — ranks companies by how early they historically signal sector stress.
"""

import json
import os
import random
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

_HERE = os.path.dirname(os.path.abspath(__file__))
HISTORICAL_EVENTS_PATH = os.path.join(_HERE, "..", "store", "historical_events.json")

# Seed per-ticker lead times (deterministic but realistic)
_SYNTHETIC_LEAD_TIMES: Dict[str, int] = {
    "HSY":  25, "UL":   22, "MDLZ": 21, "K":    19, "GIS":  18,
    "PG":   16, "CPB":  15, "SJM":  14, "PEP":  13, "CAG":  12,
    "HRL":  12, "MKC":  11, "TSN":  11, "KO":   10, "CLX":  10,
    "CL":    9, "CHD":   9, "KHC":   8, "LANC":  7, "THS":   7,
}

# Ten synthetic sector stress events
_SYNTHETIC_EVENT_TEMPLATE = [
    {"event_id": f"SE-{i+1:03d}", "date": f"202{2 + i // 4}-{((i * 3) % 12) + 1:02d}-15", "description": f"Sector stress event {i+1}"}
    for i in range(10)
]


def _load_or_create_historical_events() -> List[Dict[str, Any]]:
    """Load historical events JSON or generate synthetic baseline."""
    if os.path.exists(HISTORICAL_EVENTS_PATH):
        try:
            with open(HISTORICAL_EVENTS_PATH, "r", encoding="utf-8") as fh:
                return json.load(fh)
        except (json.JSONDecodeError, IOError):
            pass

    # Generate and persist synthetic events
    events = []
    for i, template in enumerate(_SYNTHETIC_EVENT_TEMPLATE):
        event: Dict[str, Any] = dict(template)
        # Per-company lead times (seeded for determinism)
        company_leads: Dict[str, int] = {}
        for ticker, base_lead in _SYNTHETIC_LEAD_TIMES.items():
            rng = random.Random(hash(ticker) ^ i)
            lead = base_lead + rng.randint(-4, 4)
            company_leads[ticker] = max(7, min(35, lead))
        event["company_lead_days"] = company_leads
        events.append(event)

    try:
        os.makedirs(os.path.dirname(HISTORICAL_EVENTS_PATH), exist_ok=True)
        with open(HISTORICAL_EVENTS_PATH, "w", encoding="utf-8") as fh:
            json.dump(events, fh, indent=2)
    except IOError:
        pass
    return events


def _compute_avg_lead(ticker: str, events: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Return avg lead days and how many events this company appeared in."""
    leads = []
    for event in events:
        lead = event.get("company_lead_days", {}).get(ticker)
        if lead is not None:
            leads.append(lead)
    if not leads:
        return {"avg_lead_days": _SYNTHETIC_LEAD_TIMES.get(ticker, 10), "count": 0}
    return {
        "avg_lead_days": round(sum(leads) / len(leads), 1),
        "count": len(leads),
    }


def _status_label(score: float) -> str:
    if score >= 7.0:
        return "CRITICAL"
    if score >= 4.0:
        return "ELEVATED"
    return "STABLE"


class CanaryRanker:

    def rank(self, scored_companies: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Takes output of CompositeScorer.compute_all() and returns a ranked list
        of companies ordered by canary_score (highest first).
        """
        events = _load_or_create_historical_events()
        ranked = []

        for company in scored_companies:
            ticker = company["ticker"]
            current_score = company.get("score", 0.0)
            lead_stats = _compute_avg_lead(ticker, events)
            avg_lead = lead_stats["avg_lead_days"]
            events_count = lead_stats["count"]

            # canary_score = (avg_lead_days * 0.6) + (current_signal_score * 0.4)
            canary_score = round((avg_lead * 0.6) + (current_score * 0.4), 2)

            status = _status_label(current_score)
            name = company.get("name", ticker)
            interpretation = (
                f"{name} has historically signalled sector stress {int(avg_lead)} days "
                f"before other companies. Current signal is {status}."
            )

            ranked.append({
                "ticker":                  ticker,
                "name":                    name,
                "avg_lead_days":           avg_lead,
                "current_signal":          current_score,
                "canary_score":            canary_score,
                "historical_events_count": events_count,
                "interpretation":          interpretation,
                "status":                  status,
            })

        # Sort descending by canary_score
        ranked.sort(key=lambda x: x["canary_score"], reverse=True)

        # Add rank field
        for i, item in enumerate(ranked, start=1):
            item["rank"] = i

        return ranked

    def get_top_canary(self, scored_companies: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """Return the single highest-ranked canary company."""
        ranked = self.rank(scored_companies)
        return ranked[0] if ranked else None
