# Plan 4 — AI Analysis Pipeline (Sentiment + Priority)

## Context

`/reviews/fetch` is working. It fetches all reviews from an app using `google-play-scraper` and returns them via `FetchReviewsResponse`. Now we need to layer AI analysis on top.

**Two tasks per review:**
1. **Sentiment** — positive, neutral, or negative
2. **Priority** — does this review flag a bug/crash/urgent issue a developer should care about? (true/false)

**Model:** Llama (small/fast) via Groq  
**Strategy:** 2 separate prompts per review, all calls in parallel  
**Target:** 25 reviews max (configurable constant)

---

## Analysis of Current Pydantic Models

### What `/reviews/fetch` returns

```
FetchReviewsResponse
├── app_id: str
├── app_name: str
├── total_reviews: int
└── reviews: list[ReviewResponse]
    └── ReviewResponse
        ├── review_id: str
        ├── user_name: str
        ├── content: str                ← WHAT WE SEND TO THE LLM
        ├── score: int                  ← USEFUL CONTEXT (1-5 stars)
        ├── thumbs_up_count: int
        ├── review_created_version: str | None
        ├── at: datetime                ← WHAT WE FILTER/SORT BY
        ├── reply_content: str | None
        ├── replied_at: datetime | None
        └── app_version: str | None
```

### Key observations

1. **"Only comments, not replies"** — Every item in `reviews` is already a top-level user review. The `replyContent`/`repliedAt` fields are the *developer's response* attached to that review, not separate items. **No filtering needed.**

2. **"Filter from date, latest first"** — The `sort="newest"` option already passes `Sort.NEWEST` to the scraper, so reviews come back sorted newest-first. If we want an additional date cutoff (e.g., "only reviews from the last 30 days"), we'd add an optional `since` parameter and filter on the `at` field post-fetch.

3. **"Retrieve a defined amount (25)"** — Currently `fetch_all_reviews()` uses `reviews_all()` which fetches **everything**. For a popular app this could return tens of thousands of reviews. We must switch to `reviews()` (not `reviews_all()`) which supports a `count` parameter for pagination.

---

## Architecture Decisions

### ✅ 2 separate prompts (confirmed)

Each prompt is simpler and more focused. The LLM is less likely to get confused. Each task is independently swapable (different model, different prompt, different cadence). The cost of an extra Groq call is negligible.

### ✅ Parallel execution (confirmed)

25 reviews × 2 tasks = 50 concurrent async calls to Groq. Groq's whole selling point is low-latency inference. With `asyncio.gather` this should complete in well under a second.

### ✅ "Dumb" model (confirmed)

`llama-3.1-8b-instant` or `llama-3.3-70b-versatile` — these are simple classification tasks (ternary + binary). The 8B model is more than sufficient and insanely fast.

### ⚠️ Critical fix: stop using `reviews_all()`

Switch to `reviews()` with `count=25`. Fetching all reviews to then discard 99% of them is wasteful and slow.

---

## Implementation Plan

### Phase 1: Update config constants

**File: `app/core/config.py`**

Add to `Settings`:

```python
MAX_REVIEWS_TO_ANALYZE: int = 25
GROQ_MODEL: str = "llama-3.1-8b-instant"
```

These are easily changed via `.env` without touching code.

---

### Phase 2: Add paginated scraper function

**File: `app/services/scraper.py`**

Add a new function alongside the existing `fetch_all_reviews()`:

```python
from google_play_scraper import reviews  # NOT reviews_all

def fetch_reviews_paginated(
    app_id: str,
    lang: str = "en",
    country: str = "us",
    sort: str = "newest",
    filter_score: int | None = None,
    count: int = 25,
) -> list[GooglePlayReview]:
    """Fetch a limited number of reviews (first page only)."""
    sort_enum = VALID_SORTS.get(sort)
    if sort_enum is None:
        raise ValueError(...)

    kwargs = {
        "app_id": app_id,
        "lang": lang,
        "country": country,
        "sort": sort_enum,
        "count": count,
        "sleep_milliseconds": 500,
    }
    if filter_score is not None:
        kwargs["filter_score_with"] = filter_score

    result, _continuation_token = reviews(**kwargs)
    return [GooglePlayReview.model_validate(r) for r in result]
```

Key difference: uses `reviews()` which returns `(list, continuation_token)` — we only take the first page (25 items max). No fetching of the entire review history.

---

### Phase 3: Implement Groq service

**File: `app/services/groq_service.py`**

Two async functions, each with a focused prompt:

```python
import httpx
from app.core.config import settings

GROQ_BASE_URL = "https://api.groq.com/openai/v1/chat/completions"


async def analyze_sentiment(
    client: httpx.AsyncClient,
    content: str,
    score: int,
) -> str:
    """Classify review as 'positive', 'neutral', or 'negative'."""
    prompt = (
        "You are a sentiment classifier. "
        "Classify the following app review as exactly one word: "
        '"positive", "neutral", or "negative".\n\n'
        f"The user gave a {score}/5 star rating.\n"
        f'Review: "{content}"\n\n'
        "Respond with only one word."
    )

    response = await client.post(
        GROQ_BASE_URL,
        headers={"Authorization": f"Bearer {settings.groq_api_key}"},
        json={
            "model": settings.GROQ_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0,
            "max_tokens": 10,
        },
    )
    response.raise_for_status()
    raw = response.json()["choices"][0]["message"]["content"].strip().lower()

    # Normalize — in case the model adds punctuation or extra text
    if "positive" in raw:
        return "positive"
    if "negative" in raw:
        return "negative"
    return "neutral"


async def analyze_priority(
    client: httpx.AsyncClient,
    content: str,
    score: int,
) -> bool:
    """Determine if the review flags an urgent issue (bug, crash, etc.)."""
    prompt = (
        "You are a priority classifier for app reviews. "
        "A priority review indicates a bug, crash, broken feature, "
        "or urgent issue that needs developer attention immediately.\n\n"
        f"Review (user gave {score}/5 stars): \"{content}\"\n\n"
        'Respond with only "true" or "false".'
    )

    response = await client.post(
        GROQ_BASE_URL,
        headers={"Authorization": f"Bearer {settings.groq_api_key}"},
        json={
            "model": settings.GROQ_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0,
            "max_tokens": 10,
        },
    )
    response.raise_for_status()
    raw = response.json()["choices"][0]["message"]["content"].strip().lower()

    return "true" in raw
```

Notes:
- Both are `async` — takes an `httpx.AsyncClient` so we reuse connections across all 50 calls
- `temperature=0` — we want deterministic classification, not creative writing
- `max_tokens=10` — the response is a single word, no need for more
- Fuzzy matching on the response (`"positive" in raw`) — handles edge cases like `"Positive."` or `"The sentiment is positive"`

---

### Phase 4: Update API schemas

**File: `app/schemas/api.py`**

Add:

```python
from typing import Literal

class FetchAndAnalyzeRequest(BaseModel):
    url: str = Field(
        ...,
        description="Full Google Play Store URL",
        examples=[
            "https://play.google.com/store/apps/details?id=com.devsisters.cos"
        ],
    )
    sort: str = Field(
        default="newest",
        description="Sort order: 'newest' or 'relevant'",
    )
    filter_score: int | None = Field(
        default=None,
        description="Filter by star rating (1-5). None means all scores.",
        ge=1,
        le=5,
    )
    since: datetime | None = Field(
        default=None,
        description="Only include reviews from this date onwards.",
    )


class AnalyzedReviewResponse(ReviewResponse):
    sentiment: Literal["positive", "neutral", "negative"]
    is_priority: bool


class FetchAndAnalyzeResponse(BaseModel):
    app_id: str
    app_name: str
    total_analyzed: int
    reviews: list[AnalyzedReviewResponse]
```

---

### Phase 5: Orchestration endpoint

**File: `app/routers/analysis.py`**

```python
import asyncio
from datetime import datetime

import httpx
from fastapi import APIRouter, HTTPException

from app.core.config import settings
from app.schemas.api import (
    FetchAndAnalyzeRequest,
    FetchAndAnalyzeResponse,
    AnalyzedReviewResponse,
    ReviewResponse,
)
from app.services.groq_service import analyze_sentiment, analyze_priority
from app.services.scraper import extract_app_id, fetch_reviews_paginated, get_app_name
from app.routers.reviews import _to_response

router = APIRouter(prefix="/analysis", tags=["analysis"])


@router.post("/fetch-and-analyze", response_model=FetchAndAnalyzeResponse)
async def fetch_and_analyze(request: FetchAndAnalyzeRequest):
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
        raise HTTPException(status_code=502, detail=f"Failed to fetch app details: {e}")

    # 3. Fetch reviews (limited count, newest first)
    try:
        raw_reviews = fetch_reviews_paginated(
            app_id=app_id,
            lang=lang,
            country=country,
            sort=request.sort,
            filter_score=request.filter_score,
            count=settings.MAX_REVIEWS_TO_ANALYZE,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch reviews: {e}")

    # 4. Convert to API response models
    reviews = [_to_response(r) for r in raw_reviews]

    # 5. Optional date filter
    if request.since:
        reviews = [r for r in reviews if r.at >= request.since]

    # 6. Parallel AI analysis — 2 calls per review, all concurrent
    async with httpx.AsyncClient() as client:
        tasks = []
        for review in reviews:
            tasks.append(analyze_sentiment(client, review.content, review.score))
            tasks.append(analyze_priority(client, review.content, review.score))

        results = await asyncio.gather(*tasks, return_exceptions=True)

    # 7. Combine results
    analyzed = []
    for i, review in enumerate(reviews):
        sent_result = results[i * 2]
        prio_result = results[i * 2 + 1]

        # Graceful degradation on errors
        sentiment = sent_result if isinstance(sent_result, str) else "neutral"
        is_priority = prio_result if isinstance(prio_result, bool) else False

        analyzed.append(
            AnalyzedReviewResponse(
                **review.model_dump(),
                sentiment=sentiment,
                is_priority=is_priority,
            )
        )

    return FetchAndAnalyzeResponse(
        app_id=app_id,
        app_name=app_name,
        total_analyzed=len(analyzed),
        reviews=analyzed,
    )
```

Key details:
- `return_exceptions=True` in `asyncio.gather` — if one Groq call fails, it doesn't blow up the entire batch. We default to `neutral`/`false` for failed calls.
- Reuses `httpx.AsyncClient` across all 50 calls — connection pooling.
- The interleaved results pattern: `results = [sent_1, prio_1, sent_2, prio_2, ...]`

---

### Phase 6: Update models

**File: `app/models/analysis.py`**

```python
from typing import Literal
from pydantic import BaseModel


class AnalysisResult(BaseModel):
    review_id: str
    sentiment: Literal["positive", "neutral", "negative"]
    is_priority: bool
```

Dropped `suggested_response` and `priority: str (low/medium/high)` — not in scope for now. Priority is now a simple boolean. Sentiment is a literal union for type safety.

---

## Files to create/modify

| File | Action |
|---|---|
| `app/core/config.py` | Add `MAX_REVIEWS_TO_ANALYZE`, `GROQ_MODEL` |
| `app/services/scraper.py` | Add `fetch_reviews_paginated()` using `reviews()` |
| `app/services/groq_service.py` | Implement `analyze_sentiment()` + `analyze_priority()` (async) |
| `app/schemas/api.py` | Add `FetchAndAnalyzeRequest`, `AnalyzedReviewResponse`, `FetchAndAnalyzeResponse` |
| `app/routers/analysis.py` | Add `POST /fetch-and-analyze` with parallel execution |
| `app/models/analysis.py` | Update `AnalysisResult` to match new schema |

---

## Dependency to add

```
uv add httpx
```

We need `httpx` for async HTTP calls to Groq. (Or `groq` official SDK — but `httpx` is lighter and gives us full control over connection pooling and concurrency.)

---

## Future considerations (out of scope for now)

- **Caching**: If the same review is analyzed twice, we're wasting Groq calls. Could hash `review_id + content` and cache results in Supabase.
- **Batching**: Instead of 50 individual calls, send 5-10 reviews per request and ask for JSON array output. Reduces overhead but complicates parsing.
- **Streaming**: For a frontend loading indicator, use SSE to stream analysis results as they arrive.
- **Rate limiting**: Groq is generous, but adding a semaphore (`asyncio.Semaphore(50)`) is good practice.
