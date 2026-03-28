from fredapi import Fred
import os

# Initialize with environment variable or fallback to placeholder
FRED_API_KEY = os.getenv("FRED_API_KEY", "YOUR_API_KEY")

def fetch_macro_signals():
    """
    Fetch FRED ISRATIO (Inventory to Sales Ratio) and PPI series.
    Ref: https://fred.stlouisfed.org/
    """
    if FRED_API_KEY == "YOUR_API_KEY":
        return {"error": "API Key required"}
        
    fred = Fred(api_key=FRED_API_KEY)
    try:
        # ISRATIO: Retailers: Inventories to Sales Ratio
        isratio = fred.get_series('ISRATIO').iloc[-1]
        # PPI: Producer Price Index by Industry: Manufacturing
        ppi = fred.get_series('PCU325611325611').iloc[-1] 
        return {"isratio": isratio, "ppi": ppi}
    except Exception as e:
        print(f"Error fetching FRED data: {e}")
        return {}

if __name__ == "__main__":
    print(fetch_macro_signals())
