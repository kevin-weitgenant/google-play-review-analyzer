# Plan: Type the Scraper Output with Pydantic

> Replace the untyped `list[dict]` from `google-play-scraper` with a validated Pydantic model.

---

## Problem

`google-play-scraper` returns `list[dict]` with no type information. The library has no types, no stubs, no `py.typed`. Currently `scraper.py` manually loops over the raw dicts with `.get()` calls — everything is `Any`, and if the library ever changes its output shape, we'd never know until something breaks at runtime.

---

## What the Library Returns

The library source (`ElementSpecs.Review`) defines exactly 11 keys:

```
reviewId                → str           (always present)
userName                → str           (always present)
userImage               → str           (always present)
content                 → str           (always present)
score                   → int           (always present)
thumbsUpCount           → int           (always present)
reviewCreatedVersion    → str | None    (fallback None)
at                      → datetime      (always present, library converts from timestamp)
replyContent            → str | None    (fallback None)
repliedAt               → datetime | None (fallback None)
appVersion              → str | None    (fallback None)
```

---

## The Model

### New file: `app/models/scraper.py`

```python
from datetime import datetime

from pydantic import BaseModel


class GooglePlayReview(BaseModel):
    """Exact shape of what google-play-scraper returns per review.

    Field names match the library's camelCase keys so model_validate()
    works directly on the raw dicts without any aliasing.
    """

    reviewId: str
    userName: str
    userImage: str
    content: str
    score: int
    thumbsUpCount: int
    reviewCreatedVersion: str | None = None
    at: datetime
    replyContent: str | None = None
    repliedAt: datetime | None = None
    appVersion: str | None = None
```

**Why camelCase field names?** The model represents an external library's output. Using the same names means `GooglePlayReview.model_validate(raw_dict)` works with zero transformation. It's clear these aren't "our" fields — they're the scraper's.

**Why not use aliases?** We could define `review_id: str = Field(alias="reviewId")` etc., but that adds 11 aliases for no real benefit. The model lives in `services/` context, not in our API layer. Keep it simple.

---

## Changes to `app/services/scraper.py`

### What gets removed

The entire normalization loop at the bottom of `fetch_all_reviews()`:

```python
# DELETE THIS — manual camelCase → snake_case with .get() on untyped dicts
normalized = []
for r in raw_reviews:
    normalized.append({
        "review_id": r.get("reviewId", ""),
        "user_name": r.get("userName", ""),
        ...
    })
```

Also remove the datetime → ISO string conversion loop — Pydantic holds `datetime` objects, the API schema handles serialization.

### What gets added

```python
from app.models.scraper import GooglePlayReview

def fetch_all_reviews(...) -> list[GooglePlayReview]:
    ...
    raw_reviews = reviews_all(**kwargs)

    # Parse + validate each raw dict through Pydantic
    return [GooglePlayReview.model_validate(r) for r in raw_reviews]
```

### What happens now

| Before | After |
|---|---|
| Returns `list[dict]` — every key access is `Any` | Returns `list[GooglePlayReview]` — fully typed |
| `.get("reviewId")` returns `Any` | `review.reviewId` returns `str` (pyright knows) |
| Bad data from library passes silently | Pydantic raises `ValidationError` if a field has the wrong type |
| Manual datetime → ISO conversion | Model holds `datetime`, conversion happens at the API layer |

---

## Changes to `app/schemas/api.py`

Update `ReviewResponse` to use `datetime` instead of `str` for date fields:

```python
from datetime import datetime

class ReviewResponse(BaseModel):
    review_id: str
    user_name: str
    content: str
    score: int
    thumbs_up_count: int
    review_created_version: str | None
    at: datetime                    # was: str
    reply_content: str | None
    replied_at: datetime | None     # was: str
    app_version: str | None
```

**Why?** FastAPI automatically serializes `datetime` fields to ISO strings in the JSON response. So the output is identical, but now both the OpenAPI spec and Orval-generated TypeScript types correctly show these as datetime, not "string". This is more correct.

---

## Changes to `app/routers/reviews.py`

The router now maps between the two models:

```python
from app.models.scraper import GooglePlayReview
from app.schemas.api import ReviewResponse

# Helper to convert
def _to_response(review: GooglePlayReview) -> ReviewResponse:
    return ReviewResponse(
        review_id=review.reviewId,
        user_name=review.userName,
        content=review.content,
        score=review.score,
        thumbs_up_count=review.thumbsUpCount,
        review_created_version=review.reviewCreatedVersion,
        at=review.at,
        reply_content=review.replyContent,
        replied_at=review.repliedAt,
        app_version=review.appVersion,
    )

# In the endpoint:
reviews = fetch_all_reviews(...)
return FetchReviewsResponse(
    app_id=app_id,
    app_name=app_name,
    total_reviews=len(reviews),
    reviews=[_to_response(r) for r in reviews],
)
```

Every field is typed on both sides. Pyright will catch any mismatch (wrong name, wrong type, missing field).

---

## Files Changed

| File | Change |
|---|---|
| `app/models/scraper.py` | **NEW** — `GooglePlayReview` Pydantic model |
| `app/services/scraper.py` | Remove normalization loop, parse through Pydantic model, return `list[GooglePlayReview]` |
| `app/schemas/api.py` | `ReviewResponse.at` and `replied_at` change from `str` to `datetime` |
| `app/routers/reviews.py` | Add `_to_response()` helper to map `GooglePlayReview` → `ReviewResponse` |

---

## What This Gives Us

1. **Static typing** — pyright knows the exact type of every field on the scraper output
2. **Runtime validation** — if `google-play-scraper` ever returns garbage (wrong type, missing key), Pydantic raises `ValidationError` immediately instead of silently passing bad data downstream
3. **No more `.get()` on `Any`** — direct attribute access (`review.score`) with known types
4. **Correct OpenAPI spec** — `at` and `replied_at` show as `datetime` not `string`, so Orval generates proper types on the frontend
5. **Mapping is explicit** — the router layer clearly shows the camelCase → snake_case translation, type-checked by pyright

---

## What's NOT in This Plan

- pytest tests (separate concern)
- pyright setup (separate concern)
- Groq LLM service
- Database persistence
