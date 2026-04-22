from pydantic import BaseModel


class AnalysisResult(BaseModel):
    review_id: str
    sentiment: str  # positive, neutral, negative
    priority: str  # low, medium, high
    suggested_response: str


class AnalysisRequest(BaseModel):
    review_id: str
