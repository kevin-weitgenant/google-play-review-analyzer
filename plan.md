Full-stack app (React + FastAPI)
Input: app link/name from Google Play
Use google-play-scraper to fetch reviews

Run LLM (via Groq) to:
classify sentiment
assign priority
generate suggested response (JSON output)

UI shows reviews + AI suggestions (editable)

Future: use AWS Lambda to:
periodically fetch new reviews
detect new ones
notify user

---

part 1(no aws)

```mermaid
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

create react + vite application. fastapi with uv. 
seerve frontend as static. deploy on render