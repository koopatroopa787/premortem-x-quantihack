from pytrends.request import TrendReq

def fetch_google_trends(company_name):
    """
    Fetch Google Trends for '[brand] out of stock'.
    Ref: https://github.com/GeneralMills/pytrends
    """
    pytrends = TrendReq(hl='en-US', tz=360)
    kw_list = [f"{company_name} out of stock"]
    try:
        pytrends.build_payload(kw_list, cat=0, timeframe='today 3-m', geo='', gprop='')
        df = pytrends.interest_over_time()
        if not df.empty:
            return df.iloc[-1].to_dict()
        return {}
    except Exception as e:
        print(f"Error fetching Trends: {e}")
        return {}

if __name__ == "__main__":
    print(fetch_google_trends("Unilever"))
