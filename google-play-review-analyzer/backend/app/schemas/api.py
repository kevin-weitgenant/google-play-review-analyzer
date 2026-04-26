# API request/response schemas for OpenAPI spec

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Prompt assembly: backend owns the structure, frontend adds nuance.
#
# Each prompt is built from 3 parts:
#   1. HEADER (fixed) — describes the task and enforces JSON output
#   2. INSTRUCTIONS (from frontend) — optional extra context/rules
#   3. REVIEW TEXT (fixed) — the actual comment, always at the end
#
# The frontend only controls part 2. It cannot change the task
# or break the JSON output format.
# ---------------------------------------------------------------------------

SENTIMENT_PROMPT_HEADER = (
    "You are a sentiment classifier for app reviews. "
    "Classify the review below as exactly one of: "
    '"positive", "neutral", or "negative".'
)

SENTIMENT_PROMPT_FOOTER = (
    'Respond with a JSON object: {"sentiment": "positive"|"neutral"|"negative"}\n\n'
    "Review:\n"
    "{content}"
)

DEFAULT_SENTIMENT_INSTRUCTIONS = ""

PRIORITY_PROMPT_HEADER = (
    "You are a priority classifier for app reviews. "
    "Classify the review below as exactly one of: "
    '"high", "medium", or "low".\n'
    '"high" = urgent issue that needs immediate attention '
    "(bug, crash, data loss, security vulnerability, app unusable).\n"
    '"medium" = notable problem but not critical '
    "(performance issues, minor bugs, feature requests for existing features).\n"
    '"low" = general feedback, praise, complaints without actionable detail, '
    "or non-urgent suggestions."
)

PRIORITY_PROMPT_FOOTER = (
    'Respond with a JSON object: {"priority": "high"|"medium"|"low"}\n\n'
    "Review:\n"
    "{content}"
)

DEFAULT_PRIORITY_INSTRUCTIONS = ""


# ---------------------------------------------------------------------------
# Scraper-only schemas (existing)
# ---------------------------------------------------------------------------

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
    user_image: str
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


# ---------------------------------------------------------------------------
# Fetch + AI analysis schemas (new)
# ---------------------------------------------------------------------------

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
    sentiment_instructions: str = Field(
        default=DEFAULT_SENTIMENT_INSTRUCTIONS,
        description="Optional extra instructions for sentiment analysis. "
        "Appended between the task description and the review text. "
        "Example: 'Reviews about pricing alone should be neutral, not negative.'",
    )
    priority_instructions: str = Field(
        default=DEFAULT_PRIORITY_INSTRUCTIONS,
        description="Optional extra instructions for priority classification. "
        "Appended between the task description and the review text. "
        "Example: 'Pay special attention to crash reports and login issues.'",
    )


class AnalyzedReviewResponse(ReviewResponse):
    sentiment: Literal["positive", "neutral", "negative"]
    priority: Literal["high", "medium", "low"]


class FetchAndAnalyzeResponse(BaseModel):
    app_id: str
    app_name: str
    total_analyzed: int
    reviews: list[AnalyzedReviewResponse]
