"""
Offline check for the Google Trends velocity. Run:
    python backend/collectors/test_trends.py

The old collector returned `0.5 if trend_data else 0.0` — a liveness check, not
a signal: identical for every company that answered, and it threw away the
series it had just fetched.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.collectors.trends import trends_velocity


def test_flat_interest_is_no_signal():
    assert trends_velocity([10.0] * 60) == 0.0


def test_spike_registers():
    flat_then_spike = [10.0] * 46 + [30.0] * 14
    assert trends_velocity(flat_then_spike) == 1.0, trends_velocity(flat_then_spike)


def test_mild_rise_is_partial():
    mild = [10.0] * 46 + [15.0] * 14
    v = trends_velocity(mild)
    assert 0.0 < v < 1.0, v


def test_decline_floors_at_zero():
    assert trends_velocity([20.0] * 46 + [5.0] * 14) == 0.0


def test_too_little_history_is_unknown_not_zero():
    # None means "degraded"; 0.0 would be a claim of calm we cannot support.
    assert trends_velocity([10.0] * 20) is None


def test_sparse_search_is_unknown_not_a_spike():
    # An isolated hit for an obscure shortage phrase is not a usable baseline.
    assert trends_velocity([0.0] * 45 + [100.0] + [0.0] * 14) is None


if __name__ == "__main__":
    test_flat_interest_is_no_signal()
    test_spike_registers()
    test_mild_rise_is_partial()
    test_decline_floors_at_zero()
    test_too_little_history_is_unknown_not_zero()
    test_sparse_search_is_unknown_not_a_spike()
    print("trends velocity checks passed")
