# ===== BUILDER STAGE =====
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder

WORKDIR /app

# Install Node.js and pnpm
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g pnpm \
    && rm -rf /var/lib/apt/lists/*

# --- Backend deps ---
COPY backend/pyproject.toml backend/uv.lock* ./backend/

WORKDIR /app/backend
RUN uv sync --frozen --no-dev --compile-bytecode

# --- Frontend deps ---
WORKDIR /app
COPY frontend/package.json frontend/pnpm-lock.yaml ./frontend/

WORKDIR /app/frontend
RUN pnpm install --frozen-lockfile

# --- Frontend build ---
WORKDIR /app/frontend
COPY frontend/tsconfig*.json frontend/vite.config.ts frontend/index.html ./
COPY frontend/src ./src
COPY frontend/public ./public
COPY frontend/.env.production .env.production

RUN npx vite build --mode production

# --- Backend source ---
WORKDIR /app
COPY backend/app ./backend/app

# ===== RUNTIME STAGE =====
FROM python:3.12-slim-bookworm

WORKDIR /app

# Copy virtual environment from builder
COPY --from=builder /app/backend/.venv /app/.venv

# Copy backend source
COPY --from=builder /app/backend/app /app/backend/app

# Copy built frontend
COPY --from=builder /app/frontend/dist /app/dist

# Set environment to use the venv
ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH="/app/backend"

# Expose the port FastAPI runs on
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

# Run the application
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
