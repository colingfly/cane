# cache-bust-v10
# ═══════════════════════════════════════════════════════════
#  Cane — Multi-stage Docker build for Railway
# ═══════════════════════════════════════════════════════════

# Stage 1: Build React frontend
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --production=false
COPY frontend/ ./
ARG CACHEBUST=13
RUN npm run build

# Stage 2: Python dependencies (cached layer)
FROM python:3.11-slim AS python-deps
WORKDIR /app

# System deps needed for building Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install CPU-only PyTorch first (saves ~1.5GB vs CUDA version)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# Install Python dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download ML models so cold starts are fast
# (these would otherwise download on first request)
RUN python -c "\
from sentence_transformers import SentenceTransformer; \
SentenceTransformer('BAAI/bge-base-en-v1.5'); \
print('bge-base downloaded')"

RUN python -c "\
from transformers import CLIPModel, CLIPProcessor; \
CLIPModel.from_pretrained('openai/clip-vit-base-patch32'); \
CLIPProcessor.from_pretrained('openai/clip-vit-base-patch32'); \
print('CLIP downloaded')"

RUN python -c "\
from sentence_transformers import CrossEncoder; \
CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2'); \
print('cross-encoder downloaded')"

# Stage 3: Final runtime image (no build-essential)
FROM python:3.11-slim
WORKDIR /app

# Runtime-only system deps (no build-essential = smaller image)
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-eng \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages + models from deps stage
COPY --from=python-deps /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=python-deps /usr/local/bin /usr/local/bin
COPY --from=python-deps /root/.cache/huggingface /root/.cache/huggingface

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
# Tell HuggingFace to use cached models
ENV TRANSFORMERS_CACHE=/root/.cache/huggingface
ENV HF_HOME=/root/.cache/huggingface

EXPOSE 8000

# Run with gunicorn for production
CMD gunicorn app:app \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind "0.0.0.0:${PORT:-8000}" \
    --workers 2 \
    --timeout 600 \
    --keep-alive 5
