import sys
import os
from pathlib import Path

# Fix path for local imports
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from backend.collectors.fda import run_company_fda_pipeline
from backend.collectors.wikipedia import run_company_wiki_pipeline
from backend.collectors.fred import run_company_fred_pipeline
from backend.collectors.adzuna import run_company_adzuna_pipeline
from backend.collectors.edgar import run_company_edgar_pipeline
from backend.collectors.edgar import run_company_edgar_pipeline

def refresh_all():
    print("\n" + "="*50)
    print("🚀 POST MORTEM: DATA REFRESH ORCHESTRATOR")
    print("="*50)
    
    collectors = [
        ("FDA Recalls", run_company_fda_pipeline),
        ("Wikipedia Edits", run_company_wiki_pipeline),
        ("FRED Macro", run_company_fred_pipeline),
        ("Adzuna Jobs", run_company_adzuna_pipeline),
        ("EDGAR filings", run_company_edgar_pipeline),
    ]
    
    for name, func in collectors:
        try:
            print(f"📡 Syncing {name}...")
            func()
        except Exception as e:
            print(f"❌ Error syncing {name}: {e}")
            
    print("\n✅ All available signals synchronized to data_store.json")
    print("="*50 + "\n")

if __name__ == "__main__":
    refresh_all()
