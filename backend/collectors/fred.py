import sys
from pathlib import Path
ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

import json
import os
from datetime import datetime, timezone
from statistics import mean, pstdev

from fredapi import Fred
from dotenv import load_dotenv



from dotenv import load_dotenv

# Restore standard imports
load_dotenv(ROOT_DIR / "backend" / ".env")

# Retail inventories-to-sales ratio and food PPI proxy.
SERIES_CANDIDATES = {
    "isratio": ["ISRATIO"],
    # Prefer food PPI proxies, then fall back to broad PPI to avoid hard failure.
    "ppi_food": ["WPUFD4", "PCU311311", "PPIACO"],
}
LOOKBACK_MONTHS = 24

ROOT_DIR = Path(__file__).resolve().parents[2]
COMPANIES_PATH = ROOT_DIR / "companies.json"
DATA_STORE_PATH = ROOT_DIR / "backend" / "store" / "data_store.json"


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def _load_json(path: Path) -> dict:
    if path.exists():
        with open(path, "r", encoding="utf-8-sig") as f:
            return json.load(f)
    return {}


def _save_json(path: Path, payload: dict) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


def _tail_values(series, points: int) -> list:
    clean = series.dropna()
    if clean.empty:
        return []
    tail = clean.iloc[-points:]
    return [float(v) for v in tail]


def _get_first_available_series(fred: Fred, series_candidates: list):
    last_error = None
    for series_id in series_candidates:
        try:
            return series_id, fred.get_series(series_id)
        except Exception as exc:
            last_error = exc
    raise last_error if last_error else RuntimeError("No FRED series candidates available")


def _score_from_history(current: float, history: list, z_cap: float = 3.0) -> float:
    if len(history) < 6:
        return 0.5

    baseline_mean = mean(history)
    baseline_std = max(pstdev(history), 1e-6)
    z = (current - baseline_mean) / baseline_std
    normalized = (max(-z_cap, min(z_cap, z)) + z_cap) / (2.0 * z_cap)
    return _clamp01(normalized)


def fetch_macro_signals() -> dict:
    """
    Fetch FRED macro series and return a normalized signal compatible with
    composite scoring. Higher value implies higher macro stress.
    """
    fred_api_key = os.getenv("FRED_API_KEY")
    if not fred_api_key:
        return {"fred": 0.0, "error": "FRED_API_KEY required"}

    try:
        fred = Fred(api_key=fred_api_key)

        isratio_series_id, isratio_series = _get_first_available_series(
            fred, SERIES_CANDIDATES["isratio"]
        )
        ppi_series_id, ppi_series = _get_first_available_series(
            fred, SERIES_CANDIDATES["ppi_food"]
        )

        isratio_hist = _tail_values(isratio_series, LOOKBACK_MONTHS)
        ppi_hist = _tail_values(ppi_series, LOOKBACK_MONTHS)
        if not isratio_hist or not ppi_hist:
            return {"fred": 0.0, "error": "No FRED data available"}

        isratio_current = isratio_hist[-1]
        ppi_current = ppi_hist[-1]

        isratio_score = _score_from_history(isratio_current, isratio_hist)
        ppi_score = _score_from_history(ppi_current, ppi_hist)

        fred_score = round(_clamp01((0.6 * isratio_score) + (0.4 * ppi_score)), 4)

        return {
            "fred": fred_score,
            "isratio": round(isratio_current, 4),
            "ppi": round(ppi_current, 4),
            "isratio_score": round(isratio_score, 4),
            "ppi_score": round(ppi_score, 4),
            "lookback_months": LOOKBACK_MONTHS,
            "source_series": {
                "isratio": isratio_series_id,
                "ppi_food": ppi_series_id,
            },
        }
    except Exception as exc:
        print(f"Error fetching FRED data: {exc}")
        return {"fred": 0.0, "error": str(exc)}


def fetch_fred_signal() -> float:
    """
    Convenience accessor for pipelines that only need the normalized score.
    """
    return float(fetch_macro_signals().get("fred", 0.0))


def run_company_fred_pipeline() -> dict:
    """
    Populate the FRED signal for all tracked companies and recompute composite scores.
    Macro data is shared across companies, but written per-company for a consistent
    signals schema.
    """
    companies = _load_json(COMPANIES_PATH).get("companies", [])
    store = _load_json(DATA_STORE_PATH)
    macro = fetch_macro_signals()
    updated_at = datetime.now(timezone.utc).isoformat()

    for company in companies:
        ticker = company["ticker"]
        company_record = store.get(ticker, {})
        signals = company_record.get("signals", {})
        signals["fred_macro_backdrop"] = float(macro.get("fred", 0.0))

        company_record["signals"] = signals
        company_record["fred_detail"] = macro
        # Scoring is handled by the API
        company_record["updated_at"] = updated_at
        store[ticker] = company_record

    _save_json(DATA_STORE_PATH, store)
    return store


if __name__ == "__main__":
    run_company_fred_pipeline()
