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

def fetch_google_trends(company_name):
    """
    Fetch Google Trends for '[brand] out of stock'.
    Ref: https://github.com/GeneralMills/pytrends
    """
    # pytrends is extremely sensitive to rate limiting (429).
    # We use a single instance and add delays to reduce pressure.
    pytrends = TrendReq(hl='en-US', tz=360)
    kw_list = [f"{company_name} out of stock"]
    try:
        pytrends.build_payload(kw_list, cat=0, timeframe='today 3-m', geo='', gprop='')
        df = pytrends.interest_over_time()
        if not df.empty:
            return df.iloc[-1].to_dict()
        return {}
    except Exception as e:
        if "429" in str(e):
            print(f"Trends Rate limited (429) for {company_name}. Skipping...")
        else:
            print(f"Error fetching Trends for {company_name}: {e}")
        return {}

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
        
        trend_data = fetch_google_trends(name)
        signal = 0.5 if trend_data else 0.0
        
        company_record = store.get(ticker, {})
        signals = company_record.get("signals", {})
        signals["google_trends_velocity"] = signal
        company_record["signals"] = signals
        company_record["updated_at"] = updated_at
        store[ticker] = company_record

    with open(DATA_STORE_PATH, "w") as f:
        json.dump(store, f, indent=2)
    return store

if __name__ == "__main__":
    run_company_trends_pipeline()
