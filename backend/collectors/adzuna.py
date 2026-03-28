import requests
import os

def fetch_adzuna_job_velocity(company_name):
    """
    Fetch job posting volume for logistics/procurement roles.
    Ref: https://developer.adzuna.com/
    """
    ADZUNA_APP_ID = os.getenv("ADZUNA_APP_ID")
    ADZUNA_APP_KEY = os.getenv("ADZUNA_APP_KEY")
    
    if not ADZUNA_APP_ID:
        return 0
        
    url = f"https://api.adzuna.com/v1/api/jobs/gb/search/1?app_id={ADZUNA_APP_ID}&app_key={ADZUNA_APP_KEY}&what={company_name}%20supply%20chain"
    try:
        response = requests.get(url)
        data = response.json()
        return data.get('count', 0)
    except Exception as e:
        print(f"Error fetching Adzuna data: {e}")
        return 0

if __name__ == "__main__":
    print(fetch_adzuna_job_velocity("Unilever"))
