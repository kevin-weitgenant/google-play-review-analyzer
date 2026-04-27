# Plan 5 — Connect Frontend to Backend via Orval

## Goal
Replace the hardcoded mock data in the UI with real backend API calls. When the user pastes a Google Play URL and clicks "Analisar agora", it hits `POST /api/reviews/fetch-and-analyze` and displays the real analyzed reviews in the kanban board.

**Strategy:** Instead of building an adapter/mapping layer, change the UI's internal types to match the backend's values directly. The UI speaks the same language as the API — no translation needed. Display labels (column headers, badges) use lookup objects to render Portuguese text from the raw `"positive"` / `"high"` etc. values.

---

## Backend API Summary

### `POST /api/reviews/fetch-and-analyze`

**Request body:**
```json
{
  "url": "https://play.google.com/store/apps/details?id=com.example.app",
  "sort": "newest",
  "filter_score": null,
  "since": null,
  "sentiment_instructions": "",
  "priority_instructions": ""
}
```

**Response body:**
```json
{
  "app_id": "com.example.app",
  "app_name": "Example App",
  "total_analyzed": 6,
  "reviews": [
    {
      "review_id": "gp:...",
      "user_name": "Carlos M.",
      "user_image": "https://...",
      "content": "Aplicativo incrível! ...",
      "score": 5,
      "thumbs_up_count": 0,
      "review_created_version": "3.2.1",
      "at": "2025-04-22T10:00:00Z",
      "reply_content": null,
      "replied_at": null,
      "app_version": "3.2.1",
      "sentiment": "positive",
      "priority": "low"
    }
  ]
}
```

---

## New UI types — match backend exactly

The `Review` interface, `Sentiment`, `Priority` types, and all config/label objects are rewritten to use the backend's raw values. No adapter, no mapping function.

```typescript
// Use backend values directly
type Sentiment = "positive" | "neutral" | "negative"
type Priority = "high" | "medium" | "low"

interface Review {
  // Backend fields — kept exactly as-is from the API
  review_id: string
  user_name: string
  user_image: string
  content: string
  score: number
  thumbs_up_count: number
  review_created_version: string | null
  at: string                   // ISO datetime, format for display at render time
  reply_content: string | null
  replied_at: string | null
  app_version: string | null
  sentiment: Sentiment
  priority: Priority

  // Client-only (not from backend)
  ai_response: string | null   // AI-generated reply (simulated for now)
  done: boolean                // marked as responded
}

// Top-level response shape (stored in state)
interface AnalysisData {
  app_id: string
  app_name: string
  total_analyzed: number
  reviews: Review[]
}
```

### Display label objects — the only "translation" layer

Instead of converting values, we just look up the display label when rendering:

```typescript
const SENTIMENT_LABELS: Record<Sentiment, string> = {
  positive: "Positivo",
  neutral: "Neutro",
  negative: "Negativo",
}

const PRIORITY_LABELS: Record<Priority, string> = {
  high: "Urgente",
  medium: "Alta",
  low: "Normal",
}
```

The `COLUMN_CONFIG` and `PRIORITY_CONFIG` objects get keyed by `"positive"` / `"neutral"` / `"negative"` and `"high"` / `"medium"` / `"low"` respectively. Their `label` fields use the Portuguese display text. Everything else (colors, borders) stays the same.

---

## What changes in the component

### Constants / lookups

| Before | After |
|---|---|
| `Sentiment = "Positivo" \| "Neutro" \| "Negativo"` | `Sentiment = "positive" \| "neutral" \| "negative"` |
| `Priority = "Normal" \| "Alta" \| "Urgente"` | `Priority = "high" \| "medium" \| "low"` |
| `COLUMN_CONFIG` keyed by `"Positivo"`, etc. | Keyed by `"positive"`, `"neutral"`, `"negative"` |
| `PRIORITY_CONFIG` keyed by `"Urgente"`, etc. | Keyed by `"high"`, `"medium"`, `"low"` |
| `columns = ["Positivo", "Neutro", "Negativo"]` | `columns = ["positive", "neutral", "negative"] as const` |

### Review interface

| Before | After | Notes |
|---|---|---|
| `id: number` | `review_id: string` | Backend uses string IDs |
| `author: string` | `user_name: string` | Direct from API |
| `avatar: string` | _(removed)_ | Derive initials at render from `user_name` |
| `stars: number` | `score: number` | Direct from API |
| `date: string` | `at: string` | ISO string, format for display at render |
| `text: string` | `content: string` | Direct from API |
| `sentiment: Sentiment` | `sentiment: Sentiment` | Same name, new values |
| `priority: Priority` | `priority: Priority` | Same name, new values |
| _(missing)_ | `user_image: string` | NEW — avatar URL |
| _(missing)_ | `thumbs_up_count: number` | NEW — helpfulness |
| _(missing)_ | `app_version: string \| null` | NEW — app version |
| _(missing)_ | `reply_content: string \| null` | NEW — dev reply |
| _(missing)_ | `replied_at: string \| null` | NEW — dev reply date |
| `response: string \| null` | `ai_response: string \| null` | Renamed for clarity, still simulated |
| `done: boolean` | `done: boolean` | Client-only, unchanged |

### All references updated in-place

Every place that used `r.author` → `r.user_name`, `r.stars` → `r.score`, `r.text` → `r.content`, `r.date` → formatted `r.at`, `r.id` → `r.review_id`, `r.avatar` → derived initials from `r.user_name`, `r.response` → `r.ai_response`.

No adapter function. No mapping step. The orval response feeds straight into state after appending `ai_response: null, done: false` to each review.

---

## Steps

### Step 1 — Generate typed API client with Orval

- Ensure the backend is running at `http://localhost:8000`
- Run `pnpm generate-api`
- This generates `src/api/endpoints.ts` and `src/api/models/` with typed functions and types

**Files changed:** `src/api/endpoints.ts`, `src/api/models/` (auto-generated)

### Step 2 — Create `useAnalyzeReviews` hook

- Create `src/hooks/useAnalyzeReviews.ts`
- Uses `@tanstack/react-query`'s `useMutation` wrapping the orval-generated `postReviewsFetchAndAnalyze`
- On success, appends `ai_response: null, done: false` to each review (the only transformation — just adding client-only fields)
- Exposes: `{ mutateAsync: analyze, isPending, error, data }`
- Passes `sentiment_instructions` and `priority_instructions` from config state

**Files changed:** `src/hooks/useAnalyzeReviews.ts` (new)

### Step 3 — Rewrite types, constants, and all references in `design-kanban.tsx`

This is the bulk of the work. Changes in order:

**3a. Types:** Replace `Sentiment`, `Priority`, `Review`, remove `INITIAL_REVIEWS`, add `AnalysisData`

**3b. Constants:** Re-key `COLUMN_CONFIG` and `PRIORITY_CONFIG` with backend values. Add `SENTIMENT_LABELS` and `PRIORITY_LABELS` display maps.

**3c. Helper — format date:** Add a small `formatDate(iso: string) → string` helper (e.g. `"2025-04-22T10:00:00Z"` → `"22 abr"`)

**3d. Helper — get initials:** Add `getInitials(name: string) → string` (e.g. `"Carlos M."` → `"CM"`) — used for avatar fallback

**3e. State:** Add `analysisData: AnalysisData | null` state. Remove `INITIAL_REVIEWS`, reviews start as `[]`.

**3f. Input step:** Wire "Analisar agora" to call `analyze()`. Add loading state. On success, set `analysisData` + `reviews` + switch to board. On error, show error message.

**3g. All `r.` references:** Bulk-rename every field access throughout the component to use the new backend field names.

**3h. Avatar rendering:** Replace the initials circle with `<img src={r.user_image}>` + initials fallback on error.

**3i. Card additions:** Show thumbs up count, existing reply indicator (💬).

**3j. Drawer additions:** Show app version, thumbs up, developer reply section.

**3k. Header:** Show `app_name`, `total_analyzed`.

**3l. AI Config modal:** Wire `priority_instructions` and `sentiment_instructions` to the API call. Keep `simulateAIResponse` for reply generation with a TODO comment.

**Files changed:** `src/components/design-kanban.tsx`

### Step 4 — Write integration test against the real backend

Before wiring the UI, verify that the orval-generated client + `useAnalyzeReviews` hook actually call the real backend and return data in the shape the UI expects.

**No mocks.** This test hits `http://localhost:8000` for real. The backend must be running.

**Prerequisites:**
- Backend running: `uv run uvicorn app.main:app --reload` (in the `backend/` directory)
- Backend has a valid `GROQ_API_KEY` in `.env` (the analyze endpoint calls Groq)

**Setup:**
- Install test dependencies: `vitest`, `@testing-library/react`
- Add a `vitest.config.ts` that extends the Vite config
- Add `"test"` script to `package.json`

**Test file:** `src/hooks/__tests__/useAnalyzeReviews.test.ts`

**What it tests — one happy path test that proves the whole chain works:**

1. Render a test component that uses `useAnalyzeReviews` inside a `QueryClientProvider`
2. Call `analyze({ url: "https://play.google.com/store/apps/details?id=com.devsisters.cookie" })` — a real Google Play URL for a popular app (Cookie Run: OvenBreak)
3. Wait for the mutation to settle (long timeout — the backend scrapes + calls Groq for each review, can take 30-60s)
4. Assert success:
   - `error` is `null`
   - `data` is not `null`
   - `data.app_name` is a non-empty string
   - `data.app_id` is a non-empty string
   - `data.total_analyzed` is a number > 0
   - `data.reviews` is an array with length > 0
5. Assert **every review** has all expected fields with correct types:
   - `review_id`: string, non-empty
   - `user_name`: string, non-empty
   - `user_image`: string (URL)
   - `content`: string
   - `score`: number between 1-5
   - `thumbs_up_count`: number ≥ 0
   - `at`: string (valid ISO datetime)
   - `sentiment`: one of `"positive" | "neutral" | "negative"`
   - `priority`: one of `"high" | "medium" | "low"`
   - `app_version`: string or null
   - `reply_content`: string or null
   - `replied_at`: string or null (ISO datetime) or null
   - `review_created_version`: string or null
6. Assert the hook appended client-only fields:
   - Each review has `ai_response === null`
   - Each review has `done === false`
7. Assert at least one review exists in each sentiment category? No — this is nondeterministic. Instead just assert the `sentiment` values are all valid.

**What we do NOT test (nondeterministic / backend responsibility):**
- Exact sentiment or priority values (that's the backend + Groq's job, nondeterministic)
- Exact number of reviews (depends on what Google Play returns that day)
- Performance / latency

**Running the test:**
```bash
# Terminal 1 — start backend
cd backend && uv run uvicorn app.main:app --reload

# Terminal 2 — run test
cd frontend && pnpm test
```

The test has a generous timeout (90s) because the backend does real scraping + AI analysis.

**Why this matters:**
- Proves the orval-generated client actually hits the right endpoint with the right request shape
- Proves the backend response matches what the frontend expects — field names, types, enums
- Proves the `useAnalyzeReviews` hook correctly appends `ai_response` and `done`
- If the backend changes its response schema, this test breaks immediately
- Catches CORS issues, network errors, wrong URLs — things mocks can never catch

**Files changed:**
- `vitest.config.ts` (new)
- `src/hooks/__tests__/useAnalyzeReviews.test.ts` (new)
- `package.json` (add devDependencies + test script)

### Step 5 — Wire the UI and test end-to-end manually

- Start backend: `uv run uvicorn app.main:app --reload`
- Run the automated test: `pnpm test` (confirms the API contract)
- Start frontend: `pnpm dev`
- Paste a real Google Play URL → click "Analisar agora"
- Verify:
  - Loading state appears during analysis
  - Reviews appear in correct kanban columns
  - Priority badges show correct labels (Urgente/Alta/Normal)
  - User avatars load (initials fallback on error)
  - Thumbs up count shows on cards that have it
  - App name shows in header
  - Detail drawer shows app version, developer reply (if any), thumbs up
  - AI Config modal values pass through on next analysis
  - Drag-and-drop still works (client-side only)
  - "Novo app" button resets back to input screen

---

## What stays mock / not yet implemented

- **AI response generation** — Backend has no endpoint yet. `simulateAIResponse` stays with a `// TODO` comment.
- **Persistence** — No backend DB storage. Reviews live in React state only (lost on refresh).
- **Drag-and-drop sentiment change** — Client-side only. No PATCH endpoint.

---

## Risk / Notes

- The backend must be running at `http://localhost:8000` for orval codegen AND for the app to work at runtime
- CORS is already configured on the backend to allow `http://localhost:5173`
- `max_reviews_to_fetch` is capped at 25 on the backend — kanban won't have hundreds of cards
- AI analysis is concurrent on the backend but still takes time (Groq API calls). Frontend loading state must be clear
- `user_image` URLs from Google Play may expire or be blocked — initials fallback handles this
- `review_id` as string means all `key={r.review_id}` and comparisons work fine (React keys accept strings)
- Only "transformation" is adding `ai_response: null` + `done: false` to each review — everything else is used as-is from the API response
