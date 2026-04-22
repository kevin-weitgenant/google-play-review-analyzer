# Google Play Review Analyzer

Full-stack app to scrape Google Play reviews, classify sentiment & priority via Groq LLM, and display AI-generated suggestions in a React UI.

## Tech Stack

- **Backend**: FastAPI + UV
- **Frontend**: React + Vite + TypeScript
- **API Codegen**: Orval (Axios + React Query)
- **Database**: PostgreSQL (Supabase)
- **Styling**: Tailwind CSS + Shadcn


``` mermaid
flowchart TD

A[React Frontend] -->|Enter app name or link| B[FastAPI Backend]

B --> C[Fetch Reviews Service]
C -->|google-play-scraper| D[Google Play Reviews]

D --> E[Processing Pipeline]
E --> F[LLM - Groq API]

F -->|Structured JSON| G[Parsed Results]
G --> H[Database]

H --> B
B --> A

A --> I[Display Reviews]
I --> J[Sentiment + Priority + Suggested Response]
```

## Getting Started

use vscode tasks...