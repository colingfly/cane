import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'

export default function Architecture() {
  const containerRef = useRef(null)

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) entry.target.classList.add('arch-visible')
      })
    }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' })

    const els = containerRef.current?.querySelectorAll('.arch-reveal')
    els?.forEach(el => observer.observe(el))
    return () => els?.forEach(el => observer.unobserve(el))
  }, [])

  return (
    <div ref={containerRef} className="arch-page">
      <style>{archStyles}</style>

      {/* Nav */}
      <nav className="arch-nav">
        <Link to="/" className="arch-logo">Cane</Link>
        <div className="arch-nav-links">
          <Link to="/">Home</Link>
          <Link to="/demo">Demo</Link>
          <Link to="/guide">Docs</Link>
          <Link to="/login" className="arch-nav-cta">Sign in</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="arch-hero">
        <div className="arch-hero-inner">
          <div className="arch-label arch-reveal">ARCHITECTURE</div>
          <h1 className="arch-reveal">
            How it works,<br />layer by layer
          </h1>
          <p className="arch-hero-sub arch-reveal">
            A deep dive into the system that powers Cane. Every layer was built from scratch:
            ingestion, retrieval, agent orchestration, tool execution, memory and scheduling, evaluation, and deployment.
          </p>
        </div>
      </section>

      {/* System overview diagram */}
      <section className="arch-section">
        <div className="arch-contain">
          <div className="arch-section-head arch-reveal">
            <h2>System Overview</h2>
            <p>Request flow from user query to streamed response.</p>
          </div>
          <div className="arch-flow arch-reveal">
            <div className="arch-flow-row">
              {['User Query', 'API / Widget', 'Agent Router', 'RAG + Memory', 'Claude + Tools', 'Streamed Response'].map((step, i) => (
                <div key={i} className="arch-flow-step">
                  <div className="arch-flow-n">{String(i + 1).padStart(2, '0')}</div>
                  <div className="arch-flow-label">{step}</div>
                  {i < 5 && <div className="arch-flow-arrow">&rarr;</div>}
                </div>
              ))}
            </div>
            <div className="arch-flow-detail">
              <p>
                Queries arrive through the chat widget, REST API, or internal UI.
                The agent router identifies the target workspace and loads its system prompt, knowledge base, and tool palette.
                The RAG pipeline retrieves relevant document chunks via hybrid search.
                Claude receives the chunks, persistent memories, and available tools, then generates a streamed response.
                If Claude invokes a tool, execution loops back for a follow-up completion. After the response, a background thread extracts new memories from the conversation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Layer 1: Ingestion */}
      <section className="arch-section">
        <div className="arch-contain">
          <div className="arch-layer-header arch-reveal">
            <div className="arch-layer-n">01</div>
            <div>
              <h2>Document Ingestion</h2>
              <p className="arch-layer-sub">From raw files to searchable vector embeddings</p>
            </div>
          </div>
          <div className="arch-detail-grid arch-reveal">
            <div className="arch-detail-card">
              <h4>File Processing</h4>
              <p>
                PDF text extraction with PyPDF2. DOCX parsing with python-docx.
                Image OCR via Tesseract. Audio and video transcription through OpenAI Whisper.
                Each format gets a specialized extractor that outputs clean plaintext.
              </p>
            </div>
            <div className="arch-detail-card">
              <h4>Chunking Strategy</h4>
              <p>
                Documents are split into overlapping chunks with configurable size and overlap.
                Chunk boundaries respect sentence endings to preserve semantic coherence.
                Each chunk stores its source document ID, position index, and character offsets for citation tracking.
              </p>
            </div>
            <div className="arch-detail-card">
              <h4>Embedding</h4>
              <p>
                Chunks are embedded using BGE-base-en-v1.5, a state-of-the-art sentence transformer.
                Embeddings are stored in ChromaDB with metadata for filtered retrieval.
                Documents belong to workspaces, providing natural tenant isolation.
              </p>
            </div>
            <div className="arch-detail-card">
              <h4>Google Drive Sync</h4>
              <p>
                OAuth 2.0 popup flow with offline access for refresh tokens.
                Folder picker UI for selecting sync targets. Incremental sync via Google Changes API
                with stored page tokens. Google Docs and Sheets auto-export to text.
                Credentials encrypted at rest with Fernet symmetric encryption.
              </p>
            </div>
          </div>
          <div className="arch-stack-bar arch-reveal">
            <span>FastAPI</span><span>PyPDF2</span><span>python-docx</span><span>Tesseract</span>
            <span>Whisper</span><span>BGE-base-en</span><span>ChromaDB</span><span>Google Drive API</span>
          </div>
        </div>
      </section>

      {/* Layer 2: Retrieval */}
      <section className="arch-section">
        <div className="arch-contain">
          <div className="arch-layer-header arch-reveal">
            <div className="arch-layer-n">02</div>
            <div>
              <h2>Hybrid Retrieval</h2>
              <p className="arch-layer-sub">Three-stage search combining dense and sparse methods</p>
            </div>
          </div>
          <div className="arch-pipeline arch-reveal">
            <div className="arch-pipeline-stage">
              <div className="arch-pipeline-title">Stage 1: Dual Retrieval</div>
              <p>
                Every query runs two parallel searches. Dense retrieval uses BGE embeddings
                and cosine similarity against ChromaDB. Sparse retrieval uses BM25 keyword
                matching with tokenized document chunks. Both return scored candidate sets.
              </p>
            </div>
            <div className="arch-pipeline-divider" />
            <div className="arch-pipeline-stage">
              <div className="arch-pipeline-title">Stage 2: Reciprocal Rank Fusion</div>
              <p>
                Candidate sets from vector and keyword search are merged using RRF.
                Each result gets a fused score based on its rank in both lists, not raw similarity.
                This eliminates the need to normalize scores across different retrieval methods.
              </p>
            </div>
            <div className="arch-pipeline-divider" />
            <div className="arch-pipeline-stage">
              <div className="arch-pipeline-title">Stage 3: Cross-Encoder Re-ranking</div>
              <p>
                Top candidates from RRF are re-ranked by a cross-encoder model (ms-marco-MiniLM).
                Unlike bi-encoders, the cross-encoder sees the query and document together,
                producing a much more accurate relevance score. Final top-k chunks go to Claude.
              </p>
            </div>
          </div>
          <div className="arch-stack-bar arch-reveal">
            <span>ChromaDB</span><span>BGE-base-en</span><span>BM25</span>
            <span>Reciprocal Rank Fusion</span><span>ms-marco-MiniLM cross-encoder</span>
          </div>
        </div>
      </section>

      {/* Layer 3: Agents & Orchestration */}
      <section className="arch-section">
        <div className="arch-contain">
          <div className="arch-layer-header arch-reveal">
            <div className="arch-layer-n">03</div>
            <div>
              <h2>Agents & Orchestration</h2>
              <p className="arch-layer-sub">Scoped knowledge, multi-agent delegation, and tool execution</p>
            </div>
          </div>
          <div className="arch-detail-grid arch-reveal">
            <div className="arch-detail-card">
              <h4>Agent Workspaces</h4>
              <p>
                Each agent is a workspace with its own system prompt, document collection,
                tool palette, and conversation scope. Agents are tenant-isolated.
                A single tenant can run dozens of specialized agents from one account.
              </p>
            </div>
            <div className="arch-detail-card">
              <h4>Agent-as-Tool Orchestration</h4>
              <p>
                Any agent can be linked as a callable tool on another agent.
                When Claude decides to delegate, it invokes the sub-agent with a query.
                The sub-agent runs its own full RAG and tool pipeline, then returns the answer.
                Recursion is depth-limited to prevent runaway chains.
              </p>
            </div>
            <div className="arch-detail-card">
              <h4>Unified Tool Palette</h4>
              <p>
                Three tool types in one palette: webhook HTTP actions, MCP server tools,
                and linked sub-agents. Claude sees all available tools and picks the right one
                at runtime. Tool names are sanitized and namespaced to prevent collisions.
              </p>
            </div>
            <div className="arch-detail-card">
              <h4>Multi-Turn Tool Loop</h4>
              <p>
                When Claude calls a tool, the system executes it and feeds the result back
                for a follow-up completion. This loops until Claude produces a final text response.
                Each tool call is logged with execution time and status for analytics.
              </p>
            </div>
          </div>

          {/* Orchestration flow */}
          <div className="arch-orch arch-reveal">
            <div className="arch-orch-title">Orchestration Example</div>
            <div className="arch-orch-flow">
              <div className="arch-orch-node arch-orch-supervisor">
                <div className="arch-orch-node-label">Supervisor Agent</div>
                <div className="arch-orch-node-desc">Routes questions to the right specialist</div>
              </div>
              <div className="arch-orch-arrows">
                <div className="arch-orch-arrow-line" />
                <div className="arch-orch-arrow-line" />
                <div className="arch-orch-arrow-line" />
              </div>
              <div className="arch-orch-children">
                <div className="arch-orch-node">
                  <div className="arch-orch-node-label">HR Agent</div>
                  <div className="arch-orch-node-desc">Policy docs + handbook</div>
                </div>
                <div className="arch-orch-node">
                  <div className="arch-orch-node-label">Engineering Agent</div>
                  <div className="arch-orch-node-desc">API docs + runbooks</div>
                </div>
                <div className="arch-orch-node">
                  <div className="arch-orch-node-label">Sales Agent</div>
                  <div className="arch-orch-node-desc">CRM tools + pricing</div>
                </div>
              </div>
            </div>
          </div>
          <div className="arch-stack-bar arch-reveal">
            <span>Claude API</span><span>MCP Protocol</span><span>Agent-as-Tool</span>
            <span>Depth-limited recursion</span><span>Thread-local state</span><span>SSE streaming</span>
          </div>
        </div>
      </section>

      {/* Layer 4: Tool Execution */}
      <section className="arch-section">
        <div className="arch-contain">
          <div className="arch-layer-header arch-reveal">
            <div className="arch-layer-n">04</div>
            <div>
              <h2>Tool Execution</h2>
              <p className="arch-layer-sub">Three backends, one unified interface</p>
            </div>
          </div>
          <div className="arch-tools-grid arch-reveal">
            <div className="arch-tool-type">
              <div className="arch-tool-icon">&#9881;</div>
              <h4>Webhook Tools</h4>
              <p>
                HTTP actions defined per agent. Configurable URL, method, headers, and payload templates.
                Supports fire-and-forget mode for notifications and wait-for-response mode for live data lookups.
                Parameters are exposed to Claude as typed input schema fields.
              </p>
            </div>
            <div className="arch-tool-type">
              <div className="arch-tool-icon">&#9729;</div>
              <h4>MCP Servers</h4>
              <p>
                Model Context Protocol connections to external services. Server URL registration
                with auto-discovery of available tools. Supports bearer token, API key, and custom
                header authentication. Tool names are prefixed by server type to prevent collisions.
              </p>
            </div>
            <div className="arch-tool-type">
              <div className="arch-tool-icon">&#9734;</div>
              <h4>Agent-as-Tool</h4>
              <p>
                Linked agents appear as tools in the parent's palette. Execution creates a fresh
                database session, loads the child's full context (system prompt, RAG, tools),
                and runs a complete Claude completion. Recursion depth is tracked per-thread
                with a configurable maximum.
              </p>
            </div>
          </div>
          <div className="arch-stack-bar arch-reveal">
            <span>Webhook executor</span><span>MCP client</span><span>Tool router</span>
            <span>JSON schema validation</span><span>Latency tracking</span>
          </div>
        </div>
      </section>

      {/* Layer 5: Memory & Scheduling */}
      <section className="arch-section">
        <div className="arch-contain">
          <div className="arch-layer-header arch-reveal">
            <div className="arch-layer-n">05</div>
            <div>
              <h2>Memory & Scheduling</h2>
              <p className="arch-layer-sub">Persistent learning and autonomous execution</p>
            </div>
          </div>
          <div className="arch-detail-grid arch-reveal">
            <div className="arch-detail-card">
              <h4>Memory Extraction</h4>
              <p>
                After every conversation turn, a background daemon thread sends the Q+A pair
                to Claude with a structured extraction prompt. Claude returns facts, preferences,
                and instructions as typed JSON. New memories are deduplicated against existing
                ones before saving.
              </p>
            </div>
            <div className="arch-detail-card">
              <h4>Memory Injection</h4>
              <p>
                Before each response, the system loads active memories for the current agent
                and user. Memories are formatted and injected into the system prompt so Claude
                has context from all previous conversations. Per-user scoping ensures different
                users get personalized experiences.
              </p>
            </div>
            <div className="arch-detail-card">
              <h4>Scheduled Runner</h4>
              <p>
                A background async loop polls the schedule table every 60 seconds. Due schedules
                spawn daemon threads that execute the full ask pipeline (RAG + tools + Claude).
                Supports interval-based and daily-time triggers with per-schedule locking to
                prevent concurrent runs.
              </p>
            </div>
            <div className="arch-detail-card">
              <h4>Run History</h4>
              <p>
                Every scheduled execution is logged with prompt, response, status, duration,
                and error details. Run history is queryable per schedule with the last 20 runs
                displayed in the UI. Analytics logs scheduled runs as a separate channel.
              </p>
            </div>
          </div>
          <div className="arch-stack-bar arch-reveal">
            <span>Daemon threads</span><span>Claude extraction</span><span>Deduplication</span>
            <span>Async scheduler</span><span>Per-schedule locking</span><span>Run history logging</span>
          </div>
        </div>
      </section>

      {/* Layer 6: Evaluation */}
      <section className="arch-section">
        <div className="arch-contain">
          <div className="arch-layer-header arch-reveal">
            <div className="arch-layer-n">06</div>
            <div>
              <h2>Evaluation Engine</h2>
              <p className="arch-layer-sub">Automated scoring with LLM-as-Judge</p>
            </div>
          </div>
          <div className="arch-detail-grid arch-reveal">
            <div className="arch-detail-card">
              <h4>Test Cases</h4>
              <p>
                Each test case has an input query and expected answer. Cases can be written
                manually or generated from existing documents. The test suite is stored per-agent
                and can be included when publishing to the marketplace.
              </p>
            </div>
            <div className="arch-detail-card">
              <h4>Scoring Criteria</h4>
              <p>
                Four default criteria: accuracy, completeness, relevance, and faithfulness.
                Each criterion has a configurable weight. Custom rules can be added as free-text
                instructions (e.g. "never mention competitor products").
              </p>
            </div>
            <div className="arch-detail-card">
              <h4>LLM-as-Judge</h4>
              <p>
                Claude scores each response against the expected answer and criteria.
                Scores are 0 to 100 per criterion, then combined with weights into a final
                overall score. The judge sees both the answer and the context chunks used.
              </p>
            </div>
            <div className="arch-detail-card">
              <h4>Regression Tracking</h4>
              <p>
                Eval results are stored with timestamps. Score history is visualized over time
                so you can spot regressions when system prompts, documents, or tools change.
                Marketplace listings attach eval snapshots as proof of quality.
              </p>
            </div>
          </div>
          <div className="arch-stack-bar arch-reveal">
            <span>LLM-as-Judge</span><span>Weighted criteria</span><span>Custom rules</span>
            <span>Score history</span><span>Marketplace verification</span>
          </div>
        </div>
      </section>

      {/* Layer 7: Deployment */}
      <section className="arch-section">
        <div className="arch-contain">
          <div className="arch-layer-header arch-reveal">
            <div className="arch-layer-n">07</div>
            <div>
              <h2>Deployment</h2>
              <p className="arch-layer-sub">Widget embed, REST API, and marketplace distribution</p>
            </div>
          </div>
          <div className="arch-detail-grid arch-reveal">
            <div className="arch-detail-card">
              <h4>Chat Widget</h4>
              <p>
                One script tag to embed a chat bubble on any website.
                Customizable color, position, greeting message, subtitle, and border radius.
                The widget communicates with the API over SSE for real-time streaming.
              </p>
            </div>
            <div className="arch-detail-card">
              <h4>REST API</h4>
              <p>
                API key authentication with per-key rate limits and workspace scoping.
                Endpoints for querying agents, managing documents, and retrieving analytics.
                Keys are hashed at rest and tracked by usage.
              </p>
            </div>
            <div className="arch-detail-card">
              <h4>Agent Marketplace</h4>
              <p>
                Publish agents with system prompt, eval scores, document counts, and tool configurations.
                Other users can browse, clone, and re-verify agents by running the original test suite
                against their copy. Clone counts and verification scores are tracked.
              </p>
            </div>
            <div className="arch-detail-card">
              <h4>Analytics</h4>
              <p>
                Every conversation is logged with query text, chunks used, tools called,
                response time, and user feedback. Per-agent dashboards show volume trends,
                channel breakdown (widget vs. API vs. internal), and satisfaction metrics.
              </p>
            </div>
          </div>
          <div className="arch-stack-bar arch-reveal">
            <span>SSE streaming</span><span>JWT + API keys</span><span>Marketplace</span>
            <span>Conversation logging</span><span>Analytics dashboard</span>
          </div>
        </div>
      </section>

      {/* Full stack summary */}
      <section className="arch-section">
        <div className="arch-contain">
          <div className="arch-section-head arch-reveal">
            <h2>Full Stack</h2>
            <p>Everything used across the platform.</p>
          </div>
          <div className="arch-full-stack arch-reveal">
            {[
              { category: 'Backend', items: 'Python 3.11, FastAPI, Gunicorn, SQLAlchemy ORM, Alembic-style migrations' },
              { category: 'AI / ML', items: 'Claude API (Anthropic), BGE-base-en-v1.5 embeddings, BM25 ranking, ms-marco-MiniLM cross-encoder, OpenAI Whisper' },
              { category: 'Vector Store', items: 'ChromaDB with workspace-scoped collections and metadata filtering' },
              { category: 'Database', items: 'MySQL with multi-tenant schema, foreign key constraints, cascading deletes' },
              { category: 'Auth & Security', items: 'JWT tokens, OAuth 2.0 (Google), Fernet symmetric encryption, hashed API keys, per-key rate limiting' },
              { category: 'Integrations', items: 'Google Drive API, Model Context Protocol (MCP), webhook tool executor, SSE streaming' },
              { category: 'Memory & Scheduling', items: 'Background memory extraction, deduplication, per-user scoping, async schedule loop, daemon thread execution' },
              { category: 'Frontend', items: 'React 18, Vite, Lucide icons, tabbed agent config, CSS custom properties, responsive grid layout' },
              { category: 'Infrastructure', items: 'Railway deployment, background sync workers, scheduled runner, multi-process Gunicorn, environment-based config' },
            ].map((row, i) => (
              <div key={i} className="arch-full-stack-row">
                <div className="arch-full-stack-cat">{row.category}</div>
                <div className="arch-full-stack-items">{row.items}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="arch-section arch-cta-section">
        <div className="arch-contain arch-reveal" style={{ textAlign: 'center' }}>
          <h2 style={{ marginBottom: 12 }}>See it in action</h2>
          <p className="arch-cta-sub">
            The demo runs a live agent on this exact infrastructure. Upload a file, ask a question, watch the pipeline work.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 32 }}>
            <Link to="/demo" className="arch-btn-fill">Try the demo</Link>
            <Link to="/register" className="arch-btn-ghost">Create an account</Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="arch-footer">
        <div className="arch-footer-left">
          <span className="arch-footer-brand">Cane</span>
          <span className="arch-footer-copy">Built by Colin</span>
        </div>
        <div className="arch-footer-links">
          <Link to="/">Home</Link>
          <Link to="/demo">Demo</Link>
          <Link to="/guide">Docs</Link>
          <Link to="/marketplace">Marketplace</Link>
          <a href="mailto:hello@cane.fyi">Contact</a>
        </div>
      </footer>
    </div>
  )
}

const archStyles = `
.arch-page {
  font-family: 'DM Sans', -apple-system, sans-serif;
  background: #000;
  color: rgba(255,255,255,0.5);
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
}

/* Nav */
.arch-nav {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 100;
  padding: 0 48px;
  height: 56px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(0,0,0,0.8);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

.arch-logo {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 700;
  font-size: 1.15rem;
  color: #fff;
  text-decoration: none;
  letter-spacing: -0.02em;
}

.arch-nav-links { display: flex; gap: 32px; align-items: center; }

.arch-nav-links a {
  color: rgba(255,255,255,0.4);
  text-decoration: none;
  font-size: 0.82rem;
  font-weight: 500;
  transition: color 0.15s;
}

.arch-nav-links a:hover { color: #fff; }

.arch-nav-cta {
  color: #fff !important;
  background: rgba(255,255,255,0.08);
  padding: 6px 16px;
  border-radius: 6px;
  transition: background 0.15s !important;
}

.arch-nav-cta:hover { background: rgba(255,255,255,0.14) !important; }

/* Hero */
.arch-hero {
  padding: 160px 48px 100px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

.arch-hero-inner {
  max-width: 800px;
  margin: 0 auto;
}

.arch-label {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 0.72rem;
  font-weight: 600;
  color: rgba(255,255,255,0.2);
  letter-spacing: 0.12em;
  margin-bottom: 24px;
}

.arch-hero h1 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: clamp(2.4rem, 5vw, 3.6rem);
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.035em;
  line-height: 1.1;
  margin-bottom: 24px;
}

.arch-hero-sub {
  font-size: 1.05rem;
  color: rgba(255,255,255,0.4);
  max-width: 600px;
  line-height: 1.7;
}

/* Sections */
.arch-section {
  padding: 80px 48px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

.arch-contain { max-width: 1000px; margin: 0 auto; }

.arch-section-head { margin-bottom: 48px; }

.arch-section-head h2 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: clamp(1.4rem, 2.5vw, 1.8rem);
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.02em;
  margin-bottom: 8px;
}

.arch-section-head p {
  font-size: 0.9rem;
  color: rgba(255,255,255,0.35);
}

/* Layer headers */
.arch-layer-header {
  display: flex;
  gap: 24px;
  align-items: flex-start;
  margin-bottom: 48px;
}

.arch-layer-n {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 2.4rem;
  font-weight: 700;
  color: rgba(255,255,255,0.08);
  letter-spacing: -0.02em;
  line-height: 1;
  min-width: 60px;
}

.arch-layer-header h2 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1.5rem;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.02em;
  margin-bottom: 6px;
}

.arch-layer-sub {
  font-size: 0.88rem;
  color: rgba(255,255,255,0.35);
}

/* Detail grids */
.arch-detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.06);
  margin-bottom: 32px;
}

.arch-detail-card {
  padding: 32px;
  background: #000;
}

.arch-detail-card h4 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 0.92rem;
  font-weight: 600;
  color: #fff;
  margin-bottom: 10px;
  letter-spacing: -0.01em;
}

.arch-detail-card p {
  font-size: 0.82rem;
  color: rgba(255,255,255,0.4);
  line-height: 1.7;
}

/* Stack bars */
.arch-stack-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.arch-stack-bar span {
  font-size: 0.7rem;
  color: rgba(255,255,255,0.25);
  background: rgba(255,255,255,0.04);
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid rgba(255,255,255,0.06);
  font-family: 'DM Sans', sans-serif;
}

/* Flow diagram */
.arch-flow {
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 8px;
  padding: 40px;
}

.arch-flow-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  margin-bottom: 32px;
  flex-wrap: wrap;
}

.arch-flow-step {
  display: flex;
  align-items: center;
  gap: 8px;
}

.arch-flow-n {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 0.65rem;
  font-weight: 600;
  color: rgba(255,255,255,0.15);
}

.arch-flow-label {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 0.82rem;
  font-weight: 600;
  color: #fff;
  padding: 8px 16px;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 6px;
  white-space: nowrap;
}

.arch-flow-arrow {
  color: rgba(255,255,255,0.15);
  font-size: 1rem;
  margin: 0 12px;
}

.arch-flow-detail p {
  font-size: 0.82rem;
  color: rgba(255,255,255,0.35);
  line-height: 1.7;
  text-align: center;
  max-width: 700px;
  margin: 0 auto;
}

/* Pipeline stages */
.arch-pipeline {
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 1px solid rgba(255,255,255,0.06);
  margin-bottom: 32px;
}

.arch-pipeline-stage {
  padding: 32px 36px;
}

.arch-pipeline-title {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 0.88rem;
  font-weight: 600;
  color: #fff;
  margin-bottom: 10px;
  letter-spacing: -0.01em;
}

.arch-pipeline-stage p {
  font-size: 0.82rem;
  color: rgba(255,255,255,0.4);
  line-height: 1.7;
}

.arch-pipeline-divider {
  height: 1px;
  background: rgba(255,255,255,0.06);
}

/* Orchestration diagram */
.arch-orch {
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 8px;
  padding: 40px;
  margin: 32px 0;
}

.arch-orch-title {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 0.82rem;
  font-weight: 600;
  color: rgba(255,255,255,0.3);
  text-align: center;
  margin-bottom: 32px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.arch-orch-flow {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}

.arch-orch-node {
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  padding: 16px 24px;
  text-align: center;
  min-width: 160px;
}

.arch-orch-supervisor {
  border-color: rgba(255,255,255,0.2);
  background: rgba(255,255,255,0.03);
}

.arch-orch-node-label {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 0.85rem;
  font-weight: 600;
  color: #fff;
  margin-bottom: 4px;
}

.arch-orch-node-desc {
  font-size: 0.72rem;
  color: rgba(255,255,255,0.3);
}

.arch-orch-arrows {
  display: flex;
  justify-content: center;
  gap: 120px;
  padding: 16px 0;
}

.arch-orch-arrow-line {
  width: 1px;
  height: 32px;
  background: rgba(255,255,255,0.1);
}

.arch-orch-children {
  display: flex;
  gap: 16px;
  justify-content: center;
  flex-wrap: wrap;
}

/* Tool types */
.arch-tools-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 1px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.06);
  margin-bottom: 32px;
}

.arch-tool-type {
  padding: 32px;
  background: #000;
}

.arch-tool-icon {
  font-size: 1.4rem;
  margin-bottom: 16px;
  opacity: 0.3;
}

.arch-tool-type h4 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 0.92rem;
  font-weight: 600;
  color: #fff;
  margin-bottom: 10px;
}

.arch-tool-type p {
  font-size: 0.82rem;
  color: rgba(255,255,255,0.4);
  line-height: 1.7;
}

/* Full stack */
.arch-full-stack {
  border: 1px solid rgba(255,255,255,0.06);
}

.arch-full-stack-row {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 32px;
  padding: 16px 24px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  align-items: baseline;
}

.arch-full-stack-row:last-child { border-bottom: none; }

.arch-full-stack-cat {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 0.78rem;
  font-weight: 600;
  color: rgba(255,255,255,0.25);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.arch-full-stack-items {
  font-size: 0.82rem;
  color: rgba(255,255,255,0.45);
  line-height: 1.6;
}

/* CTA */
.arch-cta-section {
  border-bottom: none;
  padding: 100px 48px;
}

.arch-cta-section h2 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: clamp(1.6rem, 3vw, 2.2rem);
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.03em;
}

.arch-cta-sub {
  font-size: 1rem;
  color: rgba(255,255,255,0.35);
  max-width: 500px;
  margin: 0 auto;
}

.arch-btn-fill {
  display: inline-block;
  padding: 12px 28px;
  background: #fff;
  color: #000;
  font-size: 0.88rem;
  font-weight: 600;
  border-radius: 8px;
  text-decoration: none;
  transition: opacity 0.15s;
  font-family: 'DM Sans', sans-serif;
}

.arch-btn-fill:hover { opacity: 0.85; color: #000; }

.arch-btn-ghost {
  display: inline-block;
  padding: 12px 28px;
  background: transparent;
  color: rgba(255,255,255,0.5);
  font-size: 0.88rem;
  font-weight: 500;
  border-radius: 8px;
  text-decoration: none;
  border: 1px solid rgba(255,255,255,0.1);
  transition: all 0.15s;
  font-family: 'DM Sans', sans-serif;
}

.arch-btn-ghost:hover {
  border-color: rgba(255,255,255,0.2);
  color: rgba(255,255,255,0.7);
}

/* Footer */
.arch-footer {
  padding: 32px 48px;
  border-top: 1px solid rgba(255,255,255,0.06);
  display: flex;
  justify-content: space-between;
  align-items: center;
  max-width: 1100px;
  margin: 0 auto;
}

.arch-footer-left { display: flex; gap: 16px; align-items: baseline; }

.arch-footer-brand {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 700;
  font-size: 0.92rem;
  color: rgba(255,255,255,0.7);
}

.arch-footer-copy {
  font-size: 0.75rem;
  color: rgba(255,255,255,0.2);
}

.arch-footer-links { display: flex; gap: 24px; }

.arch-footer-links a {
  color: rgba(255,255,255,0.25);
  text-decoration: none;
  font-size: 0.78rem;
  transition: color 0.15s;
}

.arch-footer-links a:hover { color: rgba(255,255,255,0.6); }

/* Animations */
.arch-reveal {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.5s ease, transform 0.5s ease;
}

.arch-visible {
  opacity: 1;
  transform: translateY(0);
}

/* Responsive */
@media (max-width: 768px) {
  .arch-nav { padding: 0 24px; }
  .arch-nav-links a:not(.arch-nav-cta) { display: none; }
  .arch-hero { padding: 140px 24px 80px; }
  .arch-hero h1 { font-size: 2rem; }
  .arch-section { padding: 56px 24px; }
  .arch-detail-grid { grid-template-columns: 1fr; }
  .arch-tools-grid { grid-template-columns: 1fr; }
  .arch-flow-row { flex-direction: column; gap: 8px; }
  .arch-flow-arrow { transform: rotate(90deg); margin: 4px 0; }
  .arch-layer-header { flex-direction: column; gap: 12px; }
  .arch-layer-n { font-size: 1.6rem; }
  .arch-orch-children { flex-direction: column; }
  .arch-orch-arrows { gap: 40px; }
  .arch-full-stack-row { grid-template-columns: 1fr; gap: 4px; }
  .arch-footer { flex-direction: column; gap: 20px; text-align: center; }
  .arch-footer-left { flex-direction: column; gap: 4px; align-items: center; }
}
`
