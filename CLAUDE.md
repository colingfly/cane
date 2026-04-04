# Colin Gibbons-Fly

M.S. Data Science candidate at University of Miami (graduating May 2026). Building Cane, an agentic RAG platform, as a research spinout from the Frost Institute of Data Science and Computing. Advisor is Rajesh.

## Communication style

Never use emojis. Never use horizontal rules (no --- or === or *** or any variant). Never use em dashes. Keep formatting minimal. No unnecessary bold, no decorative headers, no filler. Write like a sharp coworker, not a manual. Be direct and casual. When something is wrong, say so plainly. Do not pad responses with caveats or disclaimers unless they actually matter.

When writing docs, papers, or user-facing text: same rules apply. No punchlines, no editorial voice. Just the data and what it shows.

## Primary project: Cane

Agentic RAG platform with hybrid dense + sparse retrieval, multi-stage reranking, and evaluation pipelines. Started as a university lecture search system (IDSC UIMM), now productized as a multi-tenant SaaS.

Website: cane.fyi

### Architecture

Backend: Python / FastAPI
Frontend: React + Vite + Tailwind CSS
Database: MySQL via SQLAlchemy (multi-tenant)
Vector store: ChromaDB (BGE-base-en-v1.5 for text, CLIP ViT-B/32 for images)
LLM: Claude API (Anthropic) via Haiku for cost, Sonnet for quality
Auth: JWT with role-based access (admin / owner / member)
Deployment: Railway with Docker (multi-stage build)
Domain/email: cane.fyi, hello@cane.fyi via Google Workspace

### Key backend files

app.py: Main API server (search, ask, upload, agents, admin analytics)
config.py: Centralized config with env var support
database.py + db_models.py: SQLAlchemy models (Tenant, User, Workspace, Document, SearchLog)
auth.py: JWT auth with 3 role tiers, bcrypt hashing
ingestor.py: Document extraction + chunking + indexing pipeline
agent_prompts.py: Agent templates + auto-generation via Claude
chunker.py: Semantic-aware text chunking with overlap
enrichment.py: Chunk enrichment and quality scoring
reranker.py: Claude-powered result reranking

### Key frontend structure

src/pages/: Search, Documents, AgentBuilder, AgentDetail, Dashboard, Settings, Admin, Login, Register
src/api/: API client with JWT handling
src/context/: Auth state management (AuthContext)

### Supported file types

PDF, DOCX, XLSX, CSV, MP3, WAV, M4A, MP4, MKV, AVI, MOV, PNG, JPG, GIF, TIFF, WEBP

### Features

Multimodal ingestion (text, OCR, Whisper transcription, keyframe extraction)
Three search modes: Search, Deep Search, Ask AI
Agent Builder with templates and auto-prompt generation
SSE streaming responses with conversation memory
Embeddable widget for external sites
API access per agent with tenant-scoped keys
Evaluation system for testing agent accuracy before deployment
Self-service signup

## Development environment

Local OS: Windows 11, PowerShell terminal
Deployment target: Linux (Ubuntu via Railway/Docker)
Python version: 3.10+
Node version: 20+
Local paths default to C:\Users\Owner\Desktop\ (set CANE_BASE_DIR env var)
Production paths use /data/cane/
Always use platform-agnostic paths in code (pathlib.Path, os.getenv)

When writing shell commands for me, use PowerShell syntax unless the context is clearly a Dockerfile or Linux deployment script.

## Tech I use regularly

Python: FastAPI, SQLAlchemy, PyTorch, Hugging Face Transformers, Sentence-BERT, OpenCV, Whisper, vLLM, ChromaDB, scikit-learn
JavaScript: React, Vite, Tailwind, Lucide icons
Infrastructure: Docker, Railway, AWS Bedrock, Git, MySQL
AI/ML: RAG pipelines, embedding models (BGE, CLIP), cross-encoder reranking, LLM-as-a-Judge evaluation, hybrid search (dense + BM25 + RRF)

## Code style

Keep comments minimal. No decorative comment banners.
Prefer flat, readable code over clever abstractions.
Functions should do one thing.
Name things clearly enough that comments are rarely needed.
When editing existing files, match the style that is already there.
Always verify files parse correctly after edits (python -c "import ast; ast.parse(...)").
For Python: use type hints where they add clarity, do not over-annotate obvious things.
For React: functional components with hooks, no class components.

## Research context

First author on ICLR workshop paper diagnosing retrieval failures in multimodal RAG systems.
Ran two ablation studies (3,000 total queries across 10 conditions) showing cross-encoder reranking is the highest-value component (+4-6pp), LLM adds only +1-2pp on mean per-run accuracy, and enrichment contributes nothing.
Previous work at CSAA Insurance deploying Claude on AWS Bedrock for automated claims validation (LLM-as-a-Judge).
Previous robotics work at RoboCanes lab: active learning pipeline with GroundingDINO, DINO, CLIP, YOLOv8 (97.1% recall, doubled FPS on Toyota HSR-C).

## Git

GitHub username: colingfly
Main branch is main. Use descriptive commit messages. Do not commit .env files or API keys.
