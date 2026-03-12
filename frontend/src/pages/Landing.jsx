import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'

export default function Landing() {
  const containerRef = useRef(null)

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) entry.target.classList.add('lp-visible')
      })
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' })

    const els = containerRef.current?.querySelectorAll('.lp-reveal')
    els?.forEach(el => observer.observe(el))
    return () => els?.forEach(el => observer.unobserve(el))
  }, [])

  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://cane.fyi/widget.js'
    script.setAttribute('data-api-key', 'cane_d26764c44d6887c7b0820033388c6810b6c9fed3bdf91989')
    script.setAttribute('data-agent-name', 'Cane')
    script.setAttribute('data-color', '#2563eb')
    script.setAttribute('data-position', 'right')
    script.setAttribute('data-greeting', "Ask me anything about Cane: how it works, the architecture, what it can do.")
    script.setAttribute('data-subtitle', 'Live agent')
    script.setAttribute('data-placeholder', 'Ask a question...')
    script.setAttribute('data-auto-open', '8')
    script.setAttribute('data-border-radius', '16')
    script.setAttribute('data-workspace-id', '826e009f-ddb9-42a0-9c4e-89e88f6ed8e2')
    document.body.appendChild(script)
    return () => {
      document.body.removeChild(script)
      const widgetEl = document.getElementById('cane-widget-host')
      if (widgetEl) widgetEl.remove()
    }
  }, [])

  return (
    <div ref={containerRef} className="lp">
      <style>{landingStyles}</style>

      {/* Nav */}
      <nav className="lp-nav">
        <Link to="/" className="lp-logo">Cane</Link>
        <div className="lp-nav-links">
          <a href="#architecture">Architecture</a>
          <a href="#capabilities">Capabilities</a>
          <Link to="/demo">Demo</Link>
          <Link to="/guide">Docs</Link>
          <Link to="/login" className="lp-nav-cta">Sign in</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="lp-hero">
        <h1 className="lp-reveal">
          The complete stack for<br />
          production AI agents
        </h1>
        <p className="lp-hero-sub lp-reveal">
          Ingest documents. Build specialized agents with persistent memory and scheduled autonomy.
          Connect tools, orchestrate sub-agents, and deploy anywhere with one script tag.
        </p>
        <div className="lp-hero-actions lp-reveal">
          <Link to="/demo" className="lp-btn-fill">Try the live demo</Link>
          <Link to="/architecture" className="lp-btn-ghost">See the architecture</Link>
        </div>
      </section>

      {/* Divider stats */}
      <section className="lp-stats lp-reveal">
        <div className="lp-stats-inner">
          {[
            ['Hybrid RAG', 'Vector + BM25 + cross-encoder re-ranking'],
            ['Agent Memory', 'Persistent learning from every conversation turn'],
            ['Agent Orchestration', 'Sub-agents, scheduled runs, multi-agent delegation'],
            ['LLM-as-Judge', 'Automated eval with weighted scoring criteria'],
          ].map(([title, desc], i) => (
            <div key={i} className="lp-stat">
              <div className="lp-stat-title">{title}</div>
              <div className="lp-stat-desc">{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Architecture */}
      <section id="architecture" className="lp-section">
        <div className="lp-contain">
          <div className="lp-section-head lp-reveal">
            <h2>Architecture</h2>
            <p>Six layers. Each one built, not imported.</p>
          </div>
          <div className="lp-arch-grid">
            {[
              {
                n: '01', title: 'Ingestion',
                body: 'Upload files or connect Google Drive via OAuth. Text extraction for PDFs and DOCX, OCR for images, Whisper transcription for audio and video. Content is chunked and embedded with BGE for vector search.',
                stack: 'FastAPI, Tesseract, Whisper, Google Drive API, Fernet encryption',
              },
              {
                n: '02', title: 'Retrieval',
                body: 'Hybrid search combining dense vector similarity and sparse BM25 keyword matching. Results merged with Reciprocal Rank Fusion, then re-ranked by a cross-encoder. Final chunks and persistent memories sent to Claude for context-aware answers.',
                stack: 'ChromaDB, BGE-base-en, BM25, ms-marco MiniLM cross-encoder',
              },
              {
                n: '03', title: 'Agents & Orchestration',
                body: 'Scoped knowledge bases with custom system prompts and persistent memory. Agents call webhook tools, connect to MCP servers, delegate to sub-agents, and run on configurable schedules for full autonomy.',
                stack: 'Claude API, MCP Protocol, agent-as-tool, memory extraction, scheduled runner',
              },
              {
                n: '04', title: 'Tools & Integrations',
                body: 'Three tool backends unified into one palette. Webhook actions for HTTP calls, MCP servers for protocol-native integrations, and linked agents for multi-agent delegation. Claude picks the right tool at runtime.',
                stack: 'Webhook executor, MCP client, SSE streaming, unified tool router',
              },
              {
                n: '05', title: 'Memory & Scheduling',
                body: 'Agents extract facts, preferences, and instructions from every conversation. Memories persist across sessions and are injected into future prompts. Scheduled runs execute agents autonomously on intervals or daily triggers.',
                stack: 'Background extraction, deduplication, daemon threads, cron-style scheduler',
              },
              {
                n: '06', title: 'Evaluation',
                body: 'Automated test suites scored by an LLM judge. Four criteria: accuracy, completeness, relevance, and faithfulness. Configurable weights and custom rules. Score history tracks improvement across runs.',
                stack: 'LLM-as-Judge, weighted criteria, custom rules, regression tracking',
              },
            ].map((item, i) => (
              <div key={i} className="lp-arch-item lp-reveal">
                <div className="lp-arch-n">{item.n}</div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
                <div className="lp-arch-stack">{item.stack}</div>
              </div>
            ))}
          </div>
          <div className="lp-arch-link lp-reveal">
            <Link to="/architecture">Full architecture deep dive &rarr;</Link>
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section id="capabilities" className="lp-section">
        <div className="lp-contain">
          <div className="lp-section-head lp-reveal">
            <h2>Capabilities</h2>
            <p>What the platform does, end to end.</p>
          </div>
          <div className="lp-cap-list">
            {[
              ['Hybrid RAG Pipeline', 'Vector search, BM25 keyword matching, Reciprocal Rank Fusion, and cross-encoder re-ranking in a single retrieval pass. Not just embeddings.'],
              ['Agent Memory', 'Agents extract facts, preferences, and instructions from conversations automatically. Memories persist across sessions and are injected into future prompts so agents get smarter over time.'],
              ['Scheduled Agent Runs', 'Configure agents to run autonomously on intervals or daily triggers. Background execution with run history, status tracking, and manual trigger support. Built for daily briefings and automated workflows.'],
              ['Multi-Agent Orchestration', 'Link agents as callable tools. A supervisor agent delegates questions to specialists and combines their answers. Depth-limited recursion prevents runaway chains.'],
              ['Google Drive Sync', 'OAuth popup, folder picker, incremental sync via the Changes API. Google Docs and Sheets auto-export to text. Encrypted credential storage.'],
              ['MCP Connections', 'Model Context Protocol for connecting agents to Slack, Google Calendar, HubSpot, and more. Pre-built connector catalog plus custom server support.'],
              ['Webhook Tools', 'HTTP actions triggered by agent reasoning. Fire-and-forget for notifications, wait-for-response for live data lookups. Custom headers and payload templates.'],
              ['Evaluation Engine', 'Write test cases with expected answers. Run automated scoring with configurable criteria weights and custom rules. Track scores across runs to catch regressions.'],
              ['Analytics Dashboard', 'Per-agent conversation tracking. Volume, response times, channel breakdown, tool usage, and satisfaction scores from user feedback.'],
              ['Widget & API Deployment', 'Embeddable chat widget with full customization. REST API with key-scoped auth and streaming responses. One script tag to deploy on any website.'],
              ['Agent Marketplace', 'Publish agents with eval scores attached. Others can clone your agent and independently verify accuracy by re-running the test suite on their copy.'],
            ].map(([title, desc], i) => (
              <div key={i} className="lp-cap-row lp-reveal">
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stack */}
      <section className="lp-section">
        <div className="lp-contain">
          <div className="lp-section-head lp-reveal">
            <h2>Stack</h2>
          </div>
          <div className="lp-stack-row lp-reveal">
            {[
              ['Backend', 'Python, FastAPI, Gunicorn, SQLAlchemy'],
              ['AI / ML', 'Claude API, BGE embeddings, BM25, cross-encoder re-ranking, memory extraction'],
              ['Storage', 'MySQL, ChromaDB, Google Drive API'],
              ['Frontend', 'React 18, Vite, Lucide icons, tabbed agent config'],
              ['Auth', 'JWT, OAuth 2.0, Fernet encryption, scoped API keys'],
              ['Infra', 'Railway, background workers, scheduled runner, daemon threads'],
            ].map(([label, val], i) => (
              <div key={i} className="lp-stack-item">
                <span className="lp-stack-label">{label}</span>
                <span className="lp-stack-val">{val}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo CTA */}
      <section className="lp-section lp-demo-section">
        <div className="lp-contain lp-reveal" style={{ textAlign: 'center' }}>
          <h2 style={{ marginBottom: 16 }}>Talk to it.</h2>
          <p className="lp-demo-sub">
            There is a live agent running on this platform right now. Upload a file, ask a question, and see the full pipeline in action. No account needed.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <Link to="/demo" className="lp-btn-fill">Open demo</Link>
            <Link to="/architecture" className="lp-btn-ghost">Read the architecture</Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="lp-footer">
        <div className="lp-footer-left">
          <span className="lp-footer-brand">Cane</span>
          <span className="lp-footer-copy">Built by Colin</span>
        </div>
        <div className="lp-footer-links">
          <Link to="/demo">Demo</Link>
          <Link to="/guide">Docs</Link>
          <Link to="/architecture">Architecture</Link>
          <Link to="/marketplace">Marketplace</Link>
          <a href="mailto:hello@cane.fyi">Contact</a>
        </div>
      </footer>
    </div>
  )
}

const landingStyles = `
.lp {
  font-family: 'DM Sans', -apple-system, sans-serif;
  background: #000;
  color: rgba(255,255,255,0.5);
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
}

/* Nav */
.lp-nav {
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

.lp-logo {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 700;
  font-size: 1.15rem;
  color: #fff;
  text-decoration: none;
  letter-spacing: -0.02em;
}

.lp-nav-links { display: flex; gap: 32px; align-items: center; }

.lp-nav-links a {
  color: rgba(255,255,255,0.4);
  text-decoration: none;
  font-size: 0.82rem;
  font-weight: 500;
  transition: color 0.15s;
}

.lp-nav-links a:hover { color: #fff; }

.lp-nav-cta {
  color: #fff !important;
  background: rgba(255,255,255,0.08);
  padding: 6px 16px;
  border-radius: 6px;
  transition: background 0.15s !important;
}

.lp-nav-cta:hover { background: rgba(255,255,255,0.14) !important; }

/* Hero */
.lp-hero {
  padding: 180px 48px 120px;
  max-width: 900px;
  margin: 0 auto;
}

.lp-hero h1 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: clamp(2.8rem, 5.5vw, 4.2rem);
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.035em;
  line-height: 1.1;
  margin-bottom: 28px;
}

.lp-hero-sub {
  font-size: 1.05rem;
  color: rgba(255,255,255,0.4);
  max-width: 560px;
  line-height: 1.7;
  margin-bottom: 40px;
}

.lp-hero-actions { display: flex; gap: 12px; }

.lp-btn-fill {
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

.lp-btn-fill:hover { opacity: 0.85; color: #000; }

.lp-btn-ghost {
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

.lp-btn-ghost:hover {
  border-color: rgba(255,255,255,0.2);
  color: rgba(255,255,255,0.7);
}

/* Stats bar */
.lp-stats {
  border-top: 1px solid rgba(255,255,255,0.06);
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

.lp-stats-inner {
  max-width: 1100px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  padding: 0 48px;
}

.lp-stat {
  padding: 36px 0;
  border-left: 1px solid rgba(255,255,255,0.06);
  padding-left: 24px;
}

.lp-stat:first-child { border-left: none; padding-left: 0; }

.lp-stat-title {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 0.88rem;
  font-weight: 600;
  color: #fff;
  margin-bottom: 4px;
  letter-spacing: -0.01em;
}

.lp-stat-desc {
  font-size: 0.78rem;
  color: rgba(255,255,255,0.3);
  line-height: 1.5;
}

/* Sections */
.lp-section {
  padding: 100px 48px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

.lp-contain { max-width: 1000px; margin: 0 auto; }

.lp-section-head { margin-bottom: 56px; }

.lp-section-head h2 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: clamp(1.6rem, 3vw, 2.2rem);
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.03em;
  margin-bottom: 8px;
}

.lp-section-head p {
  font-size: 0.95rem;
  color: rgba(255,255,255,0.35);
}

/* Architecture grid */
.lp-arch-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.06);
}

.lp-arch-item {
  padding: 40px 36px;
  background: #000;
}

.lp-arch-n {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 0.72rem;
  font-weight: 600;
  color: rgba(255,255,255,0.15);
  margin-bottom: 16px;
  letter-spacing: 0.02em;
}

.lp-arch-item h3 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1.1rem;
  font-weight: 600;
  color: #fff;
  margin-bottom: 12px;
  letter-spacing: -0.01em;
}

.lp-arch-item p {
  font-size: 0.85rem;
  color: rgba(255,255,255,0.4);
  line-height: 1.7;
  margin-bottom: 16px;
}

.lp-arch-stack {
  font-size: 0.72rem;
  color: rgba(255,255,255,0.2);
  line-height: 1.6;
}

.lp-arch-link {
  margin-top: 32px;
  text-align: center;
}

.lp-arch-link a {
  color: rgba(255,255,255,0.35);
  text-decoration: none;
  font-size: 0.85rem;
  font-weight: 500;
  transition: color 0.15s;
}

.lp-arch-link a:hover { color: rgba(255,255,255,0.7); }

/* Capabilities list */
.lp-cap-list {
  display: flex;
  flex-direction: column;
}

.lp-cap-row {
  padding: 28px 0;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 40px;
  align-items: baseline;
}

.lp-cap-row:last-child { border-bottom: none; }

.lp-cap-row h3 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 0.92rem;
  font-weight: 600;
  color: #fff;
  letter-spacing: -0.01em;
}

.lp-cap-row p {
  font-size: 0.85rem;
  color: rgba(255,255,255,0.4);
  line-height: 1.7;
}

/* Stack */
.lp-stack-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  border-top: 1px solid rgba(255,255,255,0.06);
}

.lp-stack-item {
  flex: 1 1 33%;
  padding: 20px 0;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  display: flex;
  gap: 16px;
  align-items: baseline;
}

.lp-stack-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(255,255,255,0.25);
  min-width: 70px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.lp-stack-val {
  font-size: 0.82rem;
  color: rgba(255,255,255,0.45);
}

/* Demo section */
.lp-demo-section { border-bottom: none; }

.lp-demo-sub {
  font-size: 1rem;
  color: rgba(255,255,255,0.35);
  margin-bottom: 32px;
}

/* Footer */
.lp-footer {
  padding: 32px 48px;
  border-top: 1px solid rgba(255,255,255,0.06);
  display: flex;
  justify-content: space-between;
  align-items: center;
  max-width: 1100px;
  margin: 0 auto;
}

.lp-footer-left { display: flex; gap: 16px; align-items: baseline; }

.lp-footer-brand {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 700;
  font-size: 0.92rem;
  color: rgba(255,255,255,0.7);
}

.lp-footer-copy {
  font-size: 0.75rem;
  color: rgba(255,255,255,0.2);
}

.lp-footer-links { display: flex; gap: 24px; }

.lp-footer-links a {
  color: rgba(255,255,255,0.25);
  text-decoration: none;
  font-size: 0.78rem;
  transition: color 0.15s;
}

.lp-footer-links a:hover { color: rgba(255,255,255,0.6); }

/* Animations */
@keyframes lpFadeUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

.lp-reveal {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.5s ease, transform 0.5s ease;
}

.lp-visible {
  opacity: 1;
  transform: translateY(0);
}

/* Responsive */
@media (max-width: 768px) {
  .lp-nav { padding: 0 24px; }
  .lp-nav-links a:not(.lp-nav-cta) { display: none; }
  .lp-hero { padding: 140px 24px 80px; }
  .lp-hero h1 { font-size: 2.2rem; }
  .lp-section { padding: 64px 24px; }
  .lp-stats-inner { grid-template-columns: 1fr 1fr; }
  .lp-stat { padding: 24px 0; }
  .lp-arch-grid { grid-template-columns: 1fr; }
  .lp-cap-row { grid-template-columns: 1fr; gap: 8px; }
  .lp-stack-item { flex: 1 1 100%; }
  .lp-footer { flex-direction: column; gap: 20px; text-align: center; }
  .lp-footer-left { flex-direction: column; gap: 4px; align-items: center; }
}
`
