import sys
from pathlib import Path
ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

import json
import time
from datetime import datetime, timezone

# Path fix
COMPANIES_PATH = ROOT_DIR / "companies.json"
DATA_STORE_PATH = ROOT_DIR / "backend" / "store" / "data_store.json"

RECENT_WINDOW_DAYS = 14
MIN_BASELINE_NONZERO_DAYS = 7
# Recent interest this many times the baseline reads as a full-strength signal.
VELOCITY_SATURATION = 2.5


def trends_velocity(series):
    """
    Turn a daily interest series into a 0..1 velocity: how elevated the most
    recent fortnight is against the preceding baseline.

    Returns None when there is not enough history to say anything, so callers
    can mark the signal degraded rather than inventing a number.
    """
    values = [float(v) for v in series]
    if len(values) < RECENT_WINDOW_DAYS * 2:
        return None

    recent = values[-RECENT_WINDOW_DAYS:]
    baseline = values[:-RECENT_WINDOW_DAYS]

    # A single isolated search must not become a 100% "shortage" alert.
    if sum(value > 0 for value in baseline) < MIN_BASELINE_NONZERO_DAYS:
        return None

    recent_mean = sum(recent) / len(recent)
    baseline_mean = sum(baseline) / len(baseline)
    if baseline_mean <= 0:
        return None

    ratio = recent_mean / baseline_mean
    return max(0.0, min(1.0, (ratio - 1.0) / (VELOCITY_SATURATION - 1.0)))


def fetch_google_trends(query):
    """
    Fetch a company/brand search-interest series and return its velocity.

    The previous '[corporate name] out of stock' phrases usually had no
    measurable series. Brand attention is available more often, but it is NOT
    evidence of a shortage. Keep the query and this limitation in the store.

    Ref: https://github.com/GeneralMills/pytrends
    """
    try:
        from pytrends.request import TrendReq
        pytrends = TrendReq(hl='en-US', tz=360)
        pytrends.build_payload([query], cat=0, timeframe='today 3-m', geo='', gprop='')
        df = pytrends.interest_over_time()
        if df.empty or query not in df:
            return {"value": None, "status": "no_series", "query": query}
        # The final row is usually a partial day and reads artificially low.
        if "isPartial" in df and bool(df["isPartial"].iloc[-1]):
            df = df.iloc[:-1]
        values = df[query].tolist()
        value = trends_velocity(values)
        return {
            "value": value,
            "status": "ok" if value is not None else "insufficient_search_volume",
            "query": query,
            "observations": len(values),
            "nonzero_days": sum(float(v) > 0 for v in values),
        }
    except Exception as e:
        status = "rate_limited" if "429" in str(e) else "request_failed"
        print(f"Google Trends {status} for {query}: {e}")
        return {"value": None, "status": status, "query": query, "error": str(e)[:200]}

def run_company_trends_pipeline():
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
    for i, company in enumerate(companies):
        ticker = company["ticker"]
        query = company.get("trends_search") or company.get("name", ticker)
        
        # Add a delay between requests to avoid 429 errors
        if i > 0:
            time.sleep(3)
        
        result = fetch_google_trends(query)
        signal = result["value"]

        company_record = store.get(ticker, {})
        signals = company_record.get("signals", {})
        # Key must match WEIGHTS in scoring/composite.py and SIGNAL_ORDER in the
        # frontend. Leaving it out entirely is what marks the signal degraded —
        # better than writing a placeholder the scorer would treat as real.
        if signal is None:
            signals.pop("google_trends", None)
            print(f"  ! no Trends signal for {ticker}: {result['status']}; marking degraded")
        else:
            signals["google_trends"] = round(signal, 4)
        signals.pop("google_trends_velocity", None)  # superseded key
        company_record["signals"] = signals
        company_record["google_trends_detail"] = {
            **result,
            "kind": "brand_search_attention",
            "warning": "Search attention is not proof of an out-of-stock event.",
            "updated_at": updated_at,
        }
        company_record["updated_at"] = updated_at
        store[ticker] = company_record

    with open(DATA_STORE_PATH, "w") as f:
        json.dump(store, f, indent=2)
    return store

if __name__ == "__main__":
    run_company_trends_pipeline()
