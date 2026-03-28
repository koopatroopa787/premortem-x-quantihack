import sys
from pathlib import Path
ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

import requests
import os
import json
import math
from datetime import datetime, timedelta, timezone
from time import sleep
from dotenv import load_dotenv

# Path fix
COMPANIES_PATH = ROOT_DIR / "companies.json"
DATA_STORE_PATH = ROOT_DIR / "backend" / "store" / "data_store.json"


load_dotenv(Path(__file__).resolve().parents[1] / ".env")

BASE_URL = "https://api.adzuna.com/v1/api/jobs/gb/search/1"
BASELINE_PATH = Path(__file__).resolve().parents[1] / "store" / "adzuna_baseline.json"
BASELINE_WINDOW_DAYS = 180
MAX_HISTORY_POINTS = 365


def _clamp01(value):
    return max(0.0, min(1.0, value))


def _load_baseline_store():
    if BASELINE_PATH.exists():
        with open(BASELINE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"companies": {}}


def _save_baseline_store(payload):
    BASELINE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(BASELINE_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


def _fetch_count(query, app_id, app_key):
    params = {
        "app_id": app_id,
        "app_key": app_key,
        "what": query,
    }

    # Adzuna can intermittently return 5xx. Retry to avoid false zero signals.
    last_error = None
    for attempt in range(3):
        try:
            response = requests.get(BASE_URL, params=params, timeout=20)
            response.raise_for_status()
            data = response.json()
            return int(data.get("count", 0))
        except requests.RequestException as exc:
            last_error = exc
            if attempt < 2:
                sleep(0.6)

    raise last_error if last_error else RuntimeError("Adzuna request failed")


def _level_intensity_score(adjusted_count):
    # Saturating curve for broader spread without exceeding 1.0.
    return _clamp01(1.0 - math.exp(-max(0.0, adjusted_count) / 60.0))


def _compute_baseline(company_name):
    store = _load_baseline_store()
    company_history = store.get("companies", {}).get(company_name, [])
    cutoff = datetime.now(timezone.utc) - timedelta(days=BASELINE_WINDOW_DAYS)

    recent_points = []
    for point in company_history:
        raw_ts = point.get("timestamp")
        if not raw_ts:
            continue
        try:
            ts = datetime.fromisoformat(raw_ts)
        except ValueError:
            continue
        if ts >= cutoff:
            recent_points.append(point)

    if not recent_points:
        return 0.0

    values = [max(0.0, float(p.get("adjusted_count", 0.0))) for p in recent_points]
    return sum(values) / len(values)


def _update_baseline(company_name, adjusted_count):
    store = _load_baseline_store()
    companies = store.setdefault("companies", {})
    history = companies.setdefault(company_name, [])
    history.append(
        {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "adjusted_count": float(adjusted_count),
        }
    )
    companies[company_name] = history[-MAX_HISTORY_POINTS:]
    _save_baseline_store(store)

def fetch_adzuna_job_velocity(company_name):
    """
    Return a normalized talent-stress signal in [0,1] for composite scoring.
    Architecture alignment: job posting spike vs 6-month baseline.

    Cold start behavior (no baseline yet): conservative absolute scaling.
    Ref: https://developer.adzuna.com/
    """
    ADZUNA_APP_ID = os.getenv("ADZUNA_APP_ID")
    ADZUNA_APP_KEY = os.getenv("ADZUNA_APP_KEY")

    if not ADZUNA_APP_ID or not ADZUNA_APP_KEY:
        return 0

    try:
        targeted_queries = [
            f"{company_name} supply chain",
            f"{company_name} logistics",
            f"{company_name} procurement",
            f"{company_name} warehouse",
            f"{company_name} manufacturing",
            f"{company_name} operations",
        ]
        targeted_count = max(
            _fetch_count(query, ADZUNA_APP_ID, ADZUNA_APP_KEY) for query in targeted_queries
        )

        fallback_company_count = _fetch_count(company_name, ADZUNA_APP_ID, ADZUNA_APP_KEY)

        # Penalize broad company-only search if role-specific queries are empty.
        adjusted_count = (
            float(targeted_count)
            if targeted_count > 0
            else float(fallback_company_count) * 0.5
        )

        baseline = _compute_baseline(company_name)
        level_component = _level_intensity_score(adjusted_count)
        if baseline > 0:
            spike_ratio = adjusted_count / baseline
            # 1x baseline -> 0.0, 3x baseline -> 1.0
            spike_component = _clamp01((spike_ratio - 1.0) / 2.0)
            signal = _clamp01((0.75 * spike_component) + (0.25 * level_component))
        else:
            # Conservative cold-start until enough historical snapshots accumulate.
            signal = _clamp01(level_component * 0.6)

        _update_baseline(company_name, adjusted_count)
        return round(signal, 4)
    except Exception as e:
        print(f"Error fetching Adzuna data: {e}")
        return 0

def run_company_adzuna_pipeline():
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
        name = company.get("name", ticker)
        signal = fetch_adzuna_job_velocity(name)
        
        company_record = store.get(ticker, {})
        signals = company_record.get("signals", {})
        signals["adzuna_job_velocity"] = signal
        company_record["signals"] = signals
        company_record["updated_at"] = updated_at
        store[ticker] = company_record

    with open(DATA_STORE_PATH, "w") as f:
        json.dump(store, f, indent=2)
    return store

if __name__ == "__main__":
    run_company_adzuna_pipeline()
