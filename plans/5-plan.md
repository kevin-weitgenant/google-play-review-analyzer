# Plan 5 — Connect Frontend to Backend via Orval

## Goal
Replace the hardcoded mock data in the UI with real backend API calls. When the user pastes a Google Play URL and clicks "Analisar agora", it hits `POST /api/reviews/fetch-and-analyze` and displays the real analyzed reviews in the kanban board.

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

**Key mapping from backend → UI:**

| Backend field        | UI field / usage                        |
|----------------------|-----------------------------------------|
| `user_name`          | `author` + initials for `avatar`        |
| `score`              | `stars`                                 |
| `content`            | `text`                                  |
| `at`                 | `date` (formatted)                      |
| `sentiment`          | Column placement: positive/neutral/negative → Positivo/Neutro/Negativo |
| `priority`           | Badge: high→Urgente, medium→Alta, low→Normal |
| `review_id`          | `id`                                    |

---

## Steps

### Step 1 — Generate typed API client with Orval

- Ensure the backend is running (or at least has an OpenAPI spec accessible)
- Run `pnpm generate-api` to generate `src/api/endpoints.ts` and `src/api/models/`
- This gives us typed functions like `postReviewsFetchAndAnalyze()`

**Files changed:** `src/api/endpoints.ts`, `src/api/models/` (auto-generated)

### Step 2 — Create a thin adapter hook `useAnalyzeReviews`

- Create `src/hooks/useAnalyzeReviews.ts`
- Wraps the orval-generated `postReviewsFetchAndAnalyze` call
- Exposes: `{ mutate: analyze, isPending, error, data }`
- Maps the response into the shape the UI component expects (the `Review` interface)

**Files changed:** `src/hooks/useAnalyzeReviews.ts` (new)

### Step 3 — Refactor `design-kanban.tsx` to use real data

**What changes inside the component:**

1. **Input step ("input" screen):**
   - The link input + "Analisar agora" button stays the same visually
   - On click, call `analyze(link)` instead of `setStep("board")`
   - Show a loading state while the API call is in progress (spinner + "Analisando reviews..." message)
   - On success, set `reviews` to the mapped response data, then `setStep("board")`
   - On error, show an error toast/message

2. **Remove `INITIAL_REVIEWS`** — reviews start as an empty array `[]`
   - Only populated after a successful API call

3. **Map backend response → UI `Review` type:**
   ```
   sentiment: "positive" → "Positivo", "neutral" → "Neutro", "negative" → "Negativo"
   priority: "high" → "Urgente", "medium" → "Alta", "low" → "Normal"
   ```

4. **AI Config modal:**
   - The config fields (`priorityRules`, `responseGuidelines`, `tone`, `language`) map to `sentiment_instructions` and `priority_instructions` in the API request
   - Store these config values and pass them on the next analysis call
   - Note: "response generation" (suggested reply) is NOT in the backend yet — keep the simulated response for now, or remove it and leave the "Gerar resposta" as a placeholder

5. **Review drawer (detail panel):**
   - "Gerar resposta com IA" still uses `simulateAIResponse` (backend doesn't have a response-generation endpoint yet)
   - Everything else (displaying review content, sentiment, priority, mark as done) stays the same

6. **Header:**
   - Show `data.app_name` in the header when on the board step

**Files changed:** `src/components/design-kanban.tsx`

### Step 4 — Test end-to-end

- Start backend: `uv run uvicorn app.main:app --reload`
- Start frontend: `pnpm dev`
- Paste a real Google Play URL → click "Analisar agora"
- Verify reviews appear in correct kanban columns with correct sentiment/priority
- Test the AI config modal
- Test drag-and-drop (this still works client-side, just reassigns sentiment locally)

---

## What stays mock / not yet implemented

- **AI response generation** — The backend has no `POST /api/reviews/generate-response` endpoint yet. The `simulateAIResponse` function stays for now.
- **Persistence** — No backend DB storage yet. Reviews live in React state only (lost on refresh).
- **Drag-and-drop sentiment change** — Currently client-side only. No PATCH endpoint to update sentiment on the backend.

---

## Risk / Notes

- The backend must be running at `http://localhost:8000` for orval codegen AND for the app to work at runtime
- CORS is already configured on the backend to allow `http://localhost:5173`
- The `max_reviews_to_fetch` is capped at 25 on the backend, so the kanban won't have hundreds of cards
- AI analysis is concurrent on the backend but still takes time (Groq API calls). The frontend loading state must be clear to the user
