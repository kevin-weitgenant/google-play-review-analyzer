# Plan 6 — Fix Groq Structured Outputs

## Problem

Every review returns `sentiment: "neutral"` and `priority: "low"` regardless of content.

**Root cause chain:**

1. The original code used `response_format: { type: "json_schema", strict: true }` — the strongest structured output mode.
2. `llama-3.1-8b-instant` does **not** support `json_schema` at all → every Groq call returned HTTP 400.
3. The router used `asyncio.gather(..., return_exceptions=True)` which swallows exceptions silently.
4. Fallback logic `isinstance(result, str)` saw an Exception object → defaulted to `"neutral"` / `"low"` every time.
5. A prior fix switched to `response_format: { type: "json_object" }` — this works with `llama-3.1-8b-instant` but gives **no schema guarantee**. The model sometimes returns JSON missing the expected keys (`"sentiment"` / `"priority"`), causing `KeyError` exceptions that are caught and again default to `"neutral"` / `"low"`.

## Evidence from Groq Docs

Per <https://console.groq.com/docs/structured-outputs>:

| Mode | Guarantee | Supported models |
|------|-----------|-----------------|
| `json_schema` + `strict: true` | 100 % schema adherence (constrained decoding) | `openai/gpt-oss-20b`, `openai/gpt-oss-120b` |
| `json_schema` + `strict: false` | Best-effort, may produce invalid output | above + `openai/gpt-oss-safeguard-20b`, `meta-llama/llama-4-scout-17b-16e-instruct` |
| `json_object` | Valid JSON only, no schema enforcement | Most models (including `llama-3.1-8b-instant`) |

The original code's design (strict `json_schema`) was correct — the model was wrong.

## Plan

| # | File | Change |
|---|------|--------|
| 1 | `backend/.env` | Change model to `GROQ_MODEL=openai/gpt-oss-20b` |
| 2 | `backend/app/core/config.py` | Update `groq_model` default from `llama-3.1-8b-instant` to `openai/gpt-oss-20b` |
| 3 | `backend/app/services/groq_service.py` | Restore `SENTIMENT_JSON_SCHEMA` and `PRIORITY_JSON_SCHEMA` constants with `strict: true`. Restore `response_format` to use these schemas instead of `{ type: "json_object" }`. Keep the logging and `.get()` validation added in the prior fix as defense-in-depth. |
| 4 | `backend/app/routers/reviews.py` | Keep the error-logging improvements from the prior fix (no changes needed). |

### Why `openai/gpt-oss-20b`?

- It supports `json_schema` + `strict: true` (constrained decoding) — the strongest guarantee.
- It's the smaller of the two strict-mode models, so it's faster and cheaper.
- Our schemas are trivially small (`{ "sentiment": "positive"|"neutral"|"negative" }`), so even a 20 B model is overqualified.

## Acceptance Criteria

- [ ] Calling `POST /api/reviews/fetch-and-analyze` returns varied sentiments and priorities (positive, negative, high, medium, etc.)
- [ ] No `KeyError` or `HTTPStatusError` in logs
- [ ] Each Groq response contains the exact key expected (`"sentiment"` or `"priority"`) with a valid enum value
