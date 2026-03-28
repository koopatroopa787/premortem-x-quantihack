import sys
from pathlib import Path
ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

import math
import os
import re
import json
from datetime import datetime, timezone
from time import sleep
from typing import Dict, List

import requests

# Path fix
COMPANIES_PATH = ROOT_DIR / "companies.json"
DATA_STORE_PATH = ROOT_DIR / "backend" / "store" / "data_store.json"

SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
SEC_SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik}.json"
SEC_ARCHIVE_URL = "https://www.sec.gov/Archives/edgar/data/{cik}/{accession}/{document}"
REQUEST_TIMEOUT_SECONDS = 25
MAX_8K_LOOKBACK = 12

# SEC requires a descriptive user-agent with contact info.
SEC_USER_AGENT = os.getenv(
    "SEC_USER_AGENT",
    "PreMortemMachine/0.1 (research contact: research@example.com)",
)

SEC_HEADERS = {
    "User-Agent": SEC_USER_AGENT,
    "Accept-Encoding": "gzip, deflate",
    "Accept": "application/json,text/plain,*/*",
}

KEYWORD_WEIGHTS = {
    "force majeure": 3.0,
    "supply chain disruption": 2.8,
    "material disruption": 2.5,
    "production interruption": 2.2,
    "inventory shortage": 2.0,
    "supplier delay": 1.8,
    "vendor delay": 1.8,
    "raw material": 1.5,
    "capacity constraint": 1.6,
    "transportation": 1.2,
    "distribution": 1.2,
    "freight": 1.2,
    "lead time": 1.4,
    "bottleneck": 1.6,
    "backlog": 1.4,
    "fulfillment": 1.1,
    "procurement": 1.1,
    "logistics": 1.1,
    "supply chain": 1.0,
    "supply": 0.7,
    "inventory": 0.7,
    "shortage": 1.3,
    "disruption": 1.1,
    "delay": 0.8,
}

BROAD_TERM_WEIGHTS = {
    r"\bdisrupt(?:ion|ed|ive)?\b": 0.9,
    r"\bdelay(?:ed|s|ing)?\b": 0.7,
    r"\bshort(?:age|ages)\b": 1.0,
    r"\blogistic(?:s)?\b": 0.8,
    r"\bsupplier(?:s)?\b": 0.6,
    r"\binventor(?:y|ies)\b": 0.6,
    r"\bbacklog(?:s)?\b": 0.8,
    r"\bbottleneck(?:s)?\b": 0.9,
    r"\bprocure(?:ment|ments)?\b": 0.7,
    r"\bfreight\b": 0.8,
    r"\bdistribution\b": 0.8,
    r"\bfulfillment\b": 0.7,
    r"\blead\s+time(?:s)?\b": 0.9,
}


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def _request_json(url: str) -> Dict:
    last_error = None
    for attempt in range(3):
        try:
            response = requests.get(url, headers=SEC_HEADERS, timeout=REQUEST_TIMEOUT_SECONDS)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as exc:
            last_error = exc
            if attempt < 2:
                sleep(0.7)
    raise last_error if last_error else RuntimeError("SEC JSON request failed")


def _request_text(url: str) -> str:
    last_error = None
    for attempt in range(3):
        try:
            response = requests.get(url, headers=SEC_HEADERS, timeout=REQUEST_TIMEOUT_SECONDS)
            response.raise_for_status()
            return response.text
        except requests.RequestException as exc:
            last_error = exc
            if attempt < 2:
                sleep(0.7)
    raise last_error if last_error else RuntimeError("SEC text request failed")


def _ticker_to_cik(ticker: str) -> str:
    payload = _request_json(SEC_TICKERS_URL)
    normalized = ticker.upper().strip()

    for row in payload.values():
        if str(row.get("ticker", "")).upper() == normalized:
            return str(row.get("cik_str", "")).zfill(10)

    raise ValueError(f"Ticker not found in SEC directory: {ticker}")


def _collect_recent_8k_filings(cik: str, max_filings: int = MAX_8K_LOOKBACK) -> List[Dict]:
    payload = _request_json(SEC_SUBMISSIONS_URL.format(cik=cik))
    recent = payload.get("filings", {}).get("recent", {})

    forms = recent.get("form", [])
    accession_numbers = recent.get("accessionNumber", [])
    primary_docs = recent.get("primaryDocument", [])
    filing_dates = recent.get("filingDate", [])

    filings = []
    for form, accession, primary_doc, filing_date in zip(forms, accession_numbers, primary_docs, filing_dates):
        if not str(form).startswith("8-K"):
            continue

        filings.append(
            {
                "form": form,
                "accession": str(accession),
                "primary_document": str(primary_doc),
                "filing_date": str(filing_date),
            }
        )

        if len(filings) >= max_filings:
            break

    return filings


def analyze_sec_8k(document_text: str) -> float:
    """
    Score one filing body for disruption language and normalize to [0,1].
    """
    lowered = document_text.lower()
    weighted_hits = 0.0

    for phrase, weight in KEYWORD_WEIGHTS.items():
        occurrences = len(re.findall(re.escape(phrase), lowered))
        weighted_hits += min(occurrences, 3) * weight

    for pattern, weight in BROAD_TERM_WEIGHTS.items():
        occurrences = len(re.findall(pattern, lowered))
        weighted_hits += min(occurrences, 6) * weight

    # Saturating curve keeps large filings from dominating beyond meaningful signal.
    return _clamp01(1.0 - math.exp(-weighted_hits / 14.0))


def _filing_activity_component(filings: List[Dict], now: datetime) -> float:
    """
    Reward unusually active 8-K filing cadence with recency emphasis.
    """
    if not filings:
        return 0.0

    recent_30d = 0
    recent_90d = 0

    for filing in filings:
        filing_dt = datetime.fromisoformat(filing["filing_date"]).replace(tzinfo=timezone.utc)
        age_days = max(0, (now - filing_dt).days)
        if age_days <= 30:
            recent_30d += 1
        if age_days <= 90:
            recent_90d += 1

    burst_component = _clamp01(recent_30d / 3.0)
    sustained_component = _clamp01(recent_90d / 8.0)
    return _clamp01((0.6 * burst_component) + (0.4 * sustained_component))


def fetch_edgar_8k_score(ticker: str, max_filings: int = MAX_8K_LOOKBACK) -> float:
    """
    Fetch recent SEC 8-K filings for ticker and return normalized EDGAR risk score in [0,1].
    This output is directly compatible with composite scoring weights.
    """
    try:
        cik_padded = _ticker_to_cik(ticker)
        filings = _collect_recent_8k_filings(cik_padded, max_filings=max_filings)
        if not filings:
            return 0.0

        cik_no_leading_zeros = str(int(cik_padded))
        now = datetime.now(timezone.utc)

        weighted_score_sum = 0.0
        recency_weight_sum = 0.0
        nonzero_filing_scores = 0

        for filing in filings:
            accession_no_dashes = filing["accession"].replace("-", "")
            filing_url = SEC_ARCHIVE_URL.format(
                cik=cik_no_leading_zeros,
                accession=accession_no_dashes,
                document=filing["primary_document"],
            )

            filing_text = _request_text(filing_url)
            filing_score = analyze_sec_8k(filing_text)

            filing_dt = datetime.fromisoformat(filing["filing_date"]).replace(tzinfo=timezone.utc)
            age_days = max(0, (now - filing_dt).days)
            recency_weight = math.exp(-age_days / 120.0)

            weighted_score_sum += filing_score * recency_weight
            recency_weight_sum += recency_weight

            if filing_score > 0.15:
                nonzero_filing_scores += 1

            sleep(0.15)

        if recency_weight_sum <= 0:
            return 0.0

        severity_component = weighted_score_sum / recency_weight_sum
        phrase_coverage_component = nonzero_filing_scores / float(len(filings))
        activity_component = _filing_activity_component(filings, now)
        final_score = _clamp01(
            (0.60 * severity_component)
            + (0.20 * phrase_coverage_component)
            + (0.20 * activity_component)
        )

        return round(final_score, 4)
    except Exception as exc:
        print(f"Error fetching EDGAR data for {ticker}: {exc}")
        return 0.0


def fetch_edgar_signal(ticker: str, max_filings: int = MAX_8K_LOOKBACK) -> float:
    """
    Compatibility alias for pipelines expecting a generic EDGAR signal function.
    """
    return fetch_edgar_8k_score(ticker=ticker, max_filings=max_filings)


def run_company_edgar_pipeline():
    if not COMPANIES_PATH.exists():
        return {}
    with open(COMPANIES_PATH, "r") as f:
        companies = json.load(f).get("companies", [])
    
    if DATA_STORE_PATH.exists():
        with open(DATA_STORE_PATH, "r") as f:
            store = json.load(f)
    else:
        store = {}

    updated_at = datetime.now(timezone.utc).isoformat()
    for company in companies:
        ticker = company["ticker"]
        signal = fetch_edgar_8k_score(ticker)
        
        company_record = store.get(ticker, {})
        signals = company_record.get("signals", {})
        signals["edgar_8k_keywords"] = signal
        company_record["signals"] = signals
        company_record["updated_at"] = updated_at
        store[ticker] = company_record

    with open(DATA_STORE_PATH, "w") as f:
        json.dump(store, f, indent=2)
    return store

if __name__ == "__main__":
    run_company_edgar_pipeline()
