"""
Offline checks for the evaluator. Run: python backend/scoring/test_evaluate.py

The point of this module is to produce a number someone will quote, so the two
things that would silently corrupt it are checked here: the AUC itself, and
whether a predictor can see past its as-of date (lookahead leakage inflates AUC
towards 1.0 and would make a useless model look excellent).
"""
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.scoring.evaluate import auc, filings_burst, wiki_velocity


def test_auc_perfect_separation():
    assert auc([5.0, 6.0, 7.0], [1.0, 2.0]) == 1.0


def test_auc_chance_on_identical_distributions():
    assert auc([1.0, 2.0], [1.0, 2.0]) == 0.5


def test_auc_inverted():
    assert auc([1.0], [5.0, 6.0]) == 0.0


def test_auc_counts_ties_as_half():
    assert auc([1.0], [1.0]) == 0.5


def test_filings_burst_ignores_the_future():
    asof = date(2024, 6, 1)
    # Identical history, except one adds a flood of filings AFTER the as-of date.
    past = [(asof - timedelta(days=n)).isoformat() for n in range(40, 200, 20)]
    future = [(asof + timedelta(days=n)).isoformat() for n in range(1, 30)]

    clean = filings_burst({"filing_8k_dates": past}, asof)
    polluted = filings_burst({"filing_8k_dates": past + future}, asof)
    assert clean == polluted, (clean, polluted)


def test_wiki_velocity_ignores_the_future():
    asof = date(2024, 6, 1)
    daily = {
        (asof - timedelta(days=n)).isoformat(): {"edits": 1, "reverts": 0}
        for n in range(1, 200)
    }
    polluted = dict(daily)
    for n in range(0, 30):
        polluted[(asof + timedelta(days=n)).isoformat()] = {"edits": 99, "reverts": 99}

    assert wiki_velocity({"wiki_daily": daily}, asof) == wiki_velocity(
        {"wiki_daily": polluted}, asof
    )


def test_spike_scores_above_quiet():
    asof = date(2024, 6, 1)
    # Must reach back past BASELINE_DAYS or filings_burst refuses to judge.
    quiet = {"filing_8k_dates": [
        (asof - timedelta(days=n)).isoformat() for n in range(40, 400, 20)
    ]}
    spiky = {"filing_8k_dates": quiet["filing_8k_dates"] + [
        (asof - timedelta(days=n)).isoformat() for n in range(1, 25, 3)
    ]}
    assert filings_burst(spiky, asof) > filings_burst(quiet, asof)


if __name__ == "__main__":
    test_auc_perfect_separation()
    test_auc_chance_on_identical_distributions()
    test_auc_inverted()
    test_auc_counts_ties_as_half()
    test_filings_burst_ignores_the_future()
    test_wiki_velocity_ignores_the_future()
    test_spike_scores_above_quiet()
    print("evaluator checks passed (AUC + no lookahead leakage)")
