# Nexus AI // The Pre-Mortem Machine

A forensic supply chain intelligence system built with the **Nothing OS Design Language**. We run the autopsy before the patient dies.

## Architecture Overview

### Backend (Python/FastAPI)
- **`collectors/`**: Data ingestion from 7 live streams (FDA, Wiki, FRED, Reddit, Adzuna, EDGAR, Trends).
- **`scoring/`**: Core algorithms for Weighted Fragility, Canary Ranking, and Blame Chain propagation.
- **`api/`**: FastAPI implementation with 5 forensic endpoints.
- **`store/`**: Local JSON-based signal store.

### Frontend (React/Vite)
- **Nothing OS Theme**: Pure black, high-contrast white text, Roboto Mono typography.
- **Dot Matrix System**: 24x24 grid-based icons for weather-style status indicators.
- **Nexus UI**: Large focus on numerical metrics (72sp+) and minimalist circular gauges (in progress).

## Getting Started

### Backend
```bash
cd backend
pip install -r ../requirements.txt
python main.py
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Design Principles (Nothing OS)
- **Visuals**: Pure black background (#000000), White text (#FFFFFF).
- **Typography**: Roboto Mono for a technical, precise feel.
- **Grids**: 16dp padding, card-based layout with 16dp rounded corners.
- **Indicators**: Dot matrix patterns for atmosphere and status.
- **Interaction**: Spring physics for card hover, subtle pulsing animations.
