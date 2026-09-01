"""
Offline check for weight handling. Run: python backend/scoring/test_composite.py

Guards the regression where a missing signal was scored as 0.0 against its full
weight, so a company whose collector failed outscored (looked safer than) an
identical company whose data arrived.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.scoring.composite import CompositeScorer, WEIGHTS


def test_weights_sum_to_one():
    assert abs(sum(WEIGHTS.values()) - 1.0) < 1e-9, sum(WEIGHTS.values())


def test_missing_signal_does_not_look_like_calm():
    scorer = CompositeScorer()
    every_signal = {s: 0.8 for s in WEIGHTS}
    one_missing = {s: 0.8 for s in WEIGHTS if s != "google_trends"}

    full = scorer._score_company("TEST", {"signals": every_signal})
    partial = scorer._score_company("TEST", {"signals": one_missing})

    assert full["score"] == partial["score"], (full["score"], partial["score"])
    assert partial["degraded_signals"] == ["google_trends"], partial["degraded_signals"]


def test_all_signals_max_reaches_ten():
    scorer = CompositeScorer()
    report = scorer._score_company("TEST", {"signals": {s: 1.0 for s in WEIGHTS}})
    assert report["score"] == 10.0, report["score"]


if __name__ == "__main__":
    test_weights_sum_to_one()
    test_missing_signal_does_not_look_like_calm()
    test_all_signals_max_reaches_ten()
    print("composite weighting checks passed")
