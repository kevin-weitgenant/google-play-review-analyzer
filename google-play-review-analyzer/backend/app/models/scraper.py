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
