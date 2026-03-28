import sys
import json
import math
import requests
from datetime import datetime, timedelta, timezone
from pathlib import Path
from time import sleep
from typing import Dict, List, Optional, Tuple

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

OPEN_FDA_URL = "https://api.fda.gov/food/enforcement.json"
REQUEST_TIMEOUT_SECONDS = 20
LOOKBACK_DAYS = 500
RECENT_WINDOW_DAYS = 90

COMPANIES_PATH = ROOT_DIR / "companies.json"
DATA_STORE_PATH = ROOT_DIR / "backend" / "store" / "data_store.json"


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def _load_json(path: Path) -> Dict:
    if path.exists():
        with open(path, "r", encoding="utf-8-sig") as f:
            return json.load(f)
    return {}


def _save_json(path: Path, payload: Dict) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


def _parse_fda_date(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        if len(value) >= 8 and value[:8].isdigit():
            return datetime.strptime(value[:8], "%Y%m%d").replace(tzinfo=timezone.utc)
    except ValueError:
        return None
    return None


def _request_openfda(search_query: str, limit: int = 100) -> Tuple[List[Dict], Optional[int], Optional[str]]:
    params = {
        "search": search_query,
        "limit": min(max(limit, 1), 100),
        "sort": "report_date:desc",
    }
    last_error = None
    for attempt in range(3):
        try:
            response = requests.get(OPEN_FDA_URL, params=params, timeout=REQUEST_TIMEOUT_SECONDS)
            if response.status_code == 404:
                return [], 0, None
            response.raise_for_status()
            payload = response.json()
            return (
                payload.get("results", []),
                payload.get("meta", {}).get("results", {}).get("total"),
                None,
            )
        except requests.RequestException as exc:
            last_error = str(exc)
            if attempt < 2:
                sleep(0.5)
    return [], None, last_error


def fetch_fda_recalls(company_name: str, limit: int = 100) -> Dict:
    normalized = company_name.strip().replace('"', "")
    if not normalized:
        return {"results": [], "query": "", "total": 0, "error": "Empty company query"}

    # 1. Try specific firm name and then unqualified broad search
    search_queries = [
        f'recalling_firm:"{normalized}"',
        f'recalling_firm_name:"{normalized}"',
        f'"{normalized}"', # Broad search across all fields (covers product_description, etc.)
    ]

    for query in search_queries:
        results, total, error = _request_openfda(query, limit=limit)
        if results:
            return {"results": results, "query": query, "total": int(total or len(results)), "error": None}
        if total == 0:
            continue
        if error:
            return {"results": [], "query": query, "total": 0, "error": error}

    # 2. Fallback: Broader search if specific name failed (using first word of brand)
    broad_name = normalized.split()[0]
    if broad_name and broad_name.lower() != normalized.lower():
        fallback_queries = [
            f'recalling_firm:"{broad_name}"',
            f'"{broad_name}"'
        ]
        for fq in fallback_queries:
            results, total, error = _request_openfda(fq, limit=limit)
            if results:
                return {"results": results, "query": fq, "total": int(total or len(results)), "error": None}

    return {"results": [], "query": search_queries[0], "total": 0, "error": None}


def _classification_weight(classification: str) -> float:
    text = (classification or "").strip().lower()
    if "class i" in text: return 1.0
    if "class ii" in text: return 0.65
    if "class iii" in text: return 0.35
    return 0.45


def _status_weight(status: str) -> float:
    text = (status or "").strip().lower()
    if any(token in text for token in ("ongoing", "open", "pending", "not terminated")):
        return 1.0
    if "terminated" in text or "completed" in text:
        return 0.35
    return 0.6


def calculate_recall_signal(results: List[Dict], now: Optional[datetime] = None) -> Dict:
    now = now or datetime.now(timezone.utc)
    lookback_cutoff = now - timedelta(days=LOOKBACK_DAYS)
    recent_cutoff = now - timedelta(days=RECENT_WINDOW_DAYS)

    filtered_rows = []
    for row in results:
        report_dt = _parse_fda_date(row.get("report_date") or row.get("recall_initiation_date"))
        if not report_dt or report_dt < lookback_cutoff:
            continue
        enriched = dict(row)
        enriched["_report_datetime"] = report_dt
        filtered_rows.append(enriched)

    if not filtered_rows:
        return {"fda": 0.0, "recall_count_365d": 0, "recall_count_90d": 0}

    recent_rows = [row for row in filtered_rows if row["_report_datetime"] >= recent_cutoff]
    historical_rows = [row for row in filtered_rows if row["_report_datetime"] < recent_cutoff]

    recent_daily_rate = len(recent_rows) / float(max(1, RECENT_WINDOW_DAYS))
    historical_days = max(1, LOOKBACK_DAYS - RECENT_WINDOW_DAYS)
    historical_daily_rate = len(historical_rows) / float(historical_days)

    if historical_daily_rate > 0:
        velocity_ratio = recent_daily_rate / historical_daily_rate
        velocity_component = _clamp01((velocity_ratio - 1.0) / 2.0)
    else:
        velocity_component = _clamp01(len(recent_rows) / 6.0)

    event_burden = 0.0
    for row in filtered_rows:
        age_days = max(0, (now - row["_report_datetime"]).days)
        recency_weight = math.exp(-age_days / 180.0)
        severity_weight = _classification_weight(row.get("classification", ""))
        status_weight = _status_weight(row.get("status", ""))
        event_burden += severity_weight * (0.7 + (0.3 * status_weight)) * recency_weight

    burden_component = _clamp01(event_burden / 2.5)
    frequency_component = _clamp01(len(filtered_rows) / 6.0)
    fda_score = _clamp01((0.5 * burden_component) + (0.3 * velocity_component) + (0.2 * frequency_component))

    return {
        "fda": round(fda_score, 4),
        "recall_count_500d": len(filtered_rows),
        "recall_count_90d": len(recent_rows),
        "burden": round(burden_component, 4),
        "velocity": round(velocity_component, 4)
    }


def run_company_fda_pipeline(limit: int = 100) -> Dict:
    companies = _load_json(COMPANIES_PATH).get("companies", [])
    store = _load_json(DATA_STORE_PATH)
    updated_at = datetime.now(timezone.utc).isoformat()
    for company in companies:
        ticker = company["ticker"]
        fda_query = company.get("fda_search", company.get("name", ticker))
        recall_payload = fetch_fda_recalls(fda_query, limit=limit)
        scored = calculate_recall_signal(recall_payload.get("results", []))
        company_record = store.get(ticker, {"signals": {}, "fda_detail": {}})
        company_record["signals"]["fda_recall_velocity"] = float(scored.get("fda", 0.0))
        company_record["fda_detail"] = {**scored, "query": fda_query, "updated_at": updated_at}
        company_record["updated_at"] = updated_at
        store[ticker] = company_record
    _save_json(DATA_STORE_PATH, store)
    return store


if __name__ == "__main__":
    run_company_fda_pipeline()
