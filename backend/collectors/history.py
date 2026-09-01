"""
collectors/history.py
Reconstruct per-company signal history so the predictor can be evaluated
against real events instead of synthetic ones.

The live collectors only ever produce a "value now", which cannot be
backtested. These two signals can be rebuilt exactly for past dates:

  edgar_8k        - every 8-K filing date from SEC submissions
  wikipedia_edits - every revision timestamp on the company's main page

Both are independent of FDA recalls, so using them to predict FDA recalls is
not circular. FRED is deliberately excluded: it is sector-wide, identical for
all 20 companies on any given date, and so carries no company-level
discrimination.

Run: python backend/collectors/history.py
"""
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from time import sleep
from typing import Any, Dict, List

import requests

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from backend.collectors.edgar import SEC_HEADERS, _ticker_to_cik  # noqa: E402
from backend.collectors.wikipedia import WIKI_HEADERS, normalize_title  # noqa: E402

COMPANIES_PATH = ROOT_DIR / "companies.json"
HISTORY_PATH = ROOT_DIR / "backend" / "store" / "signal_history.json"

SEC_SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik}.json"
WIKI_API_URL = "https://en.wikipedia.org/w/api.php"

REQUEST_TIMEOUT_SECONDS = 30
WIKI_REVISION_PAGES = 10          # 10 x 500 revisions is years of history
REVERT_KEYWORDS = ("revert", "undid", "rvv", "rollback", "restored")


def fetch_8k_dates(ticker: str, cik_hint: str = "") -> List[str]:
    """Every 8-K filing date SEC lists for this company, newest-first window."""
    try:
        cik = _ticker_to_cik(ticker, fallback_cik=cik_hint)
    except Exception as exc:
        print(f"  ! {ticker}: no CIK ({exc})", file=sys.stderr)
        return []

    try:
        response = requests.get(
            SEC_SUBMISSIONS_URL.format(cik=cik), headers=SEC_HEADERS,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        recent = response.json().get("filings", {}).get("recent", {})
    except Exception as exc:
        print(f"  ! {ticker}: submissions fetch failed ({exc})", file=sys.stderr)
        return []

    forms = recent.get("form", [])
    dates = recent.get("filingDate", [])
    return sorted(d for f, d in zip(forms, dates) if str(f).startswith("8-K"))


def fetch_revision_history(page_title: str) -> List[Dict[str, Any]]:
    """Revision timestamps + revert flags for one page, walking backwards."""
    revisions: List[Dict[str, Any]] = []
    continue_token = None

    for _ in range(WIKI_REVISION_PAGES):
        params = {
            "action": "query", "format": "json", "prop": "revisions",
            "titles": normalize_title(page_title), "rvlimit": "max",
            "rvprop": "timestamp|comment", "rvdir": "older",
            "redirects": 1,
        }
        if continue_token:
            params["rvcontinue"] = continue_token

        try:
            response = requests.get(
                WIKI_API_URL, params=params, headers=WIKI_HEADERS,
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            if response.status_code == 429:
                sleep(10)
                continue
            response.raise_for_status()
            payload = response.json()
        except Exception as exc:
            print(f"  ! revisions for {page_title}: {exc}", file=sys.stderr)
            break

        for page in payload.get("query", {}).get("pages", {}).values():
            for rev in page.get("revisions", []):
                comment = (rev.get("comment") or "").lower()
                revisions.append({
                    "date": str(rev.get("timestamp", ""))[:10],
                    "revert": any(k in comment for k in REVERT_KEYWORDS),
                })

        continue_token = payload.get("continue", {}).get("rvcontinue")
        if not continue_token:
            break
        sleep(0.3)

    return revisions


def _daily_counts(revisions: List[Dict[str, Any]]) -> Dict[str, Dict[str, int]]:
    counts: Dict[str, Dict[str, int]] = defaultdict(lambda: {"edits": 0, "reverts": 0})
    for rev in revisions:
        if not rev["date"]:
            continue
        counts[rev["date"]]["edits"] += 1
        if rev["revert"]:
            counts[rev["date"]]["reverts"] += 1
    return dict(counts)


def run_history_pipeline() -> Dict[str, Any]:
    companies = json.loads(COMPANIES_PATH.read_text(encoding="utf-8"))["companies"]

    store: Dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "SEC EDGAR submissions + MediaWiki revisions",
        "companies": {},
    }

    for company in companies:
        ticker = company["ticker"]
        filings = fetch_8k_dates(ticker, company.get("cik", ""))
        sleep(0.3)
        revisions = fetch_revision_history(company["wiki_page"])
        daily = _daily_counts(revisions)

        store["companies"][ticker] = {
            "wiki_page": company["wiki_page"],
            "filing_8k_dates": filings,
            "wiki_daily": daily,
        }
        span = (min(daily), max(daily)) if daily else ("-", "-")
        print(
            f"  {ticker:6s} {len(filings):4d} 8-Ks  "
            f"{len(revisions):5d} revisions over {len(daily):4d} days "
            f"({span[0]} -> {span[1]})"
        )
        sleep(0.5)

    HISTORY_PATH.write_text(json.dumps(store, indent=2), encoding="utf-8")
    print(f"\nWrote signal history to {HISTORY_PATH}")
    return store


if __name__ == "__main__":
    run_history_pipeline()
