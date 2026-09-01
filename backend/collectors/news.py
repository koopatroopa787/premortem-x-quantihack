"""
collectors/news.py
Per-company news watch — "what actually happened", so a score can be checked
against reality instead of taken on faith.

Primary source is Google News RSS: free, no key, no signup. GDELT is wired in
behind it because GDELT is the one free source with real historical depth
(back to 2017), which is what would let news volume become a backtestable
signal rather than just a live feed. GDELT was unreachable when this was
written, so gdelt_timeline() returns None on failure and nothing depends on it.

Run: python backend/collectors/news.py
"""
import json
import re
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from time import sleep
from typing import Any, Dict, List, Optional
from urllib.parse import quote_plus

import requests

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

COMPANIES_PATH = ROOT_DIR / "companies.json"
NEWS_PATH = ROOT_DIR / "backend" / "store" / "news.json"

GOOGLE_NEWS_RSS = "https://news.google.com/rss/search"
GDELT_DOC_API = "https://api.gdeltproject.org/api/v2/doc/doc"

REQUEST_TIMEOUT_SECONDS = 25
MAX_ARTICLES_PER_COMPANY = 12

HEADERS = {
    "User-Agent": (
        "PreMortemMachine/0.1 "
        "(https://github.com/koopatroopa787/premortem-x-quantihack)"
    ),
}

# The terms the dashboard actually cares about. Kept narrow on purpose: a bare
# company-name query returns marketing and stock-tip noise, which is worse than
# no feed at all when the point is to verify a supply-chain call.
DISRUPTION_TERMS = (
    "recall OR shortage OR \"supply chain\" OR contamination OR "
    "plant OR strike OR disruption OR lawsuit"
)

# Headline words that mark an article as corroborating a fragility signal.
RELEVANCE_PATTERNS = {
    "recall": 3.0,
    "contamina": 3.0,
    "salmonella": 3.0,
    "listeria": 3.0,
    "e. coli": 3.0,
    "shortage": 2.5,
    "supply chain": 2.0,
    "disruption": 2.0,
    "strike": 2.0,
    "shut": 1.8,
    "closure": 1.8,
    "layoff": 1.5,
    "lawsuit": 1.2,
    "warning letter": 2.5,
}


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip()


def headline_relevance(title: str) -> float:
    """0..1 — how much a headline looks like supply-chain trouble."""
    lowered = (title or "").lower()
    hits = sum(w for term, w in RELEVANCE_PATTERNS.items() if term in lowered)
    return min(1.0, hits / 5.0)


def fetch_google_news(company_name: str) -> List[Dict[str, Any]]:
    query = f'"{company_name}" ({DISRUPTION_TERMS})'
    url = f"{GOOGLE_NEWS_RSS}?q={quote_plus(query)}&hl=en-US&gl=US&ceid=US:en"

    try:
        response = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
        root = ET.fromstring(response.content)
    except (requests.RequestException, ET.ParseError) as exc:
        print(f"  ! news fetch failed for {company_name}: {exc}", file=sys.stderr)
        return []

    articles: List[Dict[str, Any]] = []
    for item in root.iterfind(".//item"):
        title = _clean(item.findtext("title", ""))
        if not title:
            continue
        published = item.findtext("pubDate", "")
        try:
            published_iso = parsedate_to_datetime(published).astimezone(
                timezone.utc
            ).isoformat()
        except (TypeError, ValueError):
            published_iso = None

        source_el = item.find("source")
        articles.append({
            "title": title,
            "url": _clean(item.findtext("link", "")),
            "published": published_iso,
            "source": _clean(source_el.text) if source_el is not None else None,
            "relevance": round(headline_relevance(title), 3),
        })
        if len(articles) >= MAX_ARTICLES_PER_COMPANY:
            break

    articles.sort(key=lambda a: (a["published"] or ""), reverse=True)
    return articles


def gdelt_timeline(company_name: str, start: str, end: str) -> Optional[List[Dict]]:
    """
    Daily article volume from GDELT, for historical backtesting.

    Returns None when GDELT is unreachable — it was down at the time of writing,
    so every caller must treat absence as normal rather than as an error.
    """
    params = {
        "query": f'"{company_name}" ({DISRUPTION_TERMS})',
        "mode": "TimelineVolInfo",
        "format": "json",
        "startdatetime": start,
        "enddatetime": end,
    }
    try:
        response = requests.get(
            GDELT_DOC_API, params=params, headers=HEADERS,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        timeline = response.json().get("timeline", [])
        return timeline[0].get("data", []) if timeline else []
    except Exception:
        return None


def run_company_news_pipeline() -> Dict[str, Any]:
    companies = json.loads(COMPANIES_PATH.read_text(encoding="utf-8"))["companies"]

    store: Dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "Google News RSS",
        "companies": {},
    }

    for company in companies:
        ticker = company["ticker"]
        articles = fetch_google_news(company["name"])
        flagged = [a for a in articles if a["relevance"] >= 0.4]
        store["companies"][ticker] = {
            "article_count": len(articles),
            "flagged_count": len(flagged),
            "articles": articles,
        }
        print(f"  {ticker:6s} {len(articles):3d} articles, {len(flagged)} flagged")
        sleep(1.0)

    NEWS_PATH.write_text(json.dumps(store, indent=2), encoding="utf-8")
    print(f"\nWrote news for {len(store['companies'])} companies to {NEWS_PATH}")
    return store


if __name__ == "__main__":
    run_company_news_pipeline()
