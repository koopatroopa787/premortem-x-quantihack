import json
import math
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from statistics import mean
from time import sleep
from typing import Dict, List, Tuple
from urllib.parse import unquote

import requests

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

# Import fix

WIKI_API_URL = "https://en.wikipedia.org/w/api.php"
LOOKBACK_DAYS = 30
RELATED_PAGE_LIMIT = 25
TOP_K_STRESSED = 10
REQUEST_TIMEOUT_SECONDS = 20
WIKI_HEADERS = {
    "User-Agent": "PreMortemMachine/0.1 (research collector)",
    "Accept": "application/json",
}

COMPANIES_PATH = ROOT_DIR / "companies.json"
DATA_STORE_PATH = ROOT_DIR / "backend" / "store" / "data_store.json"

# Cold-start defaults used before there is enough page-specific history.
DEFAULT_BASELINE = {
    "revert_rate_mean": 0.06,
    "revert_rate_std": 0.03,
    "edit_frequency_mean": 0.8,
    "edit_frequency_std": 0.5,
    "editor_count_mean": 8.0,
    "editor_count_std": 4.0,
}
MIN_BASELINE_COUNT = 3

REVERT_KEYWORDS = ("revert", "undid", "rvv", "rollback", "restored")
LOW_SIGNAL_TOKENS = (
    "list of",
    "list_of",
    "timeline",
    "index of",
    "disambiguation",
    "template:",
    "wikipedia:",
    "help:",
    "portal:",
    "category:",
)


def load_json(path: Path) -> Dict:
    if path.exists():
        with open(path, "r", encoding="utf-8-sig") as f:
            return json.load(f)
    return {}


def save_json(path: Path, payload: Dict) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


def wiki_request(params: Dict) -> Dict:
    last_error = None
    for _ in range(3):
        try:
            response = requests.get(
                WIKI_API_URL,
                params=params,
                headers=WIKI_HEADERS,
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
            return response.json()
        except requests.RequestException as exc:
            last_error = exc
            sleep(0.5)

    raise last_error if last_error else RuntimeError("Wikipedia request failed")


def normalize_title(title: str) -> str:
    decoded = unquote(title)
    return decoded.replace(" ", "_").strip()


def title_tokens(title: str) -> set:
    normalized = title.lower().replace("_", " ").replace("-", " ")
    return {tok for tok in normalized.split() if len(tok) > 2}


def is_low_signal_title(title: str) -> bool:
    lowered = title.lower()
    return any(token in lowered for token in LOW_SIGNAL_TOKENS)


def discover_related_pages(
    seed_page: str,
    company_name: str,
    keywords: List[str],
    limit: int = RELATED_PAGE_LIMIT,
) -> List[str]:
    """
    Discover related pages from the company's primary page links and
    rank them by lexical relevance to company name and brand keywords.
    """
    collected_titles: List[str] = []
    continue_token = None

    base_params = {
        "action": "query",
        "format": "json",
        "titles": normalize_title(seed_page),
        "prop": "links",
        "pllimit": "max",
        "plnamespace": 0,
    }

    # Pull enough linked pages to rank candidates while keeping requests bounded.
    for _ in range(5):
        params = dict(base_params)
        if continue_token:
            params["plcontinue"] = continue_token

        try:
            payload = wiki_request(params)
        except Exception:
            break

        pages = payload.get("query", {}).get("pages", {})
        for page_data in pages.values():
            links = page_data.get("links", [])
            for link in links:
                title = link.get("title")
                if title:
                    collected_titles.append(title)

        continue_token = payload.get("continue", {}).get("plcontinue")
        if not continue_token:
            break

    seed_tokens = title_tokens(company_name)
    for kw in keywords:
        seed_tokens.update(title_tokens(kw))

    deduped = []
    seen = set()
    for title in collected_titles:
        normalized = normalize_title(title)
        if normalized not in seen and not is_low_signal_title(normalized):
            seen.add(normalized)
            deduped.append(normalized)

    primary_candidates: List[Tuple[float, str]] = []
    fallback_candidates: List[Tuple[float, str]] = []
    for idx, title in enumerate(deduped):
        tokens = title_tokens(title)
        overlap = len(tokens & seed_tokens)
        # Earlier links on the company page are usually more central.
        centrality_boost = max(0.0, (200.0 - idx) / 200.0)
        score = overlap * 2.0 + centrality_boost
        if overlap > 0:
            primary_candidates.append((score, title))
        elif centrality_boost > 0.85:
            fallback_candidates.append((centrality_boost, title))

    primary_candidates.sort(key=lambda item: (-item[0], item[1]))
    fallback_candidates.sort(key=lambda item: (-item[0], item[1]))

    related = [normalize_title(seed_page)]
    for _, title in primary_candidates:
        if title not in related:
            related.append(title)
        if len(related) >= limit:
            break

    for _, title in fallback_candidates:
        if title not in related:
            related.append(title)
        if len(related) >= limit:
            break
    return related[:limit]


def fetch_recent_revisions(page_title: str, limit: int = 200) -> List[Dict]:
    params = {
        "action": "query",
        "format": "json",
        "prop": "revisions",
        "titles": normalize_title(page_title),
        "rvlimit": limit,
        "rvprop": "timestamp|user|comment",
    }
    try:
        payload = wiki_request(params)
    except Exception:
        return []

    pages = payload.get("query", {}).get("pages", {})
    for page_data in pages.values():
        return page_data.get("revisions", [])
    return []


def calculate_revert_rate(revisions: List[Dict]) -> float:
    """
    Identify likely reverts in revision comments.
    """
    if not revisions:
        return 0.0

    revert_count = 0
    for revision in revisions:
        comment = revision.get("comment", "").lower()
        if any(keyword in comment for keyword in REVERT_KEYWORDS):
            revert_count += 1
    return revert_count / float(len(revisions))


def revisions_in_lookback(revisions: List[Dict], lookback_days: int = LOOKBACK_DAYS) -> List[Dict]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=lookback_days)
    filtered = []
    for revision in revisions:
        raw_ts = revision.get("timestamp")
        if not raw_ts:
            continue
        try:
            revision_time = datetime.fromisoformat(raw_ts.replace("Z", "+00:00"))
        except ValueError:
            continue
        if revision_time >= cutoff:
            filtered.append(revision)
    return filtered


def z_score(value: float, baseline_mean: float, baseline_std: float) -> float:
    std = max(baseline_std, 1e-6)
    return (value - baseline_mean) / std


def clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def format_wiki_signal(value: float) -> float:
    return round(clamp01(float(value)), 4)


def score_page_metrics(metrics: Dict, baseline: Dict) -> Tuple[float, List[str], Dict]:
    revert_z = max(0.0, z_score(metrics["revert_rate"], baseline["revert_rate_mean"], baseline["revert_rate_std"]))
    edit_spike_z = max(
        0.0,
        z_score(metrics["edit_frequency"], baseline["edit_frequency_mean"], baseline["edit_frequency_std"]),
    )
    editor_concentration_z = max(
        0.0,
        z_score(baseline["editor_count_mean"], metrics["editor_count"], baseline["editor_count_std"]),
    )

    # Convert z-space into 0-1 bounded stress components.
    revert_component = clamp01(revert_z / 3.0)
    edit_component = clamp01(edit_spike_z / 3.0)
    editor_component = clamp01(editor_concentration_z / 3.0)

    page_score = clamp01(
        (0.45 * revert_component)
        + (0.35 * edit_component)
        + (0.20 * editor_component)
    )

    flags = []
    if metrics["revert_rate"] >= max(0.15, baseline["revert_rate_mean"] + (2 * baseline["revert_rate_std"])):
        flags.append("high_revert_rate")
    if metrics["edit_frequency"] >= baseline["edit_frequency_mean"] + (2 * baseline["edit_frequency_std"]):
        flags.append("edit_spike")
    if metrics["editor_count"] <= max(2, baseline["editor_count_mean"] - (2 * baseline["editor_count_std"])):
        flags.append("low_editor_diversity")

    components = {
        "revert_component": round(revert_component, 4),
        "edit_component": round(edit_component, 4),
        "editor_component": round(editor_component, 4),
    }
    return page_score, flags, components


def get_page_baseline(page_title: str, baseline_store: Dict) -> Tuple[Dict, bool]:
    page_history = baseline_store.get(page_title)
    if not page_history or page_history.get("count", 0) < MIN_BASELINE_COUNT:
        return dict(DEFAULT_BASELINE), True

    return {
        "revert_rate_mean": page_history.get("revert_rate_mean", DEFAULT_BASELINE["revert_rate_mean"]),
        "revert_rate_std": max(page_history.get("revert_rate_std", DEFAULT_BASELINE["revert_rate_std"]), 1e-6),
        "edit_frequency_mean": page_history.get("edit_frequency_mean", DEFAULT_BASELINE["edit_frequency_mean"]),
        "edit_frequency_std": max(page_history.get("edit_frequency_std", DEFAULT_BASELINE["edit_frequency_std"]), 1e-6),
        "editor_count_mean": page_history.get("editor_count_mean", DEFAULT_BASELINE["editor_count_mean"]),
        "editor_count_std": max(page_history.get("editor_count_std", DEFAULT_BASELINE["editor_count_std"]), 1e-6),
    }, False


def update_running_stats(record: Dict, key: str, value: float, count: int) -> None:
    mean_key = f"{key}_mean"
    m2_key = f"{key}_m2"
    std_key = f"{key}_std"

    old_mean = record.get(mean_key, value)
    old_m2 = record.get(m2_key, 0.0)

    delta = value - old_mean
    new_mean = old_mean + (delta / count)
    delta2 = value - new_mean
    new_m2 = old_m2 + (delta * delta2)

    record[mean_key] = new_mean
    record[m2_key] = new_m2
    record[std_key] = math.sqrt(new_m2 / (count - 1)) if count > 1 else 1e-6


def update_page_baseline(page_title: str, metrics: Dict, baseline_store: Dict) -> None:
    record = baseline_store.get(page_title, {"count": 0})
    count = record.get("count", 0) + 1
    record["count"] = count

    update_running_stats(record, "revert_rate", metrics["revert_rate"], count)
    update_running_stats(record, "edit_frequency", metrics["edit_frequency"], count)
    update_running_stats(record, "editor_count", float(metrics["editor_count"]), count)
    record["updated_at"] = datetime.now(timezone.utc).isoformat()
    baseline_store[page_title] = record


def compute_page_metrics(page_title: str) -> Dict:
    revisions = fetch_recent_revisions(page_title)
    recent_revisions = revisions_in_lookback(revisions)
    editors = {rv.get("user") for rv in recent_revisions if rv.get("user")}

    return {
        "page_title": page_title,
        "revision_count": len(revisions),
        "lookback_revision_count": len(recent_revisions),
        "revert_rate": calculate_revert_rate(recent_revisions),
        "edit_frequency": len(recent_revisions) / float(LOOKBACK_DAYS),
        "editor_count": len(editors),
    }


def aggregate_company_wiki_signal(
    ticker: str,
    company_name: str,
    seed_page: str,
    keywords: List[str],
    baseline_store: Dict,
) -> Dict:
    related_pages = discover_related_pages(seed_page=seed_page, company_name=company_name, keywords=keywords)
    page_results = []

    for page_title in related_pages:
        metrics = compute_page_metrics(page_title)
        baseline, is_cold_start = get_page_baseline(page_title, baseline_store)
        page_score, flags, components = score_page_metrics(metrics, baseline)

        if is_cold_start:
            flags.append("cold_start_baseline")

        page_results.append(
            {
                "page_title": page_title,
                "score": round(page_score, 4),
                "flags": flags,
                "metrics": {
                    "revert_rate": round(metrics["revert_rate"], 4),
                    "edit_frequency": round(metrics["edit_frequency"], 4),
                    "editor_count": metrics["editor_count"],
                    "revision_count": metrics["revision_count"],
                    "lookback_revision_count": metrics["lookback_revision_count"],
                },
                "components": components,
            }
        )

        update_page_baseline(page_title, metrics, baseline_store)

    page_results.sort(key=lambda row: row["score"], reverse=True)
    top_k = page_results[:TOP_K_STRESSED]
    base_score = mean([row["score"] for row in top_k]) if top_k else 0.0
    anomaly_count = sum(len(row["flags"]) for row in top_k)
    anomaly_penalty = min(0.25, anomaly_count * 0.02)
    company_score = format_wiki_signal(base_score + anomaly_penalty)

    return {
        "ticker": ticker,
        "wikipedia_edit_wars": company_score,
        "pages_considered": len(page_results),
        "top_k": min(TOP_K_STRESSED, len(page_results)),
        "anomaly_penalty": round(anomaly_penalty, 4),
        "page_scores": page_results,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


def get_wiki_edit_velocity(page_title: str) -> float:
    """
    Backward-compatible single-page metric.
    Returns current lookback revert rate for a given page.
    """
    metrics = compute_page_metrics(page_title)
    return metrics["revert_rate"]


def run_company_wiki_pipeline() -> Dict:
    companies_payload = load_json(COMPANIES_PATH)
    companies = companies_payload.get("companies", [])
    store = load_json(DATA_STORE_PATH)
    baseline_store = store.setdefault("_wiki_baselines", {})

    for company in companies:
        ticker = company["ticker"]
        result = aggregate_company_wiki_signal(
            ticker=ticker,
            company_name=company.get("name", ticker),
            seed_page=company.get("wiki_page", company.get("name", ticker)),
            keywords=company.get("reddit_keywords", []),
            baseline_store=baseline_store,
        )

        company_record = store.get(ticker, {})
        signals = company_record.get("signals", {})
        signals["wikipedia_edit_wars"] = format_wiki_signal(result.get("wikipedia_edit_wars", 0.0))
        company_record["signals"] = signals
        company_record["wiki_detail"] = result
        # Scoring is handled by the API
        company_record["updated_at"] = result["updated_at"]
        store[ticker] = company_record

    save_json(DATA_STORE_PATH, store)
    return store


if __name__ == "__main__":
    run_company_wiki_pipeline()
