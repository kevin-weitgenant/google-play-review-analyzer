# Plan: Google Play Scraper Service

> Feature: Fetch all reviews from a Google Play Store app URL/link and return them via the FastAPI backend.

---

## Overview

The user provides a Google Play Store URL like:
```
https://play.google.com/store/apps/details?id=com.devsisters.cos&pcampaignid=...&hl=pt_BR
```

The backend:
1. Extracts the `id` query parameter (the app ID, e.g. `com.devsisters.cos`)
2. Optionally extracts `hl` (language) and `gl` (country) from the URL
3. Uses `google-play-scraper`'s `reviews_all()` to fetch **all** reviews
4. Returns them as JSON to the frontend

---

## Decisions Summary

| Decision | Choice |
|---|---|
| Scraper library | `google-play-scraper` (Python) |
| Fetch function | `reviews_all()` — fetches all reviews automatically with pagination |
| Rate limiting | `sleep_milliseconds=500` between pagination requests to avoid being blocked |
| Sort order | `Sort.NEWEST` by default (configurable) |
| Language/Country | Extracted from the URL (`hl` and `gl` params), defaults to `'en'` / `'us'` |
| Endpoint | `POST /reviews/fetch` — accepts `{ "url": "..." }` and returns reviews |
| Max reviews | No hard limit for now (but configurable via `count` param later) |

---

## 1. Backend Changes

### 1.1 Install dependency

Already listed in `pyproject.toml` from the repo setup plan:
```
google-play-scraper
```

If not installed yet:
```bash
cd backend
uv add google-play-scraper
```

### 1.2 Create `backend/app/services/scraper.py`

This is the core scraper service with two helper functions:

#### `extract_app_id(url: str) -> dict`

- Parses the Google Play URL using `urllib.parse.urlparse` + `parse_qs`
- Extracts:
  - `app_id` — the `id` query param (required)
  - `lang` — the `hl` query param (optional, defaults to `'en'`)
  - `country` — the `gl` query param (optional, defaults to `'us'`)
- Raises `ValueError` if no `id` param found or URL is not a valid Google Play link

#### `fetch_all_reviews(app_id: str, lang: str = 'en', country: str = 'us', sort: str = 'newest') -> list[dict]`

- Uses `google_play_scraper.reviews_all()` with:
  - `sleep_milliseconds=500` (half-second delay between pages to avoid rate-limiting)
  - `lang` and `country` from the parsed URL
  - `sort` mapped from string to `Sort` enum (`'newest'` → `Sort.NEWEST`, `'relevant'` → `Sort.MOST_RELEVANT`)
- Converts `datetime` fields in each review to ISO format strings for JSON serialization
- Returns a list of review dicts

### 1.3 Create `backend/app/schemas/api.py`

Pydantic models for the API:

```python
class FetchReviewsRequest(BaseModel):
    url: str                           # Full Google Play Store URL
    sort: str = "newest"               # "newest" or "relevant"
    filter_score: int | None = None    # Optional: filter by star rating (1-5)

class ReviewResponse(BaseModel):
    review_id: str
    user_name: str
    content: str
    score: int
    thumbs_up_count: int
    review_created_version: str | None
    at: str                            # ISO datetime string
    reply_content: str | None
    replied_at: str | None             # ISO datetime string
    app_version: str | None

class FetchReviewsResponse(BaseModel):
    app_id: str
    app_name: str                      # From app() detail call
    total_reviews: int
    reviews: list[ReviewResponse]
```

### 1.4 Create `backend/app/routers/reviews.py`

FastAPI router with one endpoint:

```
POST /reviews/fetch
```

Flow:
1. Accept `FetchReviewsRequest` body
2. Call `extract_app_id(request.url)` → get `app_id`, `lang`, `country`
3. Call `app(app_id, lang, country)` to get app name
4. Call `fetch_all_reviews(app_id, lang, country, request.sort)` → get reviews list
5. Return `FetchReviewsResponse`

Error handling:
- `422` — invalid URL or missing `id` param
- `502` — Google Play scraper fails (network error, app not found, etc.)

### 1.5 Register router in `backend/app/main.py`

```python
from app.routers import reviews

app.include_router(reviews.router, prefix="/api", tags=["reviews"])
```

---

## 2. File Structure After Changes

```
backend/
├── app/
│   ├── main.py                  # Updated: include reviews router
│   ├── core/
│   │   ├── config.py
│   │   └── database.py
│   ├── models/
│   │   ├── review.py
│   │   └── analysis.py
│   ├── routers/
│   │   ├── reviews.py           # NEW: POST /api/reviews/fetch
│   │   └── analysis.py
│   ├── services/
│   │   ├── scraper.py           # NEW: extract_app_id() + fetch_all_reviews()
│   │   └── groq_service.py
│   └── schemas/
│       └── api.py               # NEW: request/response Pydantic models
├── pyproject.toml               # Updated: google-play-scraper dep (if not already)
└── ...
```

---

## 3. VS Code REST Client Tests

Create `backend/tests/api.rest` for manual API testing using the [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) VS Code extension.

### File: `backend/tests/api.rest`

```rest
@baseUrl = http://localhost:8000

### Health check
GET {{baseUrl}}/health

### Fetch reviews — valid URL (Cookie Run: OvenBreak)
POST {{baseUrl}}/api/reviews/fetch
Content-Type: application/json

{
    "url": "https://play.google.com/store/apps/details?id=com.devsisters.cos"
}

### Fetch reviews — with language and country from URL
POST {{baseUrl}}/api/reviews/fetch
Content-Type: application/json

{
    "url": "https://play.google.com/store/apps/details?id=com.devsisters.cos&hl=pt_BR&gl=br"
}

### Fetch reviews — sort by most relevant
POST {{baseUrl}}/api/reviews/fetch
Content-Type: application/json

{
    "url": "https://play.google.com/store/apps/details?id=com.devsisters.cos",
    "sort": "relevant"
}

### Fetch reviews — filter 5-star only
POST {{baseUrl}}/api/reviews/fetch
Content-Type: application/json

{
    "url": "https://play.google.com/store/apps/details?id=com.devsisters.cos",
    "filter_score": 5
}

### Fetch reviews — Pokémon GO
POST {{baseUrl}}/api/reviews/fetch
Content-Type: application/json

{
    "url": "https://play.google.com/store/apps/details?id=com.nianticlabs.pokemongo"
}

### Fetch reviews — invalid URL (missing app id)
POST {{baseUrl}}/api/reviews/fetch
Content-Type: application/json

{
    "url": "https://play.google.com/store/apps/details"
}

### Fetch reviews — not a Google Play URL
POST {{baseUrl}}/api/reviews/fetch
Content-Type: application/json

{
    "url": "https://example.com"
}

### Fetch reviews — empty URL
POST {{baseUrl}}/api/reviews/fetch
Content-Type: application/json

{
    "url": ""
}
```

---

## 4. Execution Steps (in order)

| # | Step | Command / Action |
|---|---|---|
| 1 | Install `google-play-scraper` | `cd backend && uv add google-play-scraper` |
| 2 | Create `schemas/api.py` | Pydantic models for request/response |
| 3 | Create `services/scraper.py` | `extract_app_id()` + `fetch_all_reviews()` |
| 4 | Create `routers/reviews.py` | `POST /api/reviews/fetch` endpoint |
| 5 | Update `main.py` | Register the reviews router |
| 6 | Create `tests/api.rest` | REST Client test file for manual API testing |
| 7 | Run & test | Start server, click "Send Request" in `.rest` file |

---

## 5. Verification Checklist

- [ ] `POST /api/reviews/fetch` with a valid Google Play URL returns all reviews
- [ ] Invalid URL returns `422` with clear error message
- [ ] `lang` and `country` are correctly extracted from URL params
- [ ] Default `lang='en'`, `country='us'` when not in URL
- [ ] `datetime` fields serialized as ISO strings (no serialization errors)
- [ ] Sort order works (`newest` vs `relevant`)
- [ ] `filter_score` parameter works (1–5 star filter)
- [ ] Rate limiting via `sleep_milliseconds` is active
- [ ] OpenAPI docs at `/docs` show the new endpoint with correct schema

---

## 6. What's NOT in This Plan (deferred)

- **Database storage** — reviews are fetched fresh each time, not persisted yet
- **Groq LLM analysis** — sentiment / priority / suggested responses
- **Frontend UI** — review display, search, filters
- **Orval codegen** — regenerate API client after endpoints exist
- **Caching** — no caching of scraped results for now
- **AWS Lambda** — periodic fetching / notifications
