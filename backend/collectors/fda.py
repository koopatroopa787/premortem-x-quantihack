import requests
import json

def fetch_fda_recalls(company_name):
    """
    Fetch recall data from openFDA API.
    Ref: https://open.fda.gov/apis/food/enforcement/
    """
    url = f"https://api.fda.gov/food/enforcement.json?search=recalling_firm_name:{company_name}&limit=10"
    try:
        response = requests.get(url)
        if response.status_code == 200:
            return response.json().get('results', [])
        return []
    except Exception as e:
        print(f"Error fetching FDA data for {company_name}: {e}")
        return []

def calculate_recall_velocity(results):
    """
    Calculate recall spike in past 90 days vs baseline.
    """
    # Skeleton logic: parse 'report_date' and count occurrences
    return len(results) / 10.0  # Normalized score

if __name__ == "__main__":
    # Test call
    print(fetch_fda_recalls("unilever"))
