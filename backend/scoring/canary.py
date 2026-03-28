def rank_canaries(companies, historical_data):
    """
    Rank companies by historical signal precedence.
    Ref: premortem_architecture.jsx
    """
    ranked_list = []
    for co in companies:
        avg_lead_days = calculate_lead_time(co['ticker'], historical_data)
        current_score = co.get('current_score', 0.0)
        
        # Canary score = 60% precedence + 40% current signal
        canary_score = (avg_lead_days * 0.6) + (current_score * 0.4)
        
        ranked_list.append({
            "ticker": co['ticker'],
            "name": co['name'],
            "canary_score": round(canary_score, 2),
            "avg_lead_days": avg_lead_days,
            "current_score": current_score
        })
        
    return sorted(ranked_list, key=lambda x: x['canary_score'], reverse=True)

def calculate_lead_time(ticker, historical_data):
    """
    Stub for historical precedence calculation.
    How many days before sector stress did this company fire?
    """
    # Sample logic: return mock lead time from historical_data
    return historical_data.get(ticker, 0)

if __name__ == "__main__":
    companies = [{"ticker": "UL", "name": "Unilever", "current_score": 7.4}]
    hist = {"UL": 23}
    print(rank_canaries(companies, hist))
