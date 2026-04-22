from pydantic import BaseModel


class ReviewBase(BaseModel):
    review_id: str
    user_name: str
    content: str
    score: int
    app_name: str


class Review(ReviewBase):
    id: int

    model_config = {"from_attributes": True}
