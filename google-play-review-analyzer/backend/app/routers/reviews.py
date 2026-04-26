import asyncio

import httpx
from fastapi import APIRouter, HTTPException

from app.models.scraper import GooglePlayReview
from app.schemas.api import (
    FetchReviewsRequest,
    FetchReviewsResponse,
    FetchAndAnalyzeRequest,
    FetchAndAnalyzeResponse,
    ReviewResponse,
    AnalyzedReviewResponse,
)
from app.core.config import settings
from app.services.scraper import extract_app_id, fetch_reviews_paginated, get_app_name
from app.services.groq_service import analyze_sentiment, analyze_priority

router = APIRouter(prefix="/reviews", tags=["reviews"])


def _to_response(review: GooglePlayReview) -> ReviewResponse:
    """Convert a scraper model (camelCase) to an API response (snake_case)."""
    return ReviewResponse(
        review_id=review.reviewId,
        user_name=review.userName,
        user_image=review.userImage,
        content=review.content,
        score=review.score,
        thumbs_up_count=review.thumbsUpCount,
        review_created_version=review.reviewCreatedVersion,
        at=review.at,
        reply_content=review.replyContent,
        replied_at=review.repliedAt,
        app_version=review.appVersion,
    )


@router.get("/")
def get_reviews():
    return {"message": "TODO: fetch reviews from database"}


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
            count=settings.max_reviews_to_fetch,
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


@router.post("/fetch-and-analyze", response_model=FetchAndAnalyzeResponse)
async def fetch_and_analyze(request: FetchAndAnalyzeRequest):
    # 1. Scrape reviews
    try:
        parsed = extract_app_id(request.url)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    app_id = parsed["app_id"]
    lang = parsed["lang"]
    country = parsed["country"]

    try:
        app_name = get_app_name(app_id, lang=lang, country=country)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch app details: {e}")

    try:
        raw_reviews = fetch_reviews_paginated(
            app_id=app_id,
            lang=lang,
            country=country,
            sort=request.sort,
            filter_score=request.filter_score,
            count=settings.max_reviews_to_fetch,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch reviews: {e}")

    # 2. Convert to API response models
    reviews = [_to_response(r) for r in raw_reviews]

    # 3. Optional date filter
    if request.since:
        reviews = [r for r in reviews if r.at >= request.since]

    # 4. AI analysis — 2 calls per review, all concurrent
    #    Layout: [sent_1, prio_1, sent_2, prio_2, ..., sent_N, prio_N]
    async with httpx.AsyncClient() as client:
        tasks = []
        for review in reviews:
            tasks.append(
                analyze_sentiment(
                    client,
                    review.content,
                    instructions=request.sentiment_instructions,
                )
            )
            tasks.append(
                analyze_priority(
                    client,
                    review.content,
                    instructions=request.priority_instructions,
                )
            )

        results = await asyncio.gather(*tasks, return_exceptions=True)

    # 5. Merge AI results into review objects
    analyzed = []
    for i, review in enumerate(reviews):
        sent_result = results[i * 2]       # sentiment call
        prio_result = results[i * 2 + 1]   # priority call

        # Graceful degradation on errors
        sentiment = sent_result if isinstance(sent_result, str) else "neutral"
        priority = prio_result if isinstance(prio_result, str) else "low"

        analyzed.append(
            AnalyzedReviewResponse(
                **review.model_dump(),
                sentiment=sentiment,
                priority=priority,
            )
        )

    return FetchAndAnalyzeResponse(
        app_id=app_id,
        app_name=app_name,
        total_analyzed=len(analyzed),
        reviews=analyzed,
    )
