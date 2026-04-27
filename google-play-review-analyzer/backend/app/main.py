import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.routers import reviews

app = FastAPI(
    title="Google Play Review Analyzer",
    version="0.1.0",
)

# CORS: only needed in development (frontend on different port)
if settings.app_env == "development":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(reviews.router, prefix="/api")


@app.get("/health")
def health_check():
    return {"status": "ok"}


# In production, serve the built React frontend as static files
DIST_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "dist")

if settings.app_env == "production" and os.path.isdir(DIST_DIR):
    # Mount static assets (js, css, images, etc.)
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST_DIR, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(request: Request, full_path: str):
        """Catch-all: serve index.html for client-side routing."""
        return FileResponse(os.path.join(DIST_DIR, "index.html"))
