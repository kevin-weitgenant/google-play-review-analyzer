# Plan 8: Deploy to Render

## Goal
Deploy the Google Play Review Analyzer (FastAPI backend + React frontend) as a single Dockerized service on Render, with FastAPI serving the built React static files.

## Current State
- **Backend**: FastAPI app at `backend/app/main.py`, dependencies in `backend/pyproject.toml` / `uv.lock`
- **Frontend**: Vite+React+TS app at `frontend/`, uses `pnpm`, API calls hardcoded to `http://localhost:8000`
- No Dockerfile exists, no static file serving configured

## Changes Required

### 1. Frontend: Make API base URL dynamic via env var
- **File**: `frontend/src/api/axios-instance.ts`
- Use `import.meta.env.VITE_API_URL` (defaults to empty string = relative URL in production)
- This way in production the frontend calls `/api/...` on the same origin (served by FastAPI)

### 2. Frontend: Create `.env.production`
- **File**: `frontend/.env.production` (new)
- Set `VITE_API_URL=` (empty, so API calls go to same origin)

### 3. Backend: Conditionally serve React static files from FastAPI
- **File**: `backend/app/main.py`
- Check `settings.app_env` — if `"production"`, mount `StaticFiles` from the `dist/` directory at `/`
- In production: mount built frontend as static assets (after API routes)
- In production: add a catch-all fallback route that serves `index.html` for client-side routing (SPA support)
- In development: **do not** serve static files (Vite dev server handles the frontend)
- Update CORS: in development allow `http://localhost:5173`, in production allow same-origin (no special CORS needed)
- `/health` endpoint already exists ✓

### 4. Root: Create Dockerfile (multi-stage)
- **File**: `Dockerfile` (new, at project root)
- Inspired by the reference Dockerfile, adapted to our `backend/` + `frontend/` structure:
  - **Builder stage**: `ghcr.io/astral-sh/uv:python3.12-bookworm-slim`
    - Install Node.js 20 + pnpm
    - Install Python deps (`uv sync`) in `backend/`
    - Install frontend deps (`pnpm install`) in `frontend/`
    - Build frontend (`pnpm build`)
  - **Runtime stage**: `python:3.12-slim-bookworm`
    - Copy `.venv` from builder
    - Copy `backend/` source
    - Copy `frontend/dist/` → `/app/dist`
    - Expose 8000
    - CMD: `uvicorn app.main:app --host 0.0.0.0 --port 8000`
    - PYTHONPATH set to `/app` so `app.main` resolves correctly

### 5. Root: Create `.dockerignore`
- **File**: `.dockerignore` (new)
- Exclude: `node_modules`, `.venv`, `dist`, `__pycache__`, `.git`, `.env` (secrets set via Render env vars)

### 6. Render configuration
- **Service type**: Web Service → Docker
- **Environment variables** (set in Render dashboard):
  - `GROQ_API_KEY`
  - `APP_ENV=production`

## File Summary

| File | Action |
|------|--------|
| `frontend/src/api/axios-instance.ts` | Edit – use `VITE_API_URL` env var |
| `frontend/.env.production` | Create – empty `VITE_API_URL` |
| `backend/app/main.py` | Edit – add StaticFiles mount + SPA fallback |
| `Dockerfile` | Create – multi-stage build |
| `.dockerignore` | Create – exclude build artifacts |
