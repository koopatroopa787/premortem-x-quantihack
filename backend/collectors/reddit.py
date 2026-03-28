import sys
from pathlib import Path
ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

import praw
import os
import json
from datetime import datetime, timezone
from dotenv import load_dotenv

# Path fix
COMPANIES_PATH = ROOT_DIR / "companies.json"
DATA_STORE_PATH = ROOT_DIR / "backend" / "store" / "data_store.json"
load_dotenv(ROOT_DIR / "backend" / ".env")

def fetch_reddit_mentions(keywords):
    """
    Search Reddit for brand-specific supply chain complaints.
    Ref: https://www.reddit.com/prefs/apps
    """
    REDDIT_CLIENT_ID = os.getenv("REDDIT_CLIENT_ID")
    REDDIT_SECRET = os.getenv("REDDIT_SECRET")
    
    if not REDDIT_CLIENT_ID:
        return 0
        
    reddit = praw.Reddit(
        client_id=REDDIT_CLIENT_ID,
        client_secret=REDDIT_SECRET,
        user_agent="PreMortemMachine/0.1"
    )
    
    query = " OR ".join([f'"{k}" "out of stock"' for k in keywords])
    mentions = 0
    # Search across key subs like r/supplychain, r/groceries, r/Shortages
    for submission in reddit.subreddit("all").search(query, limit=100, time_filter="week"):
        mentions += 1
    return mentions

def run_company_reddit_pipeline():
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
        keywords = company.get("reddit_keywords", [company.get("name", ticker)])
        
        # PRAW requires credentials. If missing, we return 0.
        mentions = fetch_reddit_mentions(keywords)
        # Normalize: 0-10 mentions -> 0-1.0
        signal = min(1.0, mentions / 10.0)
        
        company_record = store.get(ticker, {})
        signals = company_record.get("signals", {})
        signals["reddit_oos_velocity"] = signal
        company_record["signals"] = signals
        company_record["updated_at"] = updated_at
        store[ticker] = company_record

    with open(DATA_STORE_PATH, "w") as f:
        json.dump(store, f, indent=2)
    return store

if __name__ == "__main__":
    run_company_reddit_pipeline()
