# cache-bust-v7
# ═══════════════════════════════════════════════════════════
#  Cane — Multi-stage Docker build for Railway
# ═══════════════════════════════════════════════════════════

# Stage 1: Build React frontend
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --production=false
COPY frontend/ ./
RUN npm run build

# Stage 2: Python backend + built frontend
FROM python:3.11-slim
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    tesseract-ocr \
    tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

# Install CPU-only PyTorch first (saves ~1.5GB vs CUDA version)
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu

# Install Python dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ ./

# Copy built frontend from stage 1
COPY --from=frontend-build /app/frontend/dist ./static

# Create data directories
RUN mkdir -p /data/cane/chroma_db /data/cane/extracted /data/cane/uploads /data/cane/input

# Environment defaults
ENV CANE_BASE_DIR=/data/cane
ENV CANE_STATIC_DIR=/app/static
ENV CANE_ENV=production
ENV PORT=8000

EXPOSE 8000

# Run with gunicorn for production
CMD gunicorn app:app \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind "0.0.0.0:${PORT:-8000}" \
    --workers 1 \
    --timeout 120 \
    --keep-alive 5