# ================= Stage 1: Build React + TypeScript Frontend =================
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ================= Stage 2: Python Backend Runtime =================
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DATABASE_PATH=/app/data/harness.db
ENV MASTER_KEY_PATH=/app/data/master.key
ENV DEFAULT_ENDPOINT_URL=http://host.docker.internal:20128/v1
ENV DEFAULT_MODEL=auto/qwen

WORKDIR /app

# Install system utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy compiled React static assets from Stage 1
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Copy application source code
COPY app/ app/

# Create persistent data volume directory
RUN mkdir -p /app/data

EXPOSE 8000

# Health check probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Start Uvicorn server
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
