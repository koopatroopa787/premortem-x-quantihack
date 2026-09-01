"""
scoring/evaluate.py
Does this thing actually predict anything?

Replaces the old "backtest", which scored the model against 50 events invented
by random.Random(42) and 10 rows literally named "Sector stress event 1..10".
This measures real predictors against real FDA recalls.

Method
------
Events      : real FDA recalls (store/fda_events.json, each with a recall_number)
Predictors  : reconstructed history (store/signal_history.json) — 8-K filing
              burst and Wikipedia edit/revert velocity. Both are independent of
              FDA, so predicting recalls with them is not circular.
Positives   : the predictor value on the day LEAD_DAYS before each real recall
Controls    : the same predictor on random dates with no recall in the next
              LEAD_DAYS, drawn from the same company and the same date range
Metric      : AUC — the probability that a randomly chosen pre-event day scores
              higher than a randomly chosen quiet day. 0.5 is a coin flip. This
              is what "how correct is it" actually means, and it has an honest
              null result available.

Run: python backend/scoring/evaluate.py
"""
import json
import random
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

EVENTS_PATH = ROOT_DIR / "backend" / "store" / "fda_events.json"
HISTORY_PATH = ROOT_DIR / "backend" / "store" / "signal_history.json"
RESULTS_PATH = ROOT_DIR / "backend" / "store" / "evaluation.json"

LEAD_DAYS = 30          # how far ahead we claim to see
BASELINE_DAYS = 180     # what "normal" means for this company
CONTROLS_PER_EVENT = 4
MIN_EVENTS_FOR_VERDICT = 8
RNG_SEED = 20260901     # fixed so the published number is reproducible


def _d(iso: str) -> date:
    return datetime.strptime(iso[:10], "%Y-%m-%d").date()


# ── Predictors ────────────────────────────────────────────────────────────────
# Each returns the predictor's value AS OF `asof`, using only data dated
# strictly before it. Leaking even one day of future data would inflate the AUC.

def filings_burst(company_history: Dict[str, Any], asof: date) -> Optional[float]:
    """8-Ks in the trailing 30 days, relative to this company's own baseline."""
    dates = [_d(x) for x in company_history.get("filing_8k_dates", [])]
    if not dates:
        return None
    window_start = asof - timedelta(days=30)
    baseline_start = asof - timedelta(days=BASELINE_DAYS)
    if min(dates) > baseline_start:
        return None  # not enough history behind this date to judge

    recent = sum(1 for d in dates if window_start <= d < asof)
    baseline = sum(1 for d in dates if baseline_start <= d < window_start)
    expected = baseline * (30.0 / (BASELINE_DAYS - 30.0))
    return recent - expected


def wiki_velocity(company_history: Dict[str, Any], asof: date) -> Optional[float]:
    """Edit + revert rate in the trailing 30 days vs the company's baseline."""
    daily = company_history.get("wiki_daily", {})
    if not daily:
        return None
    window_start = asof - timedelta(days=30)
    baseline_start = asof - timedelta(days=BASELINE_DAYS)

    recent = baseline = 0.0
    have_baseline = False
    for iso, counts in daily.items():
        d = _d(iso)
        # Reverts are the edit-war part; weight them above ordinary edits.
        weight = counts["edits"] + 2.0 * counts["reverts"]
        if window_start <= d < asof:
            recent += weight
        elif baseline_start <= d < window_start:
            baseline += weight
            have_baseline = True
    if not have_baseline:
        return None

    expected = baseline * (30.0 / (BASELINE_DAYS - 30.0))
    return recent - expected


PREDICTORS = {
    "edgar_8k_burst": filings_burst,
    "wikipedia_velocity": wiki_velocity,
}


# ── Metric ────────────────────────────────────────────────────────────────────

def auc(positives: List[float], controls: List[float]) -> Optional[float]:
    """
    Probability a random positive outranks a random control (ties count half).
    Straight Mann-Whitney; the sample sizes here do not justify anything fancier.
    """
    if not positives or not controls:
        return None
    wins = 0.0
    for p in positives:
        for c in controls:
            if p > c:
                wins += 1.0
            elif p == c:
                wins += 0.5
    return wins / (len(positives) * len(controls))


def _control_dates(
    event_dates: List[date], first: date, last: date, count: int, rng: random.Random
) -> List[date]:
    """Random dates from the same span with no recall in the following window."""
    span = (last - first).days
    if span <= LEAD_DAYS * 2:
        return []
    blocked = set()
    for e in event_dates:
        for offset in range(-LEAD_DAYS, LEAD_DAYS + 1):
            blocked.add(e + timedelta(days=offset))

    picked, attempts = [], 0
    while len(picked) < count and attempts < count * 50:
        attempts += 1
        candidate = first + timedelta(days=rng.randint(0, span))
        if candidate not in blocked:
            picked.append(candidate)
    return picked


def evaluate(
    lead_days: int = LEAD_DAYS, severity_min: int = 0
) -> Dict[str, Any]:
    """
    lead_days    : days before the event to sample the predictor. NEGATIVE values
                   sample AFTER the event, which is how you tell a leading
                   indicator from a lagging one.
    severity_min : 3 restricts to FDA Class I (serious harm or death) recalls.
    """
    events_store = json.loads(EVENTS_PATH.read_text(encoding="utf-8"))
    history_store = json.loads(HISTORY_PATH.read_text(encoding="utf-8"))
    rng = random.Random(RNG_SEED)

    results: Dict[str, Any] = {
        "generated_at": datetime.now().isoformat(),
        "method": (
            f"Real FDA recalls vs reconstructed predictors. Positive = predictor "
            f"{lead_days}d before a recall; control = random no-recall date from "
            f"the same company. Metric = AUC (0.5 is chance)."
        ),
        "lead_days": lead_days,
        "severity_min": severity_min,
        "predictors": {},
    }

    for name, fn in PREDICTORS.items():
        positives: List[float] = []
        controls: List[float] = []
        per_company: Dict[str, Dict[str, Any]] = {}

        for ticker, company_events in events_store["companies"].items():
            history = history_store["companies"].get(ticker)
            if not history:
                continue
            event_dates = [
                _d(e["date"]) for e in company_events["events"]
                if e.get("severity", 0) >= severity_min
            ]
            if not event_dates:
                continue

            first, last = min(event_dates), max(event_dates)
            co_pos, co_ctl = [], []

            for event_date in event_dates:
                value = fn(history, event_date - timedelta(days=lead_days))
                if value is not None:
                    co_pos.append(value)

            for control_date in _control_dates(
                event_dates, first, last, len(event_dates) * CONTROLS_PER_EVENT, rng
            ):
                value = fn(history, control_date)
                if value is not None:
                    co_ctl.append(value)

            positives.extend(co_pos)
            controls.extend(co_ctl)
            company_auc = auc(co_pos, co_ctl)
            if company_auc is not None and len(co_pos) >= 3:
                per_company[ticker] = {
                    "events_used": len(co_pos),
                    "controls": len(co_ctl),
                    "auc": round(company_auc, 3),
                }

        overall = auc(positives, controls)
        results["predictors"][name] = {
            "events_used": len(positives),
            "controls_used": len(controls),
            "auc": round(overall, 3) if overall is not None else None,
            "verdict": _verdict(overall, len(positives)),
            "per_company": per_company,
        }

    return results


def _verdict(value: Optional[float], sample: int) -> str:
    if value is None or sample < MIN_EVENTS_FOR_VERDICT:
        return "insufficient data"
    if value >= 0.65:
        return "predictive"
    if value >= 0.57:
        return "weakly predictive"
    if value > 0.43:
        return "no better than chance"
    return "inverted (fires after, not before)"


def sweep() -> Dict[str, Any]:
    """
    Same test across a range of horizons. Negative lead = sampled AFTER the
    recall, which distinguishes a leading indicator from a lagging one: a
    signal that only lights up post-event is news coverage, not foresight.
    """
    horizons = [90, 60, 30, 14, 7, 0, -7, -14, -30]
    table: Dict[str, Any] = {"horizons": horizons, "rows": {}}

    for name in PREDICTORS:
        table["rows"][name] = {}
    for lead in horizons:
        out = evaluate(lead_days=lead)
        for name, r in out["predictors"].items():
            table["rows"][name][str(lead)] = r["auc"]

    severe = evaluate(lead_days=LEAD_DAYS, severity_min=3)
    table["class_i_only"] = {
        name: {"auc": r["auc"], "events_used": r["events_used"]}
        for name, r in severe["predictors"].items()
    }
    return table


def run_and_persist() -> Dict[str, Any]:
    """
    Headline result + horizon sweep + Class I breakdown, written once.

    evaluate() deliberately does not write: it is called ten times by the sweep,
    and whichever call happened to run last would otherwise become "the"
    published result. That is exactly how the Class-I-only number ended up
    being served as the headline.
    """
    headline = evaluate()
    table = sweep()
    headline["horizon_sweep"] = table
    RESULTS_PATH.write_text(json.dumps(headline, indent=2), encoding="utf-8")
    return headline


if __name__ == "__main__":
    out = evaluate()
    print(f"\n{out['method']}\n")
    for name, r in out["predictors"].items():
        auc_str = "n/a" if r["auc"] is None else f"{r['auc']:.3f}"
        print(
            f"  {name:22s} AUC={auc_str:>6s}  "
            f"n={r['events_used']:4d} events / {r['controls_used']:4d} controls"
            f"   -> {r['verdict']}"
        )

    print("\nHorizon sweep (AUC; negative days = sampled AFTER the recall)")
    out["horizon_sweep"] = table = sweep()
    RESULTS_PATH.write_text(json.dumps(out, indent=2), encoding="utf-8")
    header = "".join(f"{h:>7d}" for h in table["horizons"])
    print(f"  {'':22s}{header}")
    for name, row in table["rows"].items():
        cells = "".join(
            f"{row[str(h)]:>7.3f}" if row.get(str(h)) is not None else f"{'n/a':>7s}"
            for h in table["horizons"]
        )
        print(f"  {name:22s}{cells}")

    print("\nClass I recalls only (serious harm or death):")
    for name, r in table["class_i_only"].items():
        auc_str = "n/a" if r["auc"] is None else f"{r['auc']:.3f}"
        print(f"  {name:22s} AUC={auc_str:>6s}  n={r['events_used']}")

    print(f"\nWrote {RESULTS_PATH}")
