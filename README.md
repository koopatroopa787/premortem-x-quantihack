# The Pre-Mortem Machine

Team APEX · QuantiHack 2026 · [Live site](https://premortem.duckdns.org/)

Premortem monitors public data for 20 consumer-goods companies and produces an **exploratory supply-chain stress score**. It is an early-warning research tool, not an autonomous trading system or a calibrated probability of corporate failure.

The most important distinction: the interactive Backtester is a **synthetic scenario simulator**. The historical Evaluation tests two independently reconstructed signals against real FDA recalls, and the new **Validation** tab tracks the live model's predictions prospectively. Neither should be presented as proof of a trading edge.

## Current architecture

```text
openFDA · MediaWiki · FRED · Adzuna · SEC EDGAR · Google Trends
                         │
              daily backend/refresh_data.py
                         │
             backend/store/data_store.json
                         │
               six-signal composite score
                         │
browser ── Nginx ── React/Vite UI ── FastAPI ── JSON stores
                         │
            prospective prediction ledger
                         │
              later FDA outcome matching
```

The production site serves a static frontend through Nginx and runs FastAPI under `systemd`. The API reads local JSON files; it does not continuously scrape sources when the browser polls. The site polls `/live` every 60 seconds, whereas source collection runs daily. A separate weekly job reconstructs SEC/Wikipedia history and calculates retrospective AUC.

## Signals and limitations

| Signal | Weight | Meaning |
| --- | ---: | --- |
| FDA recall velocity | 25% | Recent known recalls, severity and frequency |
| Google Trends | 20% | Brand-search *attention* velocity, not verified stock-outs |
| Wikipedia edit activity | 20% | Reputational/edit anomalies |
| FRED macro backdrop | 15% | Sector-wide inventory and producer-price pressure |
| Adzuna jobs | 12% | Company-specific operations/logistics hiring change |
| SEC 8-K keywords | 8% | Disruption-related filing language and activity |

The score is 0–10: stable below 4, elevated at 4–<7, critical at 7+. The six weights are rescaled over feeds that actually returned data. A failed or sparse feed is **unavailable**, never a fabricated zero. `/health` and `/companies` expose per-feed coverage. Some source proxies are indirect: a search spike or Wikipedia edit pattern is not by itself evidence of a supply-chain failure.

Google's official Trends API remains an [access-request alpha](https://developers.google.com/search/apis/trends). This project uses the unofficial `pytrends` client. Corporate-name “out of stock” phrases were usually too sparse to produce a time series; company-configured brand terms are now used for a broader attention signal. A query with too little baseline data or a rate-limit failure remains degraded. We do not promise 20/20 coverage.

## Prediction audit: did a dated claim happen?

The daily refresh appends a timestamped, model-versioned forecast for each company whose data is sufficiently complete. It **never backfills invented historical predictions**. Forecasts are idempotent per company/day and retain the original score and signal snapshot.

- A score of 8+ issues a dated alert for days 15–45; 7–<8 for days 60–90; 5–<7 for days 90–120.
- A score below 4 records a “no Class I/II recall in the next 30 days” call.
- Scores 4–<5 abstain from a dated call.
- An outcome is withheld until the window closes **plus 14 days** for publication lag. It is checked only when that company's FDA collection completed successfully.
- A dated alert is a hit only if an FDA Class I/II recall was publicly reported in its window. Otherwise it is a miss. Quiet calls are likewise checked for false negatives.

This outcome is a **specific, observable proxy**. It does not cover every real-world supply disruption, and an FDA recall's `report_date` may lag the underlying incident. Daily calls overlap, so headline rates count only non-overlapping windows per company. Until windows mature, the UI shows “not measured yet,” not a zero or a claimed accuracy figure. The ledger lives at `backend/store/prediction_ledger.json` and is intentionally gitignored because it is runtime evidence.

`GET /audit` exposes the overall ledger summary; `GET /audit/{ticker}` filters a company. Each confirmed event links to its openFDA recall number. The existing `/evaluation` is a **separate retrospective test of SEC filing bursts and Wikipedia velocity**, not a six-signal validation. Its latest stored AUCs were 0.512 and 0.438 respectively (0.5 is chance). Past README claims of “19 days early” or “71% accuracy” were not supported by that evaluation and have been removed.

## API

| Endpoint | Purpose |
| --- | --- |
| `/health` | API status and actual signal coverage |
| `/companies`, `/company/{ticker}` | Current scores, signals and company report |
| `/live` | Score deltas relative to the previous snapshot |
| `/news/{ticker}`, `/events/{ticker}` | Contextual news and real FDA recall records |
| `/evaluation` | Retrospective SEC/Wikipedia AUC against real FDA events |
| `/audit`, `/audit/{ticker}` | Prospective dated forecasts and resolved outcomes |
| `/canary`, `/blame-chain/{ticker}` | Illustrative ranking and supplier-link heuristics |

The canary and blame-chain views currently rely on seeded/illustrative historical lead times and supplier links; they are not verified supplier intelligence. The report's score-derived index and date bands are **heuristics, not calibrated probabilities**.

## Run locally

Use Python 3.10+ and Node.js 20+.

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Put optional source credentials in `backend/.env` (gitignored): `FRED_API_KEY`, `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, and a descriptive `SEC_USER_AGENT`. No trading credentials are required. Run the collector and API:

```bash
python backend/refresh_data.py
cd backend && uvicorn api.server:app --host 127.0.0.1 --port 8000
```

In another terminal:

```bash
cd frontend
npm ci
npm run dev
```

Vite forwards `/api` to the local FastAPI server. `python backend/scoring/test_forecast_audit.py`, `python backend/scoring/test_composite.py`, `python backend/scoring/test_evaluate.py`, and `python backend/collectors/test_trends.py` run the key offline checks.

## Responsible interpretation

Premortem is research software. Do not use its alerts, simulated returns, or date bands as investment advice or evidence that a particular company's supply chain will fail. Prospective performance should be judged from the audit after enough independent windows mature, including misses and false negatives—not from cherry-picked examples.
