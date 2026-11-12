# Stage 1: Build Next.js frontend with relative /api/* routes (proxied to localhost:8000)
FROM node:20-bookworm-slim AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
ENV NEXT_PUBLIC_API_URL="" \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Stage 2: Runtime container (FastAPI :8000 + Next.js :7860 for Hugging Face Spaces / Docker)
FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app:/app/src \
    PAYPAL_ENV=sandbox \
    FINSHEILD_DB_PATH=/app/data/finshield.db \
    FINSHEILD_USE_REAL=auto \
    BACKEND_INTERNAL_URL=http://127.0.0.1:8000 \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    PORT=7860

WORKDIR /app

# Non-root user (UID 1000 required by Hugging Face Spaces)
RUN useradd -m -u 1000 user

COPY --from=frontend-builder /usr/local/bin/node /usr/local/bin/node

COPY requirements-api.txt ./
RUN pip install --upgrade pip && pip install -r requirements-api.txt

COPY backend ./backend
COPY src ./src
COPY models ./models
COPY evaluation ./evaluation
COPY config ./config
COPY --from=frontend-builder /app/frontend/package.json ./frontend/package.json
COPY --from=frontend-builder /app/frontend/next.config.ts ./frontend/next.config.ts
COPY --from=frontend-builder /app/frontend/public ./frontend/public
COPY --from=frontend-builder /app/frontend/.next ./frontend/.next
COPY --from=frontend-builder /app/frontend/node_modules ./frontend/node_modules

RUN mkdir -p /app/data && chown -R user:user /app

USER user

EXPOSE 7860

CMD ["sh", "-c", "uvicorn backend.main:app --host 127.0.0.1 --port 8000 & BACK_PID=$!; trap 'kill $BACK_PID 2>/dev/null || true' EXIT; cd /app/frontend && exec node node_modules/next/dist/bin/next start -H 0.0.0.0 -p ${PORT:-7860}"]
