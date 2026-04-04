# Cane

Open-source agentic infrastructure. Build, eval, fine-tune, and deploy AI agents.

```
pip install cane-ai
```

Started as a university lecture search system at the Frost Institute for Data Science and Computing (University of Miami), now a pip-installable platform powering [cane.fyi](https://cane.fyi). Also home to **Softmax Gulch**, a multi-agent social simulation where AI agents with persistent hierarchical memory live in a Western frontier town.

## Quickstart

```python
from cane import Cane

app = Cane()

agent = app.agents.create(
    name="Dusty",
    personality="A retired gunslinger who paints watercolors.",
    model="trinity-large-thinking",
)

agent.ingest("company_docs.pdf")

response = agent.ask("What's our return policy?")
print(response.answer)
print(response.sources)

app.serve(port=8000)
```

## Install

```bash
# Core
pip install cane-ai

# With Google integrations (Drive, Sheets, Calendar)
pip install cane-ai[google]

# With audio transcription (Whisper)
pip install cane-ai[audio]

# Everything
pip install cane-ai[all]
```

## CLI

```bash
cane init                  # Create .env template and data directory
cane serve                 # Start API server on :8000
cane serve --port 3000     # Custom port
cane dev                   # Dev mode with auto-reload
cane agent-create --name "Dusty" --personality "A retired gunslinger"
cane agent-list            # List all agents
cane eval Dusty --suite basic_personality
```

## What You Get

**Agents** -- Create AI agents with custom personalities, knowledge bases, and tools. Webhook and MCP tool integration, sub-agent delegation, orchestrator mode, tool chaining, conversation memory, scheduled runs, per-agent API keys, embeddable widget.

**RAG** -- Three-stage hybrid retrieval: embedding search (ChromaDB + BGE-base-en-v1.5) -> cross-encoder reranking (ms-marco-MiniLM) -> optional LLM reranking. Multimodal ingestion (PDF, DOCX, XLSX, CSV, audio, video, images). Smart chunking with page-aware boundaries and overlap injection.

**Eval** -- LLM-as-a-Judge with multi-provider support (Anthropic, OpenAI, Gemini, OpenRouter). Weighted criteria, pass/warn/fail classification, latency stats, JSON schema validation, reliability scoring (A-F). Scheduled evals with webhook notifications. Personality eval with 8 dimensions and 17 test scenarios.

**Fine-Tuning** -- Closed-loop pipeline: eval -> mine failures -> generate training data (high-scoring results + mined corrections) -> fine-tune on OpenAI -> deploy to workspace -> re-eval to prove improvement.

**Memory** -- Hierarchical persistent memory for agents. Layer 1: topic cloud (~300 tokens, always in context). Layer 2: thread summaries (generated after significant conversations). Layer 3: full RAG recall triggered by agent `[RECALL: query]` tags.

**Model Router** -- Task-based routing across open source and proprietary models via OpenRouter. Trinity, Qwen (235B/30B/Coder/VL), Claude (Sonnet/Haiku). Each task type maps to the optimal model for cost and quality.

**Auth** -- JWT + bcrypt with role-based access (admin/owner/member). API key auth for external access. Guest/anonymous sessions.

**Multi-tenant** -- Single database, tenant isolation at query level. Rate limits per plan.

## Stack

| Layer | Technology |
|-------|-----------|
| Package | Python 3.10+, pip-installable |
| API | FastAPI, 35+ routers |
| Frontend | React + Vite + Tailwind (separate, not in pip package) |
| Database | MySQL via SQLAlchemy |
| Vector store | ChromaDB (BGE-base-en-v1.5 text, CLIP ViT-B/32 images) |
| LLM | Anthropic Claude, OpenAI, OpenRouter (open source) |
| Deployment | Docker, Railway, or `cane serve` |

## Package Structure

```
cane/
  core/          Config, database, models, migrations, security
  agents/        Memory, streaming, prompts, scheduling, conversations
  rag/           Ingestor, chunker, search, reranker, chroma, context
  eval/          Engine, judge, personality eval, failure mining, fine-tuning
  inference/     Claude client, multi-provider routing, OpenRouter
  tools/         Webhook executor, MCP client, tool registry
  auth/          JWT, roles, API keys
  api/           FastAPI app factory + all route files
  game/          Softmax Gulch models + hierarchical memory
  cli/           CLI entry point
```

## Python API

### Agent with Memory

```python
from cane import Cane

app = Cane()
agent = app.agents.create(name="Dusty", personality="...")

conversation = agent.conversation()
conversation.send("I'm working on a project called Atlas.")
conversation.send("It's a mapping tool for AI agents.")

# Later, in a new session
conversation2 = agent.conversation()
response = conversation2.send("What was my project called?")

cloud = agent.memory.get_cloud()
print(cloud)  # topics, relationships, goals
```

### Eval Pipeline

```python
agent = app.agents.get("Dusty")

results = agent.eval.run(suite="basic_personality")
print(results["grade"])           # "A-"
print(results["dimension_scores"])  # {"consistency": 91, "authenticity": 83, ...}
```

### Fine-Tuning Loop

```python
agent = app.agents.get("Dusty")

# Mine failures, generate dataset, fine-tune, deploy
failures = agent.eval.mine_failures()
job = agent.finetune.submit(provider="openai", base_model="gpt-4o-mini")
agent.deploy(job.model_id)

new_results = agent.eval.run("basic_personality")
print(f"Before: {results['grade']} -> After: {new_results['grade']}")
```

### Full Server

```python
from cane import Cane

app = Cane(
    database_url="mysql+pymysql://user:pass@localhost/cane",
    chroma_path="/data/chroma",
    secret_key="your-jwt-secret",
    anthropic_api_key="sk-ant-...",
    openrouter_api_key="sk-or-...",
    enable_game=True,
)

app.serve(host="0.0.0.0", port=8000)
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| ANTHROPIC_API_KEY | (required) | Claude API |
| OPENROUTER_API_KEY | (optional) | Open source models |
| OPENAI_API_KEY | (optional) | Fine-tuning + deployed models |
| CANE_DB_USER | root | MySQL user |
| CANE_DB_PASSWORD | (empty) | MySQL password |
| CANE_DB_HOST | localhost | MySQL host |
| CANE_DB_PORT | 3306 | MySQL port |
| CANE_DB_NAME | cane | MySQL database |
| CANE_SECRET_KEY | (generated) | JWT signing key |
| CANE_CLAUDE_MODEL | claude-haiku-4-5-20251001 | Default agent model |
| CANE_BASE_DIR | /data/cane | Data storage root |
| CANE_ENV | development | "production" for deployed environments |
| PORT | 8000 | Server port |

## Model Router

Task-based routing across models via OpenRouter:

| Model | Role | Input / Output (per M tokens) |
|-------|------|-------------------------------|
| Trinity Large Thinking (400B MoE) | Primary agent conversations | $0.30 / $0.90 |
| Qwen3-235B (22B active) | Reasoning, memory cloud updates | $0.12 / $0.18 |
| Qwen3-30B (3B active) | Significance checks, extraction | $0.05 / $0.10 |
| Qwen Coder 32B | Code generation, tool authoring | $0.07 / $0.16 |
| Qwen VL 72B | Vision, OCR, document analysis | $0.40 / $0.40 |
| Claude Sonnet | Eval judging (default) | $3.00 / $15.00 |
| Claude Haiku | Fast classification | $0.80 / $4.00 |

## Research

- First author ICLR workshop paper diagnosing retrieval failures in multimodal RAG systems
- Two ablation studies (3,000 queries across 10 conditions): cross-encoder reranking is +4-6pp, LLM adds +1-2pp, enrichment contributes nothing
- Prior work: Claude on AWS Bedrock for automated claims validation (CSAA Insurance), active learning with GroundingDINO/CLIP/YOLOv8 at 97.1% recall (RoboCanes lab)

## License

Apache 2.0. See [LICENSE](LICENSE).
