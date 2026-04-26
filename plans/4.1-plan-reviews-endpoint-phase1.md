# Plan 4 (Phase 1) — Reviews Endpoint: Paginated Fetch + Date Filter

## Goal

Prepare the `/reviews/fetch` endpoint for AI analysis by ensuring it returns only the reviews we actually care about — a **bounded, recent, sorted** list — instead of fetching the entire review history of the app.

**No AI yet.** This phase is purely about making the data pipeline smart.

---

## Problem with current implementation

Currently `fetch_all_reviews()` calls `reviews_all()` from `google-play-scraper`. This fetches **every single review** for an app, paginating internally until exhausted. For popular apps this can be tens of thousands of reviews and take minutes.

We don't need all of that. We need 25, newest first.

---

## Changes (4 files)

### 1. `app/core/config.py` — Add configurable constant

```python
MAX_REVIEWS_TO_FETCH: int = 25
```

This controls the cap. Change it in `.env` without touching code.

**Why a config setting instead of a request parameter?** The consumer of this endpoint (the analysis pipeline) doesn't choose how many reviews to analyze — that's a system-level decision. The frontend can still show fewer if it wants, but the backend fetches up to this ceiling.

---

### 2. `app/services/scraper.py` — Add `fetch_reviews_paginated()`

Add a new function alongside the existing `fetch_all_reviews()`. Do **not** remove or modify `fetch_all_reviews()` — it still works and might be useful later.

```python
from google_play_scraper import app as app_detail, Sort, reviews_all, reviews
```

New function:

```python
def fetch_reviews_paginated(
    app_id: str,
    lang: str = "en",
    country: str = "us",
    sort: str = "newest",
    filter_score: int | None = None,
    count: int = 25,
) -> list[GooglePlayReview]:
    """Fetch a limited number of reviews (first page only).

    Uses reviews() instead of reviews_all() to avoid downloading
    the entire review history. Returns up to `count` reviews.
    """
    sort_enum = VALID_SORTS.get(sort)
    if sort_enum is None:
        raise ValueError(
            f"Invalid sort '{sort}'. Must be one of: {', '.join(VALID_SORTS.keys())}"
        )

    kwargs = {
        "app_id": app_id,
        "lang": lang,
        "country": country,
        "sort": sort_enum,
        "count": count,
    }
    if filter_score is not None:
        kwargs["filter_score_with"] = filter_score

    result, _continuation_token = reviews(**kwargs)
    return [GooglePlayReview.model_validate(r) for r in result]
```

Key differences from `fetch_all_reviews()`:
- Uses `reviews()` → returns `(list, continuation_token)`, we only take page 1
- `count` parameter caps the fetch
- No `sleep_milliseconds` — we're making one request, not paginating through thousands

---

### 3. `app/schemas/api.py` — Add optional `since` date filter to request

Add a single field to `FetchReviewsRequest`:

```python
since: datetime | None = Field(
    default=None,
    description="Only include reviews created on or after this date (ISO 8601).",
    examples=["2025-01-01T00:00:00Z"],
)
```

No changes to `ReviewResponse` or `FetchReviewsResponse`.

---

### 4. `app/routers/reviews.py` — Use paginated fetch + date filter

Changes:
- Import `fetch_reviews_paginated` instead of (or alongside) `fetch_all_reviews`
- Import `settings` to read `MAX_REVIEWS_TO_FETCH`
- Pass `count=settings.MAX_REVIEWS_TO_FETCH` to the new function
- After fetching, filter by `since` date if provided
- The `total_reviews` in the response reflects the count **after** filtering

```python
from app.core.config import settings
from app.services.scraper import extract_app_id, fetch_reviews_paginated, get_app_name

# ...

@router.post("/fetch", response_model=FetchReviewsResponse)
def fetch_reviews(request: FetchReviewsRequest):
    # 1. Parse URL
    try:
        parsed = extract_app_id(request.url)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    app_id = parsed["app_id"]
    lang = parsed["lang"]
    country = parsed["country"]

    # 2. Get app name
    try:
        app_name = get_app_name(app_id, lang=lang, country=country)
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch app details: {str(e)}",
        )

    # 3. Fetch reviews (bounded count)
    try:
        reviews = fetch_reviews_paginated(
            app_id=app_id,
            lang=lang,
            country=country,
            sort=request.sort,
            filter_score=request.filter_score,
            count=settings.MAX_REVIEWS_TO_FETCH,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch reviews: {str(e)}",
        )

    # 4. Convert to response models
    review_responses = [_to_response(r) for r in reviews]

    # 5. Optional date filter
    if request.since:
        review_responses = [r for r in review_responses if r.at >= request.since]

    return FetchReviewsResponse(
        app_id=app_id,
        app_name=app_name,
        total_reviews=len(review_responses),
        reviews=review_responses,
    )
```

---

## Summary of changes

| File | Change |
|---|---|
| `app/core/config.py` | Add `MAX_REVIEWS_TO_FETCH: int = 25` |
| `app/services/scraper.py` | Import `reviews`, add `fetch_reviews_paginated()` function |
| `app/schemas/api.py` | Add `since: datetime \| None` field to `FetchReviewsRequest` |
| `app/routers/reviews.py` | Switch to `fetch_reviews_paginated`, add date filter logic |

**No new files. No new dependencies.** `google-play-scraper` already exposes `reviews()`.

---

## Behavioral changes to `/reviews/fetch`

| Before | After |
|---|---|
| Fetches ALL reviews (could be thousands) | Fetches up to 25 (configurable) |
| No date filter | Optional `since` parameter |
| Slow for popular apps | Fast — single API call to Google Play |

**Breaking change?** The response shape is identical (`FetchReviewsResponse`). The only difference is `total_reviews` will be ≤ 25 instead of the true total. The `reviews` list is the same shape. Frontend-compatible.
