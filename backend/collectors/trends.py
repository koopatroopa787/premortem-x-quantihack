import sys
from pathlib import Path
ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from pytrends.request import TrendReq
import json
import os
import time
from datetime import datetime, timezone

# Path fix
COMPANIES_PATH = ROOT_DIR / "companies.json"
DATA_STORE_PATH = ROOT_DIR / "backend" / "store" / "data_store.json"

RECENT_WINDOW_DAYS = 14
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

    recent_mean = sum(recent) / len(recent)
    baseline_mean = sum(baseline) / len(baseline)
    if baseline_mean <= 0:
        # No search interest at all historically; a spike off zero is not
        # something this scale can express honestly.
        return 0.0 if recent_mean <= 0 else 1.0

    ratio = recent_mean / baseline_mean
    return max(0.0, min(1.0, (ratio - 1.0) / (VELOCITY_SATURATION - 1.0)))


def fetch_google_trends(company_name):
    """
    Fetch Google Trends for '[brand] out of stock' and return a 0..1 velocity,
    or None if unavailable.

    Ref: https://github.com/GeneralMills/pytrends
    """
    # pytrends is extremely sensitive to rate limiting (429).
    # We use a single instance and add delays to reduce pressure.
    pytrends = TrendReq(hl='en-US', tz=360)
    keyword = f"{company_name} out of stock"
    try:
        pytrends.build_payload([keyword], cat=0, timeframe='today 3-m', geo='', gprop='')
        df = pytrends.interest_over_time()
        if df.empty or keyword not in df:
            return None
        # The final row is usually a partial day and reads artificially low.
        if "isPartial" in df and bool(df["isPartial"].iloc[-1]):
            df = df.iloc[:-1]
        return trends_velocity(df[keyword].tolist())
    except Exception as e:
        if "429" in str(e):
            print(f"Trends Rate limited (429) for {company_name}. Skipping...")
        else:
            print(f"Error fetching Trends for {company_name}: {e}")
        return None

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
        name = company.get("name", ticker)
        
        # Add a delay between requests to avoid 429 errors
        if i > 0:
            time.sleep(3)
        
        signal = fetch_google_trends(name)

        company_record = store.get(ticker, {})
        signals = company_record.get("signals", {})
        # Key must match WEIGHTS in scoring/composite.py and SIGNAL_ORDER in the
        # frontend. Leaving it out entirely is what marks the signal degraded —
        # better than writing a placeholder the scorer would treat as real.
        if signal is None:
            signals.pop("google_trends", None)
            print(f"  ! no trends signal for {ticker}; marking degraded")
        else:
            signals["google_trends"] = round(signal, 4)
        signals.pop("google_trends_velocity", None)  # superseded key
        company_record["signals"] = signals
        company_record["updated_at"] = updated_at
        store[ticker] = company_record

    with open(DATA_STORE_PATH, "w") as f:
        json.dump(store, f, indent=2)
    return store

if __name__ == "__main__":
    run_company_trends_pipeline()
