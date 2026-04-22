# Plan: Repo Setup — FastAPI + React (Monorepo)

> Google Play Review Analyzer — initial project scaffolding

---

## Decisions Summary

| Decision | Choice |
|---|---|
| Repo structure | Monorepo (`/backend` + `/frontend`) |
| Backend framework | FastAPI |
| Frontend framework | React + Vite |
| Package manager | pnpm |
| Styling | Tailwind CSS + Shadcn (UI not built yet) |
| HTTP client | Axios |
| API codegen | Orval (Axios + React Query) |
| Database | PostgreSQL (Supabase) |
| Auth | Ignored for now |
| Deployment | Ignored for now |

---

## 1. Root — Monorepo Init

```
google-play-review-analyzer/
├── backend/
├── frontend/
├── .gitignore
└── README.md
```

### Steps

1. Create root folder and init git
```bash
mkdir google-play-review-analyzer
cd google-play-review-analyzer
git init
```

2. Create root `.gitignore`
```gitignore
# Python
__pycache__/
*.pyc
.venv/
env/
*.egg-info/

# Node
node_modules/
dist/
.env

# OS
.DS_Store
Thumbs.db
```

---

## 2. Backend — FastAPI Setup

### Folder Structure

```
backend/
├── app/
│   ├── main.py              # FastAPI app entry point
│   ├── core/
│   │   ├── config.py         # Settings (env vars, Supabase creds)
│   │   └── database.py       # Supabase client setup
│   ├── models/
│   │   ├── review.py         # Pydantic models for reviews
│   │   └── analysis.py       # Pydantic models for AI analysis
│   ├── routers/
│   │   ├── reviews.py        # GET /reviews, POST /reviews/fetch
│   │   └── analysis.py       # POST /analysis/{review_id}
│   ├── services/
│   │   ├── scraper.py        # google-play-scraper logic
│   │   └── groq_service.py   # Groq LLM integration
│   └── schemas/
│       └── api.py            # Request/Response schemas for OpenAPI
├── pyproject.toml
├── uv.lock
├── .python-version
├── .env.example
└── README.md
```

### Steps

1. Initialize project with UV
```bash
cd backend
uv init
uv venv
```

> This creates a `pyproject.toml` and `.python-version` file. Delete the auto-generated `hello.py` if present.

2. Install dependencies
```bash
uv add fastapi "uvicorn[standard]" pydantic pydantic-settings google-play-scraper groq supabase python-dotenv httpx
```

> UV manages everything via `pyproject.toml` + `uv.lock`. No `requirements.txt` needed.

3. Create `.env.example`
```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-key

# Groq
GROQ_API_KEY=your-groq-api-key

# App
APP_ENV=development
```

4. Create `app/main.py` — minimal FastAPI app with CORS enabled (for frontend dev)
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Google Play Review Analyzer",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "ok"}
```

5. Run the server to verify
```bash
uv run uvicorn app.main:app --reload --port 8000
```

> Visit `http://localhost:8000/docs` — FastAPI auto-generates the OpenAPI spec we need for Orval.

---

## 3. Frontend — React + Vite + Tailwind + Shadcn + Orval

### Folder Structure

```
frontend/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── api/                   # Orval-generated code (auto-generated, gitignored)
│   ├── components/            # Shadcn components will go here
│   │   └── ui/
│   ├── hooks/                 # Custom hooks (if needed)
│   └── lib/
│       └── utils.ts           # Shadcn utility (cn function)
├── orval.config.ts            # Orval configuration
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── components.json            # Shadcn config
├── .env.example
└── README.md
```

### Steps

1. Scaffold React + Vite with TypeScript
```bash
pnpm create vite frontend --template react-ts
cd frontend
pnpm install
```

2. Install Tailwind CSS
```bash
pnpm add -D tailwindcss @tailwindcss/vite
```

Configure `vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
```

Update `src/index.css`:
```css
@import "tailwindcss";
```

3. Initialize Shadcn
```bash
pnpm dlx shadcn@latest init
```
> This sets up `components.json`, `src/lib/utils.ts`, and Tailwind CSS variables. When prompted, choose:
> - Style: **New York**
> - Base color: **Neutral** (or your preference)
> - CSS variables: **Yes**

4. Install Orval dependencies
```bash
pnpm add axios @tanstack/react-query
pnpm add -D orval
```

5. Create `orval.config.ts`
```ts
import { defineConfig } from "orval";

export default defineConfig({
  input: {
    target: "http://localhost:8000/openapi.json",
  },
  output: {
    client: "axios",
    target: "./src/api/endpoints.ts",
    schemas: "./src/api/models",
    mode: "tags-split",
    override: {
      mutator: {
        path: "./src/api/axios-instance.ts",
        name: "customInstance",
      },
    },
  },
});
```

6. Create `src/api/axios-instance.ts` (custom Axios instance for Orval)
```ts
import Axios from "axios";

const axiosInstance = Axios.create({
  baseURL: "http://localhost:8000",
});

export const customInstance = <T>(config: Parameters<typeof axiosInstance>[0]) => {
  return axiosInstance(config).then((res) => res.data as T);
};

export default axiosInstance;
```

7. Add scripts to `package.json`
```jsonc
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "generate-api": "orval --config orval.config.ts"
  }
}
```

8. Generate API client (make sure backend is running on :8000)
```bash
pnpm generate-api
```

> This reads the OpenAPI spec from FastAPI and generates:
> - TypeScript types for all request/response models
> - Axios-based API functions
> - React Query hooks (`useGetHealth`, etc.) ready to use

9. Create `.env.example`
```env
VITE_API_BASE_URL=http://localhost:8000
```

---

## 4. Setup React Query Provider

Wrap the app with React Query so generated hooks work:

```tsx
// src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
```

---

## 5. Gitignore — Add Orval Generated Files (Optional)

Add to `frontend/.gitignore` if you want to regenerate on each build:
```
src/api/endpoints.ts
src/api/models/
```

> **Tip**: Committing generated files is fine for small teams. Ignoring them means every dev runs `pnpm generate-api` after pulling.

---

## 6. Verification Checklist

After setup, verify everything works:

- [ ] `git init` in root folder
- [ ] Backend: `uv run uvicorn app.main:app --reload` → visit `http://localhost:8000/docs`
- [ ] Backend: OpenAPI JSON at `http://localhost:8000/openapi.json` loads
- [ ] Frontend: `pnpm dev` → Vite dev server runs at `http://localhost:5173`
- [ ] Tailwind: utility classes work (e.g., `className="text-red-500"`)
- [ ] Orval: `pnpm generate-api` runs without errors and generates files in `src/api/`
- [ ] React Query: `useQuery` hooks from generated code return data from backend
- [ ] CORS: frontend can call backend without CORS errors

---

## 7. VS Code Tasks

Three tasks are configured in `.vscode/tasks.json` for quick dev-server startup:

| Task Label | What it does |
|---|---|
| **Backend: Start Dev Server** | `uv run uvicorn app.main:app --reload --port 8000` (cwd: `backend/`) |
| **Frontend: Start Dev Server** | `pnpm dev` (cwd: `frontend/`) |
| **Dev: Start Both (Frontend + Backend)** | Runs the two tasks above in parallel (default build task) |

### How to use

1. Open the Command Palette → **Tasks: Run Task** → pick any task above.
2. Or press **Ctrl+Shift+B** (Run Build Task) — it runs "Dev: Start Both" by default since it's marked as the default build task.
3. Both servers open in dedicated terminal panels grouped under `dev-servers`.

---

## 8. Setup Execution Status

| Step | Status |
|---|---|
| Root monorepo + git init + .gitignore + README.md | ✅ |
| Backend: UV + FastAPI + folder structure + deps | ✅ |
| Backend: main.py with routers + CORS + health check | ✅ |
| Frontend: Vite + React + TS + pnpm | ✅ |
| Frontend: Tailwind CSS | ✅ |
| Frontend: Axios + React Query + Orval config | ✅ |
| Frontend: main.tsx with QueryClientProvider | ✅ |
| Frontend: generate-api script in package.json | ✅ |
| Shadcn | ⏭️ Skipped (you'll do later) |
| Orval codegen | ⏭️ Skipped (no real routes yet) |
| VS Code tasks (backend / frontend / both) | ✅ |

---

## 9. What's NOT in This Plan

These are deferred to future plans:

- Database schema & Supabase table creation
- Scraper service (google-play-scraper integration)
- Groq LLM service (sentiment analysis + response generation)
- Shadcn UI components & page layouts
- Authentication
- Deployment (Docker, AWS, etc.)
- AWS Lambda for periodic fetching & notifications
