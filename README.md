# Cane

Agentic RAG platform with hybrid retrieval, multi-stage reranking, LLM-as-a-Judge evaluation, and a closed-loop fine-tuning pipeline. Started as a university lecture search system at the Frost Institute for Data Science and Computing (University of Miami), now a multi-tenant SaaS at [cane.fyi](https://cane.fyi).

Also home to **Softmax Gulch**, a multi-agent social simulation where AI agents with persistent hierarchical memory live in a Western frontier town.

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python / FastAPI |
| Frontend | React + Vite + Tailwind |
| Database | MySQL via SQLAlchemy (multi-tenant) |
| Vector store | ChromaDB (BGE-base-en-v1.5 for text, CLIP ViT-B/32 for images) |
| LLM | Anthropic Claude (default), OpenAI (fine-tuned), OpenRouter (open source models) |
| Auth | JWT + bcrypt, role-based (admin / owner / member), API keys |
| Deployment | Docker multi-stage build, Railway |

## Architecture

```
frontend/                React SPA (23 pages)
  src/pages/             Search, Documents, AgentBuilder, AgentDetail, Environments,
                         Dashboard, Analytics, Marketplace, Admin, OSINT, ...
  src/api/               Fetch wrapper with JWT + guest sessions
  src/context/           Auth state (AuthContext)

backend/                 FastAPI (35+ routers)
  app.py                 Main server, middleware, router mounting, background workers
  config.py              Centralized config with env var support
  database.py            SQLAlchemy engine + session factory
  db_models.py           Tenant, User, Workspace, Document, SearchLog, ApiKey
  auth.py                JWT auth, 3 role tiers, API key auth, guest sessions
  eval_engine.py         LLM-as-a-Judge pipeline with reliability scoring
  eval_models.py         Environment, TestCase, JudgeCriteria, EvalRun, EvalResult
  failure_mining.py      Failure classification + LLM answer rewriting
  finetune_routes.py     Fine-tuning pipeline: dataset gen, OpenAI jobs, deploy, eval
  game_models.py         Softmax Gulch: game state, conversations, relationships, events,
                         topic clouds, personality leaderboard
  ingestor.py            Document extraction + chunking + indexing
  streaming.py           SSE streaming for ask endpoint
  tool_executor.py       Webhook + MCP tool execution loop

  services/
    claude.py            Anthropic SDK client (call, stream, call_with_tools)
    inference.py         Multi-provider inference routing (Claude, OpenAI, OpenRouter)
    model_router.py      Model registry + task-based routing for open source models
    judge_providers.py   Multi-model judge: Anthropic, OpenAI, Gemini, OpenAI-compatible
    personality_eval.py  8-dimension personality eval for Softmax Gulch agents
    game_memory.py       Hierarchical memory: topic clouds, thread summaries, recall
    rag.py               Shared RAG context builder
    search.py            Hybrid search (dense + BM25 + RRF)
    chroma.py            ChromaDB collections (text + image)
    memory.py            Agent memory extraction from conversations
    tools.py             Unified tool palette (webhooks + MCP + sub-agents)
    mcp_client.py        Model Context Protocol client
    analytics.py         Conversation + search analytics
    schedule_runner.py   Background agent scheduling
    ...

  routes/
    ask.py               /api/ask, /api/ask/stream (RAG + tool use)
    api_v1.py            /v1/ask, /v1/search (public API, API-key auth)
    agents.py            Agent CRUD, prompt auto-generation
    game.py              Softmax Gulch: world state, conversations, memory, personality eval
    eval_routes.py       Eval environments, test cases, runs
    mining_routes.py     Failure mining jobs
    ...                  35+ route files total
```

## Retrieval Pipeline

Three-stage hybrid retrieval:

1. **Embedding search** -- ChromaDB with BGE-base-en-v1.5 (text) and CLIP ViT-B/32 (images). Tenant-scoped via metadata filters. Small corpus fallback grabs everything when <=200 chunks.

2. **Cross-encoder reranking** -- ms-marco-MiniLM-L-6-v2 locally. 40% embedding + 60% cross-encoder blending. Deduplication at 85% text similarity. +4-6pp accuracy (ablation-verified).

3. **LLM reranking** (optional) -- Claude evaluates top results for semantic relevance. +1-2pp on mean accuracy.

Ingestion supports PDF, DOCX, XLSX, CSV, audio (Whisper), video (keyframe extraction + transcription), and images (OCR). Smart chunking respects page boundaries and sentence ends with overlap injection.

## Agent System

Agents are workspaces with system prompts, tools, and optional fine-tuned model deployments.

- Custom or auto-generated system prompts (Claude analyzes uploaded docs)
- Webhook tools (HTTP to any endpoint, template payloads, auth)
- MCP tools (Model Context Protocol servers, JSON-RPC discovery)
- Sub-agent delegation via AgentLink (parent to child, depth-limited)
- Orchestrator mode (auto-routes queries to specialist agents)
- Tool chaining (up to 5 sequential calls per turn)
- Conversation memory extraction and injection
- Scheduled runs (daily or interval, conditional webhooks)
- Per-agent API keys and embeddable widget
- Guest/anonymous sessions

## Eval System

Full LLM-as-a-Judge pipeline with multi-provider judge support (Anthropic, OpenAI, Gemini, OpenAI-compatible).

- Weighted judge criteria (accuracy, hallucination, completeness, etc.)
- Pass/warn/fail classification (80/60 thresholds)
- Latency stats (p50/p95/p99), JSON schema validation, composite reliability score (A-F)
- Scheduled evals with webhook notifications
- External agent targeting (eval any HTTP endpoint)
- Public eval API for CI/CD

## Fine-Tuning Loop

Closed-loop pipeline: eval -> mine failures -> fine-tune -> deploy -> re-eval.

1. **Mine failures** -- classify failure types, LLM rewrites bad answers, generates DPO/SFT training pairs
2. **Generate dataset** -- merges high-scoring eval results + mined corrections (the highest-value signal)
3. **Submit fine-tune job** -- OpenAI API, tracks lineage with environment + workspace linkage
4. **Deploy** -- sets fine-tuned model on a workspace via inference routing layer
5. **Re-evaluate** -- compare base vs fine-tuned scores, regression detection

## Softmax Gulch

Multi-agent social simulation where AI agents live in a Western frontier town. Built on top of Cane's agent, eval, and memory infrastructure.

### Hierarchical Memory

- **Layer 1 (Topic Cloud)**: compact JSON (~300 tokens) always in context. Tracks self-narrative, topics, relationships, unresolved threads, core memories, active goals. Updated end-of-day via Claude Sonnet.
- **Layer 2 (Thread Summaries)**: 1-3 sentence memories of significant moments. Generated real-time after conversations via significance check. Retrieved by matching topic cloud keywords.
- **Layer 3 (Full Traces)**: Cane's existing RAG pipeline. Game conversations indexed into ChromaDB. Triggered by agent `[RECALL: query]` mechanism.

### The Hospital (Personality Eval)

8-dimension personality eval system: consistency, theory of mind, emotional range, social awareness, authenticity, memory coherence, resilience, growth. 4 test suites with 17 scenarios. Leaderboard doubles as a model benchmark when filtered by model.

### Model Router

Task-based routing across open source and proprietary models via OpenRouter:

| Model | Role | Cost (per M tokens) |
|-------|------|-------------------|
| Trinity Large Thinking (400B MoE) | Primary agent conversations | $0.30 / $0.90 |
| Qwen3-235B (22B active) | Reasoning, cloud updates | $0.12 / $0.18 |
| Qwen3-30B (3B active) | Significance checks, extraction | $0.05 / $0.10 |
| Qwen Coder 32B | Code generation, tool authoring | $0.07 / $0.16 |
| Qwen VL 72B | Vision, OCR, document analysis | $0.40 / $0.40 |
| Claude Sonnet | Eval judging (default) | $3.00 / $15.00 |
| Claude Haiku | Fast classification | $0.80 / $4.00 |

## Setup

### 1. MySQL

```sql
CREATE DATABASE cane CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. Backend

```bash
cd backend
pip install -r requirements.txt

export CANE_DB_USER=root
export CANE_DB_PASSWORD=yourpassword
export CANE_DB_NAME=cane
export CANE_SECRET_KEY=your-random-secret-key
export ANTHROPIC_API_KEY=sk-ant-...
export OPENROUTER_API_KEY=sk-or-...  # optional, for open source models

python seed.py   # init DB + create admin
python app.py    # http://localhost:8000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
```

Vite proxies `/api` to the backend at `:8000`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| CANE_DB_USER | root | MySQL user |
| CANE_DB_PASSWORD | (empty) | MySQL password |
| CANE_DB_HOST | localhost | MySQL host |
| CANE_DB_PORT | 3306 | MySQL port |
| CANE_DB_NAME | cane | MySQL database name |
| CANE_SECRET_KEY | (generated) | JWT signing key |
| ANTHROPIC_API_KEY | (required) | Claude API access |
| OPENROUTER_API_KEY | (optional) | Open source models via OpenRouter |
| OPENAI_API_KEY | (optional) | Fine-tuning + deployed models |
| CANE_CLAUDE_MODEL | claude-haiku-4-5-20251001 | Default agent model |
| CANE_BASE_DIR | /data/cane | Data storage root |
| CANE_ENV | development | Set to "production" for Railway |
| PORT | 8000 | Server port |

## Roles

| Role | Access |
|------|--------|
| admin | All tenants, onboarding, platform config |
| owner | Team management, workspaces, documents, agents, evals |
| member | Upload, search, use agents |

## Research

- First author ICLR workshop paper diagnosing retrieval failures in multimodal RAG systems
- Two ablation studies (3,000 queries across 10 conditions) showing cross-encoder reranking is the highest-value component (+4-6pp), LLM adds +1-2pp, enrichment contributes nothing
- Previous work: Claude on AWS Bedrock for automated claims validation (CSAA Insurance), active learning pipeline with GroundingDINO/CLIP/YOLOv8 at 97.1% recall (RoboCanes lab)

## License

Proprietary. All rights reserved.
