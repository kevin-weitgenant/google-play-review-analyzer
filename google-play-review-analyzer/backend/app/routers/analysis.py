from fastapi import APIRouter

router = APIRouter(prefix="/analysis", tags=["analysis"])


@router.post("/{review_id}")
def analyze_review(review_id: str):
    return {"message": f"TODO: analyze review {review_id}"}
