"""Offline checks for sealed forecasts and delayed, evidence-backed outcomes."""

import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.scoring.composite import WEIGHTS
from backend.scoring.forecast_audit import (
    audit_summary, forecast_window, make_forecast, resolve_forecasts,
    run_daily_audit,
)


ISSUED = datetime(2026, 10, 2, 5, tzinfo=timezone.utc)


def report(score=8.2, ticker="PG"):
    return {
        "ticker": ticker, "name": ticker, "score": score,
        "status": "CRITICAL" if score >= 7 else "STABLE",
        "last_updated": ISSUED.isoformat(),
        "signals": {name: {"raw": 0.5, "available": True} for name in WEIGHTS},
        "degraded_signals": [],
    }


def evidence(event_date=None, complete=True, generated=None):
    return {
        "generated_at": (generated or ISSUED + timedelta(days=65)).isoformat(),
        "companies": {"PG": {
            "collection_complete": complete,
            "events": [] if event_date is None else [{
                "date": event_date, "severity": 2,
                "classification": "Class II", "recall_number": "F-1234-2026",
                "domain": "food", "reason": "Test recall",
            }],
        }},
    }


def test_window_bands():
    assert forecast_window(8) == ("dated_alert", 15, 45)
    assert forecast_window(7) == ("dated_alert", 60, 90)
    assert forecast_window(5) == ("dated_alert", 90, 120)
    assert forecast_window(4) == ("abstain", None, None)
    assert forecast_window(3) == ("quiet_30d", 1, 30)


def test_outcomes_require_mature_complete_evidence():
    row = make_forecast(report(), ISSUED)
    assert row["window_start"] == "2026-10-17"
    assert row["window_end"] == "2026-11-16"
    recall = evidence("2026-10-28")

    resolve_forecasts([row], recall, ISSUED + timedelta(days=50))
    assert row["outcome"]["status"] == "PENDING"  # before the 14-day grace

    resolve_forecasts([row], evidence("2026-10-28", complete=False), ISSUED + timedelta(days=65))
    assert row["outcome"]["status"] == "PENDING"  # failed FDA fetch is not a miss

    resolve_forecasts([row], recall, ISSUED + timedelta(days=65))
    assert row["outcome"]["status"] == "HIT"
    assert row["outcome"]["matched_events"][0]["recall_number"] == "F-1234-2026"


def test_quiet_false_negative_and_nonoverlap():
    first = make_forecast(report(2.0), ISSUED)
    second = make_forecast(report(2.0), ISSUED + timedelta(days=1))
    assert second["id"] != first["id"]
    resolve_forecasts([first, second], evidence("2026-10-20"), ISSUED + timedelta(days=65))
    assert first["outcome"]["status"] == "FALSE_NEGATIVE"
    summary = audit_summary({"forecasts": [first, second]})
    assert summary["totals"]["independent_windows"] == 1
    assert summary["metrics"]["quiet_accuracy"] == 0.0


def test_idempotent_issue_and_no_invented_history():
    class FakeScorer:
        def compute_all(self):
            return [report()]

    with tempfile.TemporaryDirectory() as folder:
        ledger = Path(folder) / "ledger.json"
        events = Path(folder) / "events.json"
        first = run_daily_audit(ISSUED, ledger, events, FakeScorer())
        second = run_daily_audit(ISSUED, ledger, events, FakeScorer())
        assert len(first["forecasts"]) == len(second["forecasts"]) == 1
        assert second["forecasts"][0]["issued_at"] == ISSUED.isoformat()


if __name__ == "__main__":
    test_window_bands()
    test_outcomes_require_mature_complete_evidence()
    test_quiet_false_negative_and_nonoverlap()
    test_idempotent_issue_and_no_invented_history()
    print("forecast audit checks passed")
