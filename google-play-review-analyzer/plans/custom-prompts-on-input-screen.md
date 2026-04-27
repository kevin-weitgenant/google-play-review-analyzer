# Plan: Custom Prompts on the Input Screen

## 1) Current State — What Prompt Is Actually Sent to Groq?

### Yes, we are using default prompts right now.

The backend has a 3-part prompt structure per analysis type (sentiment & priority):

| Part | Who controls it | What it is |
|------|----------------|------------|
| **HEADER** | Backend (hardcoded) | Fixed task description + JSON format instructions |
| **INSTRUCTIONS** | Frontend (optional) | User's custom rules, appended in the middle |
| **FOOTER** | Backend (hardcoded) | The review text + "respond with JSON" |

#### Sentiment — what Groq receives by default:

```
You are a sentiment classifier for app reviews. Classify the review below as exactly one of: "positive", "neutral", or "negative".

Respond with a JSON object: {"sentiment": "positive"|"neutral"|"negative"}

Review:
<actual review text here>
```

#### Priority — what Groq receives by default:

```
You are a priority classifier for app reviews. Classify the review below as exactly one of: "high", "medium", or "low".
"high" = urgent issue that needs immediate attention (bug, crash, data loss, security vulnerability, app unusable).
"medium" = notable problem but not critical (performance issues, minor bugs, feature requests for existing features).
"low" = general feedback, praise, complaints without actionable detail, or non-urgent suggestions.

Respond with a JSON object: {"priority": "high"|"medium"|"low"}

Review:
<actual review text here>
```

### What would be added if the frontend sent custom instructions?

The user's text gets **injected between the HEADER and the FOOTER**. Example with a custom priority instruction:

```
[HEADER — fixed]
You are a priority classifier for app reviews...

[USER INSTRUCTIONS — from frontend]
Pay special attention to crash reports and login issues. Anything about payments should be high priority.

[FOOTER — fixed]
Respond with a JSON object: {"priority": "high"|"medium"|"low"}

Review:
<review text>
```

The user cannot break the JSON output format because HEADER and FOOTER always wrap their input.

### Current bug / mismatch in the frontend

There's a subtle issue right now: in `handleAnalyze`, the config fields are **swapped**:

```tsx
// design-kanban.tsx line ~handleAnalyze
sentiment_instructions: config.responseGuidelines,  // ← sending response guidelines as sentiment instructions!
priority_instructions: config.priorityRules,         // ← this one is correct
```

- `config.responseGuidelines` (meant for reply generation) is being sent as `sentiment_instructions`
- There is NO `reply_instructions` field being sent (reply is simulated client-side anyway)
- The config modal currently has 4 fields: `priorityRules`, `responseGuidelines`, `tone`, `language` — but the backend only accepts `sentiment_instructions` and `priority_instructions`

### Summary: What's NOT connected yet

| Feature | Backend support | Frontend sending it |
|---------|----------------|-------------------|
| `sentiment_instructions` | ✅ Yes | ⚠️ Sending wrong field (`responseGuidelines`) |
| `priority_instructions` | ✅ Yes | ✅ Yes (`priorityRules`) |
| `reply_instructions` | ❌ Not yet (no endpoint) | ❌ No |
| `tone` | ❌ Not yet | ❌ Just stored in state |
| `language` | ❌ Not yet | ❌ Just stored in state |

---

## 2) Proposed Design — 3 Input Fields on the First Screen

### What the user wants

Replace the current config modal (4 fields: priorityRules, responseGuidelines, tone, language) with a simpler setup **directly on the input screen** (step === "input") with exactly 3 text inputs:

1. **Priority instructions** — "How should the AI prioritize reviews?"
2. **Sentiment instructions** — "How should the AI classify sentiment?"
3. **Reply instructions** — "How should the AI write replies?" (saved for later use when reply feature is implemented)

### Difficulty assessment: **Easy**

This is purely a frontend refactor. The backend already fully supports `sentiment_instructions` and `priority_instructions`. No backend changes needed for priority/sentiment. The `reply_instructions` will just be stored in state for future use.

---

## 3) Implementation Plan

### Step 1: Simplify the config state

**File:** `frontend/src/components/design-kanban.tsx`

Replace the current `AIConfig` interface and `DEFAULT_CONFIG`:

```tsx
// OLD
interface AIConfig {
  priorityRules: string
  responseGuidelines: string
  tone: "formal" | "informal" | "tecnico"
  language: string
}

// NEW
interface AIConfig {
  priorityInstructions: string
  sentimentInstructions: string
  replyInstructions: string
}
```

Update `DEFAULT_CONFIG` with sensible defaults (or empty strings for simplicity):

```tsx
const DEFAULT_CONFIG: AIConfig = {
  priorityInstructions: "",
  sentimentInstructions: "",
  replyInstructions: "",
}
```

### Step 2: Move the 3 inputs to the input screen (step === "input")

Add a collapsible/expandable "Advanced settings" section below the URL input on the first screen. When expanded, show 3 textareas:

```
[ URL input ] [ Analisar agora ]

▼ Configuracoes da IA (optional)

  ┌─────────────────────────────────┐
  │ Como priorizar reviews?          │
  │ [textarea: priorityInstructions] │
  └─────────────────────────────────┘

  ┌─────────────────────────────────┐
  │ Como classificar sentimento?     │
  │ [textarea: sentimentInstructions]│
  └─────────────────────────────────┘

  ┌─────────────────────────────────┐
  │ Como gerar respostas?            │
  │ [textarea: replyInstructions]    │
  └─────────────────────────────────┘
```

### Step 3: Fix the `handleAnalyze` call

```tsx
const data = await analyze({
  url: link,
  sentiment_instructions: config.sentimentInstructions,   // ← fixed!
  priority_instructions: config.priorityInstructions,      // ← already correct
})
// replyInstructions is NOT sent to backend (no endpoint yet)
```

### Step 4: Remove the old config modal

- Delete the `showConfig` state and the entire config modal JSX block
- Remove the "Configurar IA" button from the header (or repurpose it to scroll to the settings on the input screen)
- Remove `configDraft` state (no modal = no draft pattern needed, can edit config directly)

### Step 5: (Optional) Keep a minimal "edit config" button on the board screen

When on the board (`step === "board"`), add a button that goes back to input or opens a simple modal. Or we can skip this — the user can click "Novo app" to go back.

### Step 6: Update `useAnalyzeReviews.ts` hook

No changes needed — the `AnalyzeParams` interface already has `sentiment_instructions` and `priority_instructions` as optional fields.

### Step 7: Backend — no changes needed

The backend already:
- Accepts `sentiment_instructions` (defaults to `""`)
- Accepts `priority_instructions` (defaults to `""`)
- Correctly injects them between HEADER and FOOTER

When we implement the reply feature later, we'll add `reply_instructions` to `FetchAndAnalyzeRequest` (or to a new endpoint).

---

## 4) Files to Change

| File | Change |
|------|--------|
| `frontend/src/components/design-kanban.tsx` | Replace `AIConfig`, remove config modal, add 3 textareas to input screen, fix `handleAnalyze` |

That's it — **1 file**. The backend needs no changes.

---

## 5) What Happens with Empty Instructions?

If the user leaves all fields blank (the default), the behavior is identical to today:
- Only HEADER + FOOTER are sent to Groq
- The model uses its built-in reasoning for classification

If the user fills in custom instructions, those get appended between the header and the review text, giving the model extra context.

---

## 6) Future: Reply Feature

When we add AI-powered replies later:
- Add a `reply_instructions` field to the backend `FetchAndAnalyzeRequest` schema
- Create a new `generate_reply()` function in `groq_service.py` with its own prompt header/footer
- The `replyInstructions` field already stored in state will be sent to the backend
- The simulated `simulateAIResponse()` will be replaced with a real API call
