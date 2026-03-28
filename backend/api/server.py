from fastapi import FastAPI, HTTPException
from typing import List, Optional
import json
import os

app = FastAPI(title="The Pre-Mortem Machine API")

# Load initial data
DATA_STORE_PATH = "backend/store/data_store.json"
COMPANIES_PATH = "companies.json"

def load_json(path):
    if os.path.exists(path):
        with open(path, "r") as f:
            return json.load(f)
    return {}

@app.get("/companies")
async def get_companies():
    """
    All tracked CPG companies with current composite score, 
    canary rank, and signal breakdown.
    """
    companies = load_json(COMPANIES_PATH).get("companies", [])
    data = load_json(DATA_STORE_PATH)
    # Merge live data into company list
    for co in companies:
        co["score"] = data.get(co["ticker"], {}).get("score", 0.0)
        co["signals"] = data.get(co["ticker"], {}).get("signals", {})
    return {"companies": companies}

@app.get("/company/{ticker}")
async def get_company_report(ticker: str):
    """
    Full Preliminary Post-Mortem Report for one company.
    """
    data = load_json(DATA_STORE_PATH).get(ticker)
    if not data:
        raise HTTPException(status_code=404, detail="Company not found")
    return {
        "ticker": ticker,
        "report_title": "PRELIMINARY POST-MORTEM",
        "confidence": 0.74,
        "tod_estimate": "60-90 days",
        "signals": data.get("signals", {}),
        "blame_chain": data.get("blame_chain", {})
    }

@app.get("/canary")
async def get_canary_leaderboard():
    """
    Ranked list of companies ordered by historical precedence.
    """
    # Placeholder for actual ranking logic call
    return {
        "canaries": [
            {"ticker": "HSY", "rank": 1, "avg_lead_days": 23, "current_signal": 6.8}
        ]
    }

@app.get("/blame-chain/{ticker}")
async def get_blame_chain(ticker: str):
    """
    Patient zero identification and propagation path.
    """
    return {
        "origin": "ticker_A",
        "path": [],
        "next_affected": [
            {"ticker": "UL", "lag_days": 30, "confidence": 0.68}
        ]
    }

@app.get("/live")
async def get_live_updates():
    """
    Lightweight polling endpoint for dashboard.
    """
    return {
        "updated_at": "2026-03-28T12:00:00Z",
        "changes": [
            {"ticker": "UL", "score": 7.4, "delta": 0.6}
        ]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
