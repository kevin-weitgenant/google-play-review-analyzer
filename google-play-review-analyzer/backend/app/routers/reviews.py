from fastapi import APIRouter

router = APIRouter(prefix="/reviews", tags=["reviews"])


@router.get("/")
def get_reviews():
    return {"message": "TODO: fetch reviews from database"}


@router.post("/fetch")
def fetch_reviews(app_name: str):
    return {"message": f"TODO: scrape reviews for {app_name}"}
