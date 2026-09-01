"""
collectors/fda_events.py
Ground truth for the backtester: real, dated, citable FDA recall events.

This replaces the fabricated contents of store/historical_events.json, whose
entries were literally named "Sector stress event 1..10" with no company, no
source and no citation. Every event written here carries an FDA recall_number
you can look up, an FDA severity classification, and the agency's own stated
reason.

Covers both openFDA enforcement endpoints, because these companies span food
and consumer/personal-care:
  /food/enforcement.json    - food recalls
  /drug/enforcement.json    - OTC drug / personal care recalls
  /device/enforcement.json  - device recalls (rare here, cheap to include)

Run: python backend/collectors/fda_events.py
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from time import sleep
from typing import Any, Dict, List

import requests

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

COMPANIES_PATH = ROOT_DIR / "companies.json"
EVENTS_PATH = ROOT_DIR / "backend" / "store" / "fda_events.json"

ENDPOINTS = [
    ("food", "https://api.fda.gov/food/enforcement.json"),
    ("drug", "https://api.fda.gov/drug/enforcement.json"),
    ("device", "https://api.fda.gov/device/enforcement.json"),
]

# openFDA allows 240 requests/min unauthenticated; we make ~60 total.
REQUEST_TIMEOUT_SECONDS = 30
PAGE_LIMIT = 100
MAX_PAGES = 10

HEADERS = {
    "User-Agent": (
        "PreMortemMachine/0.1 "
        "(https://github.com/koopatroopa787/premortem-x-quantihack)"
    ),
    "Accept": "application/json",
}

# FDA's own severity ladder. Class I is "reasonable probability of serious
# adverse health consequences or death" — these are the events worth predicting.
SEVERITY_RANK = {"Class I": 3, "Class II": 2, "Class III": 1}


def _fetch_page(url: str, firm: str, skip: int) -> Dict[str, Any]:
    params = {
        "search": f'recalling_firm:"{firm}"',
        "limit": PAGE_LIMIT,
        "skip": skip,
    }
    for attempt in range(3):
        try:
            response = requests.get(
                url, params=params, headers=HEADERS, timeout=REQUEST_TIMEOUT_SECONDS
            )
            if response.status_code == 404:
                # openFDA returns 404 for "no matches", which is not an error.
                return {"results": []}
            response.raise_for_status()
            return response.json()
        except requests.RequestException as exc:
            if attempt == 2:
                print(f"  ! {url} {firm} failed: {exc}", file=sys.stderr)
                return {"results": []}
            sleep(1.0 * (attempt + 1))
    return {"results": []}


def _parse_date(raw: str):
    """openFDA dates are YYYYMMDD strings."""
    try:
        return datetime.strptime(str(raw), "%Y%m%d").date()
    except (ValueError, TypeError):
        return None


def fetch_company_events(firm: str) -> List[Dict[str, Any]]:
    """Every recall openFDA has for this firm, across all three endpoints."""
    events: List[Dict[str, Any]] = []
    seen_recall_numbers = set()

    for domain, url in ENDPOINTS:
        skip = 0
        for _ in range(MAX_PAGES):
            payload = _fetch_page(url, firm, skip)
            results = payload.get("results", [])
            if not results:
                break

            for row in results:
                recall_number = row.get("recall_number")
                if not recall_number or recall_number in seen_recall_numbers:
                    continue
                event_date = _parse_date(row.get("report_date"))
                if event_date is None:
                    continue
                seen_recall_numbers.add(recall_number)
                events.append({
                    "date": event_date.isoformat(),
                    "recall_number": recall_number,
                    "domain": domain,
                    "classification": row.get("classification"),
                    "severity": SEVERITY_RANK.get(row.get("classification"), 0),
                    "reason": (row.get("reason_for_recall") or "").strip()[:300],
                    "product": (row.get("product_description") or "").strip()[:200],
                    "status": row.get("status"),
                    "source": (
                        "openFDA "
                        f"{domain}/enforcement.json recall_number={recall_number}"
                    ),
                })

            if len(results) < PAGE_LIMIT:
                break
            skip += PAGE_LIMIT
            sleep(0.3)

    events.sort(key=lambda e: e["date"])
    return events


def run_fda_events_pipeline() -> Dict[str, Any]:
    companies = json.loads(COMPANIES_PATH.read_text(encoding="utf-8"))["companies"]

    store: Dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "openFDA enforcement API (food, drug, device)",
        "companies": {},
    }

    for company in companies:
        ticker = company["ticker"]
        firm = company.get("fda_search") or company["name"]
        events = fetch_company_events(firm)
        store["companies"][ticker] = {
            "firm_query": firm,
            "event_count": len(events),
            "events": events,
        }
        classes = {}
        for e in events:
            classes[e["classification"]] = classes.get(e["classification"], 0) + 1
        print(f"  {ticker:6s} {len(events):4d} events  {classes}")
        sleep(0.3)

    EVENTS_PATH.write_text(json.dumps(store, indent=2), encoding="utf-8")
    total = sum(c["event_count"] for c in store["companies"].values())
    print(f"\nWrote {total} real recall events to {EVENTS_PATH}")
    return store


if __name__ == "__main__":
    run_fda_events_pipeline()
