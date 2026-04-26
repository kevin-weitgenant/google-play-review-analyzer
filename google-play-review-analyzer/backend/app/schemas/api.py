# API request/response schemas for OpenAPI spec

from datetime import datetime

from pydantic import BaseModel, Field


class FetchReviewsRequest(BaseModel):
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
        examples=["newest", "relevant"],
    )
    filter_score: int | None = Field(
        default=None,
        description="Filter by star rating (1-5). None means all scores.",
        ge=1,
        le=5,
    )
    since: datetime | None = Field(
        default=None,
        description="Only include reviews created on or after this date (ISO 8601).",
        examples=["2025-01-01T00:00:00Z"],
    )


class ReviewResponse(BaseModel):
    review_id: str
    user_name: str
    content: str
    score: int
    thumbs_up_count: int
    review_created_version: str | None
    at: datetime
    reply_content: str | None
    replied_at: datetime | None
    app_version: str | None


class FetchReviewsResponse(BaseModel):
    app_id: str
    app_name: str
    total_reviews: int
    reviews: list[ReviewResponse]
