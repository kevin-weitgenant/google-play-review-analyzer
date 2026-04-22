# Scraper service — google-play-scraper integration

from urllib.parse import urlparse, parse_qs

from google_play_scraper import app as app_detail, Sort, reviews_all


VALID_SORTS = {
    "newest": Sort.NEWEST,
    "relevant": Sort.MOST_RELEVANT,
}


def extract_app_id(url: str) -> dict:
    """Parse a Google Play Store URL and extract app_id, lang, and country.

    Raises ValueError if the URL is invalid or missing the 'id' param.
    """
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)

    app_id = qs.get("id", [None])[0]
    if not app_id:
        raise ValueError(
            "Invalid Google Play URL: missing 'id' query parameter. "
            "Example: https://play.google.com/store/apps/details?id=com.example.app"
        )

    # hl → lang, gl → country
    lang = qs.get("hl", ["en"])[0]
    country = qs.get("gl", ["us"])[0]

    # Convert locale format like "pt_BR" → "pt" for google-play-scraper
    if "_" in lang:
        lang = lang.split("_")[0]

    return {"app_id": app_id, "lang": lang, "country": country}


def fetch_all_reviews(
    app_id: str,
    lang: str = "en",
    country: str = "us",
    sort: str = "newest",
    filter_score: int | None = None,
) -> list[dict]:
    """Fetch all reviews for a given app using google-play-scraper.

    Returns a list of review dicts with datetime fields converted to ISO strings.
    """
    sort_enum = VALID_SORTS.get(sort)
    if sort_enum is None:
        raise ValueError(
            f"Invalid sort '{sort}'. Must be one of: {', '.join(VALID_SORTS.keys())}"
        )

    kwargs = {
        "app_id": app_id,
        "lang": lang,
        "country": country,
        "sort": sort_enum,
        "sleep_milliseconds": 500,
    }
    if filter_score is not None:
        kwargs["filter_score_with"] = filter_score

    raw_reviews = reviews_all(**kwargs)

    # Convert datetime fields to ISO strings for JSON serialization
    for review in raw_reviews:
        for dt_field in ("at", "repliedAt"):
            val = review.get(dt_field)
            if val is not None:
                review[dt_field] = val.isoformat()

    # Normalize keys to snake_case for our API response
    normalized = []
    for r in raw_reviews:
        normalized.append(
            {
                "review_id": r.get("reviewId", ""),
                "user_name": r.get("userName", ""),
                "content": r.get("content", ""),
                "score": r.get("score", 0),
                "thumbs_up_count": r.get("thumbsUpCount", 0),
                "review_created_version": r.get("reviewCreatedVersion"),
                "at": r.get("at", ""),
                "reply_content": r.get("replyContent"),
                "replied_at": r.get("repliedAt"),
                "app_version": r.get("appVersion"),
            }
        )

    return normalized


def get_app_name(app_id: str, lang: str = "en", country: str = "us") -> str:
    """Fetch the app's title from Google Play."""
    detail = app_detail(app_id, lang=lang, country=country)
    return detail.get("title", app_id)
