def detect_patient_zero(signal_timeline):
    """
    Identify which company's signal fired first.
    Ref: premortem_architecture.jsx
    """
    sorted_timeline = sorted(signal_timeline, key=lambda x: x['timestamp'])
    if not sorted_timeline:
        return None
    return sorted_timeline[0]['ticker']

def trace_propagation(origin_ticker, supplier_graph):
    """
    Trace supply chain contagion from origin.
    Input: origin_ticker, supplier_graph (ImportYeti BoL data)
    Output: list of affected nodes with lag estimates
    """
    path = []
    current = origin_ticker
    # Simple BFS/DFS on supplier graph to find downstream companies
    downstream = supplier_graph.get(current, [])
    for node in downstream:
        path.append({
            "ticker": node['ticker'],
            "lag_days": node.get('avg_lag', 30),
            "confidence": 0.68
        })
    return path

if __name__ == "__main__":
    graph = {"Ticker_A": [{"ticker": "Ticker_B", "avg_lag": 15}]}
    print(trace_propagation("Ticker_A", graph))
