"""Prospective, dated predictions checked against later FDA recall reports.

The ledger starts when this code is deployed. It never invents past forecasts.
An FDA Class I/II recall is an observable *proxy*, not proof that an entire
supply chain failed. The forecast portion of each entry is immutable after
issuance; only its outcome may be updated as later evidence arrives.
"""

import hashlib
import json
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import quote

from backend.scoring.composite import CompositeScorer

STORE_DIR = Path(__file__).resolve().parents[1] / "store"
LEDGER_PATH = STORE_DIR / "prediction_ledger.json"
EVENTS_PATH = STORE_DIR / "fda_events.json"
MODEL_VERSION = "composite-six-v2-brand-attention"
REPORTING_GRACE_DAYS = 14
MIN_AVAILABLE_SIGNALS = 4


def _read_json(path: Path) -> Dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _write_json_atomic(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        temporary.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        temporary.replace(path)
    finally:
        if temporary.exists():
            temporary.unlink()


def forecast_window(score: float) -> tuple[str, Optional[int], Optional[int]]:
    """Mirror the currently displayed score-band claim, without exact-date fiction."""
    if score >= 8:
        return "dated_alert", 15, 45
    if score >= 7:
        return "dated_alert", 60, 90
    if score >= 5:
        return "dated_alert", 90, 120
    if score >= 4:
        return "abstain", None, None
    return "quiet_30d", 1, 30


def make_forecast(report: Dict[str, Any], issued_at: datetime) -> Optional[Dict[str, Any]]:
    if report.get("stale") or report.get("error"):
        return None
    signals = report.get("signals", {})
    if sum(bool(row.get("available")) for row in signals.values()) < MIN_AVAILABLE_SIGNALS:
        return None
    if issued_at.tzinfo is None:
        raise ValueError("issued_at must have a timezone")
    try:
        data_time = datetime.fromisoformat(report["last_updated"].replace("Z", "+00:00"))
        if data_time.tzinfo is None or issued_at - data_time > timedelta(days=2):
            return None
    except (KeyError, ValueError, TypeError):
        return None

    ticker = report["ticker"]
    day = issued_at.astimezone(timezone.utc).date()
    score = float(report["score"])
    kind, first_day, last_day = forecast_window(score)
    identity = f"{MODEL_VERSION}|{day.isoformat()}|{ticker}"
    forecast = {
        "id": hashlib.sha256(identity.encode()).hexdigest()[:16],
        "model_version": MODEL_VERSION,
        "ticker": ticker,
        "name": report.get("name", ticker),
        "issued_at": issued_at.astimezone(timezone.utc).isoformat(),
        "score": score,
        "status_at_issue": report.get("status"),
        "kind": kind,
        "target": "Publicly reported FDA Class I/II recall; a supply-chain stress proxy",
        "window_start": (day + timedelta(days=first_day)).isoformat() if first_day else None,
        "window_end": (day + timedelta(days=last_day)).isoformat() if last_day else None,
        "signals_at_issue": {
            key: {"raw": row.get("raw"), "available": bool(row.get("available"))}
            for key, row in signals.items()
        },
        "degraded_signals": report.get("degraded_signals", []),
        "outcome": {"status": "ABSTAINED" if kind == "abstain" else "PENDING"},
    }
    return forecast


def _evidence_url(event: Dict[str, Any]) -> str:
    domain = event.get("domain", "food")
    if domain not in {"food", "drug", "device"}:
        domain = "food"
    query = quote(f'recall_number:"{event.get("recall_number", "")}"')
    return f"https://api.fda.gov/{domain}/enforcement.json?search={query}"


def resolve_forecasts(
    forecasts: List[Dict[str, Any]], events_store: Dict[str, Any],
    checked_at: datetime,
) -> int:
    """Resolve only after complete, fresh evidence and a reporting grace period."""
    generated = events_store.get("generated_at", "")
    try:
        evidence_date = date.fromisoformat(generated[:10])
    except ValueError:
        return 0

    resolved = 0
    for forecast in forecasts:
        if forecast.get("kind") == "abstain":
            continue
        end = date.fromisoformat(forecast["window_end"])
        if checked_at.date() < end + timedelta(days=REPORTING_GRACE_DAYS):
            continue
        if evidence_date < end + timedelta(days=REPORTING_GRACE_DAYS):
            continue
        company = events_store.get("companies", {}).get(forecast["ticker"], {})
        if company.get("collection_complete") is not True:
            continue

        matches = [
            event for event in company.get("events", [])
            if event.get("severity", 0) >= 2
            and forecast["window_start"] <= event.get("date", "") <= forecast["window_end"]
        ]
        matches.sort(key=lambda event: (event["date"], event.get("recall_number", "")))
        if forecast["kind"] == "dated_alert":
            status = "HIT" if matches else "MISS"
        else:
            status = "FALSE_NEGATIVE" if matches else "CORRECT_QUIET"

        outcome = {
            "status": status,
            "checked_at": checked_at.astimezone(timezone.utc).isoformat(),
            "evidence_snapshot_at": generated,
            "matched_events": [
                {
                    "date": event["date"],
                    "recall_number": event.get("recall_number"),
                    "classification": event.get("classification"),
                    "reason": event.get("reason"),
                    "source_url": _evidence_url(event),
                }
                for event in matches
            ],
        }
        if forecast.get("outcome", {}).get("status") != status or matches:
            forecast["outcome"] = outcome
        if forecast["outcome"]["status"] in {"HIT", "MISS", "FALSE_NEGATIVE", "CORRECT_QUIET"}:
            resolved += 1
    return resolved


def run_daily_audit(
    now: Optional[datetime] = None,
    ledger_path: Path = LEDGER_PATH,
    events_path: Path = EVENTS_PATH,
    scorer: Optional[CompositeScorer] = None,
) -> Dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError("now must have a timezone")
    ledger = _read_json(ledger_path) or {"schema_version": 1, "forecasts": []}
    forecasts = ledger.setdefault("forecasts", [])
    resolve_forecasts(forecasts, _read_json(events_path), now)

    known_ids = {row["id"] for row in forecasts}
    created = 0
    for report in (scorer or CompositeScorer()).compute_all():
        forecast = make_forecast(report, now)
        if forecast and forecast["id"] not in known_ids:
            forecasts.append(forecast)
            known_ids.add(forecast["id"])
            created += 1

    ledger["updated_at"] = now.astimezone(timezone.utc).isoformat()
    _write_json_atomic(ledger_path, ledger)
    print(f"Prediction audit: {created} new forecasts, {len(forecasts)} total")
    return ledger


def audit_summary(ledger: Dict[str, Any], ticker: Optional[str] = None) -> Dict[str, Any]:
    forecasts = [
        row for row in ledger.get("forecasts", [])
        if ticker is None or row.get("ticker") == ticker.upper()
    ]
    forecasts.sort(key=lambda row: (row["issued_at"], row["ticker"]))
    latest: Dict[str, Dict[str, Any]] = {}
    for row in forecasts:
        latest[row["ticker"]] = row

    # Daily windows overlap. Use non-overlapping forecasts per company for the
    # headline metric, or apparent sample size would be grossly inflated.
    independent: List[Dict[str, Any]] = []
    last_end: Dict[str, date] = {}
    for row in forecasts:
        if row["kind"] == "abstain":
            continue
        start = date.fromisoformat(row["issued_at"][:10])
        if start <= last_end.get(row["ticker"], date.min):
            continue
        last_end[row["ticker"]] = date.fromisoformat(row["window_end"])
        independent.append(row)

    counts = {name: 0 for name in ("HIT", "MISS", "FALSE_NEGATIVE", "CORRECT_QUIET", "PENDING")}
    for row in independent:
        status = row.get("outcome", {}).get("status", "PENDING")
        if status in counts:
            counts[status] += 1
    alert_total = counts["HIT"] + counts["MISS"]
    quiet_total = counts["CORRECT_QUIET"] + counts["FALSE_NEGATIVE"]
    return {
        "available": bool(forecasts),
        "updated_at": ledger.get("updated_at"),
        "method": (
            "Prospective forecasts, sealed before outcomes. Target is a public FDA "
            "Class I/II recall report, not every type of supply-chain disruption. "
            "Outcomes mature 14 days after the forecast window; headline counts "
            "use non-overlapping windows per company."
        ),
        "totals": {
            "issued": len(forecasts),
            "independent_windows": len(independent),
            "abstained": sum(row["kind"] == "abstain" for row in forecasts),
            **{key.lower(): value for key, value in counts.items()},
        },
        "metrics": {
            "alert_hit_rate": round(counts["HIT"] / alert_total, 3) if alert_total else None,
            "quiet_accuracy": round(counts["CORRECT_QUIET"] / quiet_total, 3) if quiet_total else None,
        },
        "latest": list(reversed(list(latest.values()))),
        "recent_resolutions": list(reversed([
            row for row in forecasts
            if row.get("outcome", {}).get("status") not in {"PENDING", "ABSTAINED"}
        ]))[:50],
    }


if __name__ == "__main__":
    run_daily_audit()
