# Google Play Review Analyzer

Full-stack app to scrape Google Play reviews, classify sentiment & priority via Groq LLM, and display AI-generated suggestions in a React UI.

## Tech Stack

- **Backend**: FastAPI + UV
- **Frontend**: React + Vite + TypeScript
- **API Codegen**: Orval (Axios + React Query)
- **Database**: PostgreSQL (Supabase)
- **Styling**: Tailwind CSS + Shadcn

## Getting Started

### Backend
```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
pnpm install
pnpm dev
```

### Generate API Client (requires backend running)
```bash
cd frontend
pnpm generate-api
```
