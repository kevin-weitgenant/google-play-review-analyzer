from fastapi import APIRouter, HTTPException

from app.schemas.api import FetchReviewsRequest, FetchReviewsResponse
from app.services.scraper import extract_app_id, fetch_all_reviews, get_app_name

router = APIRouter(prefix="/reviews", tags=["reviews"])


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

    # 3. Fetch reviews
    try:
        reviews = fetch_all_reviews(
            app_id=app_id,
            lang=lang,
            country=country,
            sort=request.sort,
            filter_score=request.filter_score,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch reviews: {str(e)}",
        )

    return FetchReviewsResponse(
        app_id=app_id,
        app_name=app_name,
        total_reviews=len(reviews),
        reviews=reviews,
    )
