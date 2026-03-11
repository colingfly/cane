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

  // Widget — now with cyan color to match new palette
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://cane.fyi/widget.js'
    script.setAttribute('data-api-key', 'cane_d26764c44d6887c7b0820033388c6810b6c9fed3bdf91989')
    script.setAttribute('data-agent-name', 'Cane Agent')
    script.setAttribute('data-color', '#0088ff')
    script.setAttribute('data-position', 'right')
    script.setAttribute('data-greeting', "I'm an AI agent running on Cane. Ask me anything about the platform — architecture, features, integrations, whatever.")
    script.setAttribute('data-subtitle', 'Live Demo')
    script.setAttribute('data-placeholder', 'Ask me anything...')
    script.setAttribute('data-auto-open', '5')
    script.setAttribute('data-border-radius', '12')
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
        <span className="lp-nav-brand">
          CANE
          <span className="lp-nav-sub">AI Agent Platform</span>
        </span>
        <div className="lp-nav-links">
          <a href="#how">Architecture</a>
          <a href="#platform">Platform</a>
          <Link to="/demo">Live Demo</Link>
          <Link to="/guide">Docs</Link>
          <Link to="/login" className="lp-nav-cta">Sign in</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="lp-hero">
        <div className="lp-hero-badge">
          <span className="lp-badge-dot" />
          Full-stack AI platform — built from scratch
        </div>
        <h1>Documents in.<br /><span className="lp-accent">Intelligence out.</span></h1>
        <p className="lp-hero-sub">
          A production AI agent platform with RAG search, Google Drive sync, MCP tool execution,
          automated evaluations, and embeddable widgets. Built by Colin.
        </p>
        <div className="lp-hero-ctas">
          <Link to="/demo" className="lp-btn lp-btn-primary">Talk to a live agent</Link>
          <a href="#how" className="lp-btn lp-btn-secondary">See the architecture</a>
        </div>
        <div className="lp-hero-proof">
          <div className="lp-hero-stat">
            <div className="lp-val">RAG Pipeline</div>
            <div className="lp-label">Hybrid search + re-ranking</div>
          </div>
          <div className="lp-hero-stat">
            <div className="lp-val">Live Sync</div>
            <div className="lp-label">Google Drive OAuth + Changes API</div>
          </div>
          <div className="lp-hero-stat">
            <div className="lp-val">LLM-as-Judge</div>
            <div className="lp-label">Automated scoring & evals</div>
          </div>
          <div className="lp-hero-stat">
            <div className="lp-val">MCP</div>
            <div className="lp-label">Tool execution protocol</div>
          </div>
        </div>
      </section>

      {/* Architecture / How it works */}
      <section id="how" className="lp-section">
        <div className="lp-loop-section">
          <div className="lp-section-label lp-reveal">Architecture</div>
          <div className="lp-section-title lp-reveal">End-to-end. No shortcuts.</div>
          <p className="lp-section-sub lp-reveal">
            Every layer — ingestion, search, evaluation, deployment — built and wired together.
          </p>
          <div className="lp-loop-grid">
            {[
              {
                num: '01', title: 'Ingest & Sync',
                desc: 'Upload files or sync Google Drive folders via OAuth. Text extraction, OCR, audio/video transcription, chunking, and embedding — all automated. Drive folders stay in sync via the Changes API.',
                tag: 'FastAPI · Whisper · Tesseract · Google Drive API · Fernet encryption',
              },
              {
                num: '02', title: 'Hybrid RAG Search',
                desc: 'Dense vector embeddings (BGE) + sparse BM25 keyword matching, fused with Reciprocal Rank Fusion, then re-ranked by a cross-encoder. Top chunks go to Claude with full conversation context.',
                tag: 'ChromaDB · BGE-base · BM25 · ms-marco cross-encoder · RRF',
              },
              {
                num: '03', title: 'Agent + Tool Execution',
                desc: 'Custom agents with scoped knowledge bases, system prompts, webhook tools, and MCP connections. Claude decides when to call tools — fire-and-forget or wait-for-response. Full streaming.',
                tag: 'Claude API · MCP Protocol · Webhook tools · Streaming SSE',
              },
              {
                num: '04', title: 'Evaluate & Deploy',
                desc: 'Automated test suites with LLM-as-Judge scoring. Weighted criteria — accuracy, completeness, relevance, faithfulness. Deploy via embeddable widget, REST API, or marketplace.',
                tag: 'LLM-as-Judge · Widget embed · REST API · Agent marketplace',
              },
            ].map((card, i) => (
              <div key={i} className="lp-loop-card lp-reveal">
                <div className="lp-step-num">{card.num}</div>
                <h3>{card.title}</h3>
                <p>{card.desc}</p>
                <span className="lp-tag">{card.tag}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tech Stack */}
      <section className="lp-section">
        <div className="lp-stack-section">
          <div className="lp-section-label lp-reveal">Stack</div>
          <div className="lp-section-title lp-reveal">What powers it.</div>
          <div className="lp-stack-grid lp-reveal">
            {[
              { label: 'Backend', items: 'Python · FastAPI · Gunicorn · SQLAlchemy' },
              { label: 'AI / ML', items: 'Claude API · BGE embeddings · BM25 · Cross-encoder re-ranking' },
              { label: 'Storage', items: 'MySQL · ChromaDB · Google Drive API' },
              { label: 'Frontend', items: 'React · Vite · Vanilla CSS' },
              { label: 'Infra', items: 'Railway · Gunicorn workers · Background sync loops' },
              { label: 'Auth', items: 'JWT · OAuth 2.0 · Fernet token encryption · API keys' },
            ].map((s, i) => (
              <div key={i} className="lp-stack-item">
                <div className="lp-stack-label">{s.label}</div>
                <div className="lp-stack-val">{s.items}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Platform Capabilities */}
      <section id="platform" className="lp-section">
        <div className="lp-platform-section">
          <div className="lp-section-label lp-reveal">Platform</div>
          <div className="lp-section-title lp-reveal">Not a wrapper. The whole thing.</div>
          <p className="lp-section-sub lp-reveal">
            Every feature — from OAuth flows to real-time sync to scoring engines — built from scratch.
          </p>
          <div className="lp-cap-grid">
            {[
              {
                icon: 'GD', title: 'Google Drive Sync',
                desc: 'OAuth popup flow, folder picker, initial + incremental sync via Changes API. Google Docs/Sheets/Slides auto-export. Encrypted credential storage.',
                detail: 'OAuth 2.0 · Changes API · Fernet encryption · Background polling',
              },
              {
                icon: 'MC', title: 'MCP Connections',
                desc: 'Model Context Protocol for connecting agents to external services. Catalog browser + custom server URLs. Auto-discovers available tools.',
                detail: 'Google Calendar · Salesforce · Gmail · Slack · Custom servers',
              },
              {
                icon: 'WH', title: 'Webhook Tools',
                desc: 'HTTP tool execution from within Claude responses. Fire-and-forget or wait-for-response. Custom payload templates with variable interpolation.',
                detail: 'POST / GET / PUT · Auth headers · Payload templates · Tool chaining',
              },
              {
                icon: 'EV', title: 'Evaluation Engine',
                desc: 'Automated test suites with LLM-as-Judge. Four weighted criteria plus custom rules. Score history, failure classification, pass/warn/fail verdicts.',
                detail: 'Custom criteria · Custom rules · Score history · Regression detection',
              },
              {
                icon: 'AN', title: 'Analytics',
                desc: 'Per-agent conversation tracking across all channels. Volume, response times, channel breakdown, tool usage, satisfaction scores from feedback.',
                detail: 'Per-agent metrics · Channel breakdown · Feedback tracking',
              },
              {
                icon: 'EM', title: 'Widget & API',
                desc: 'Embeddable chat widget with full customization — colors, logo, greeting, position, auto-open. REST API with API key auth. One script tag deployment.',
                detail: 'Widget builder · Live preview · REST API · Streaming responses',
              },
            ].map((cap, i) => (
              <div key={i} className="lp-cap-card lp-reveal">
                <div className="lp-cap-icon">{cap.icon}</div>
                <h3>{cap.title}</h3>
                <p>{cap.desc}</p>
                <span className="lp-cap-detail">{cap.detail}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Live Demo CTA */}
      <section className="lp-section">
        <div className="lp-demo-section lp-reveal">
          <div className="lp-demo-inner">
            <div className="lp-section-label">Live</div>
            <div className="lp-demo-title">Don't take my word for it.</div>
            <p className="lp-demo-sub">
              Talk to a live AI agent running on Cane right now. No signup required. Ask it anything about the platform.
            </p>
            <Link to="/demo" className="lp-btn lp-btn-primary lp-btn-glow">Open live demo</Link>
          </div>
        </div>
      </section>

      {/* Code Snippet */}
      <section className="lp-section">
        <div className="lp-code-section">
          <div className="lp-section-label lp-reveal">Integration</div>
          <div className="lp-section-title lp-reveal">One script tag.</div>
          <p className="lp-section-sub lp-reveal" style={{ marginLeft: 'auto', marginRight: 'auto' }}>No SDK. No build step. No dependencies.</p>
          <div className="lp-code-block lp-reveal">
            <div className="lp-code-block-header">
              <div className="lp-dots"><span /><span /><span /></div>
              index.html
            </div>
            <pre>
              <span className="hl-comment">{'<!-- Add this before </body> -->'}</span>{'\n'}
              <span className="hl-tag">{'<script'}</span>{'\n'}
              {'  '}<span className="hl-attr">src</span>=<span className="hl-val">"https://cane.fyi/widget.js"</span>{'\n'}
              {'  '}<span className="hl-attr">data-api-key</span>=<span className="hl-val">"cane_your_key_here"</span>{'\n'}
              {'  '}<span className="hl-attr">data-agent-name</span>=<span className="hl-val">"My Agent"</span>{'\n'}
              {'  '}<span className="hl-attr">data-workspace-id</span>=<span className="hl-val">"your-agent-id"</span>{'\n'}
              {'  '}<span className="hl-attr">data-color</span>=<span className="hl-val">"#0088ff"</span>{'\n'}
              {'  '}<span className="hl-attr">data-greeting</span>=<span className="hl-val">"Hi! How can I help?"</span>{'\n'}
              <span className="hl-tag">{'></script>'}</span>
            </pre>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="lp-footer">
        <div className="lp-footer-brand">CANE</div>
        <div className="lp-footer-links">
          <Link to="/demo">Live Demo</Link>
          <Link to="/guide">Docs</Link>
          <Link to="/marketplace">Marketplace</Link>
          <a href="mailto:hello@cane.fyi">Contact</a>
        </div>
        <div className="lp-footer-copy">Built by Colin. 2026.</div>
      </footer>
    </div>
  )
}

const landingStyles = `
/* ── Landing — Cyan/Blue dark theme ── */
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700;800&display=swap');

.lp {
  font-family: 'DM Sans', sans-serif;
  background: #06080f;
  color: #c0d0e0;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
  overflow-x: hidden;
  position: relative;
}

/* Subtle grid background */
.lp::before {
  content: '';
  position: fixed;
  inset: 0;
  opacity: 0.025;
  background-image:
    linear-gradient(rgba(0, 180, 255, 0.3) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 180, 255, 0.3) 1px, transparent 1px);
  background-size: 60px 60px;
  pointer-events: none;
  z-index: 0;
}

/* Nav */
.lp-nav {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 100;
  padding: 18px 48px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  backdrop-filter: blur(20px);
  background: rgba(6, 8, 15, 0.85);
  border-bottom: 1px solid rgba(0, 180, 255, 0.06);
}

.lp-nav-brand {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 800;
  font-size: 1.6rem;
  color: #00d4ff;
  letter-spacing: 0.06em;
  display: flex;
  flex-direction: column;
  line-height: 1;
}

.lp-nav-sub {
  font-size: 0.5rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #2d5a7a;
  margin-top: 3px;
}

.lp-nav-links { display: flex; gap: 28px; align-items: center; }

.lp-nav-links a {
  color: #5a7a94;
  text-decoration: none;
  font-size: 0.82rem;
  font-weight: 500;
  transition: color 0.2s;
  font-family: 'DM Sans', sans-serif;
}

.lp-nav-links a:hover { color: #c0d0e0; }

.lp-nav-cta {
  background: #0088ff !important;
  color: white !important;
  padding: 8px 20px;
  border-radius: 6px;
  font-weight: 600 !important;
  transition: all 0.2s !important;
}

.lp-nav-cta:hover {
  background: #006dd4 !important;
  box-shadow: 0 0 20px rgba(0, 136, 255, 0.2);
}

/* Hero */
.lp-hero {
  position: relative;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 140px 24px 100px;
  z-index: 1;
}

.lp-hero::before {
  content: '';
  position: absolute;
  top: -200px; left: 50%;
  transform: translateX(-50%);
  width: 900px; height: 900px;
  background: radial-gradient(ellipse, rgba(0, 140, 255, 0.06) 0%, rgba(0, 212, 255, 0.02) 40%, transparent 70%);
  pointer-events: none;
}

.lp-hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  border-radius: 20px;
  border: 1px solid rgba(0, 180, 255, 0.2);
  background: rgba(0, 180, 255, 0.05);
  font-size: 0.78rem;
  font-weight: 600;
  color: #4db8e0;
  margin-bottom: 32px;
  letter-spacing: 0.02em;
  animation: lpFadeUp 0.6s ease both;
  font-family: 'JetBrains Mono', monospace;
}

.lp-badge-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: #00ff88;
  box-shadow: 0 0 8px rgba(0, 255, 136, 0.4);
  display: inline-block;
}

.lp-hero h1 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: clamp(3rem, 7vw, 5rem);
  font-weight: 800;
  color: #e8f0f8;
  letter-spacing: -0.04em;
  line-height: 1.05;
  max-width: 800px;
  margin-bottom: 24px;
  animation: lpFadeUp 0.6s ease 0.1s both;
}

.lp-accent {
  background: linear-gradient(135deg, #00d4ff, #0066ff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.lp-hero-sub {
  font-size: 1.1rem;
  color: #6a8aaa;
  max-width: 600px;
  line-height: 1.7;
  margin-bottom: 40px;
  animation: lpFadeUp 0.6s ease 0.2s both;
}

.lp-hero-ctas {
  display: flex;
  gap: 16px;
  animation: lpFadeUp 0.6s ease 0.3s both;
}

.lp-btn {
  padding: 14px 32px;
  border-radius: 8px;
  font-family: 'DM Sans', sans-serif;
  font-size: 0.95rem;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.2s;
  cursor: pointer;
  border: none;
  display: inline-block;
}

.lp-btn-primary {
  background: #0088ff;
  color: white;
}

.lp-btn-primary:hover {
  background: #006dd4;
  color: white;
  transform: translateY(-1px);
  box-shadow: 0 8px 32px rgba(0, 136, 255, 0.3);
}

.lp-btn-glow {
  box-shadow: 0 0 24px rgba(0, 136, 255, 0.2);
}

.lp-btn-secondary {
  background: rgba(0, 180, 255, 0.06);
  color: #8ab0d0;
  border: 1px solid rgba(0, 180, 255, 0.12);
}

.lp-btn-secondary:hover {
  background: rgba(0, 180, 255, 0.1);
  border-color: rgba(0, 180, 255, 0.25);
  color: #c0d0e0;
}

.lp-hero-proof {
  margin-top: 64px;
  display: flex;
  gap: 40px;
  animation: lpFadeUp 0.6s ease 0.4s both;
}

.lp-hero-stat { text-align: center; }

.lp-val {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1.1rem;
  font-weight: 700;
  color: #e0e8f0;
  letter-spacing: -0.01em;
}

.lp-label {
  font-size: 0.72rem;
  color: #3d6080;
  margin-top: 2px;
  font-family: 'JetBrains Mono', monospace;
}

/* Sections */
.lp-section {
  position: relative;
  z-index: 1;
  padding: 100px 48px;
}

.lp-section-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #00b4ff;
  margin-bottom: 16px;
}

.lp-section-title {
  font-family: 'Space Grotesk', sans-serif;
  font-size: clamp(1.8rem, 4vw, 2.6rem);
  font-weight: 800;
  color: #e0e8f0;
  letter-spacing: -0.03em;
  line-height: 1.1;
  margin-bottom: 16px;
}

.lp-section-sub {
  font-size: 1rem;
  color: #5a7a94;
  max-width: 520px;
  line-height: 1.7;
}

/* Architecture loop */
.lp-loop-section { max-width: 1100px; margin: 0 auto; }

.lp-loop-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 56px;
}

.lp-loop-card {
  padding: 36px 32px;
  border-radius: 12px;
  border: 1px solid rgba(0, 180, 255, 0.06);
  background: rgba(0, 20, 40, 0.3);
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.lp-loop-card:hover {
  border-color: rgba(0, 180, 255, 0.15);
  background: rgba(0, 30, 60, 0.3);
  transform: translateY(-2px);
}

.lp-step-num {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 3rem;
  font-weight: 800;
  color: rgba(0, 140, 255, 0.07);
  position: absolute;
  top: 16px; right: 24px;
  line-height: 1;
}

.lp-loop-card h3 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1.15rem;
  font-weight: 700;
  color: #d0e0f0;
  margin-bottom: 10px;
  letter-spacing: -0.01em;
}

.lp-loop-card p {
  font-size: 0.88rem;
  color: #5a7a94;
  line-height: 1.65;
}

.lp-tag {
  display: inline-block;
  margin-top: 16px;
  padding: 4px 12px;
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.62rem;
  font-weight: 500;
  color: #4db8e0;
  background: rgba(0, 180, 255, 0.06);
  border: 1px solid rgba(0, 180, 255, 0.1);
  line-height: 1.8;
}

/* Tech Stack */
.lp-stack-section {
  max-width: 1100px;
  margin: 0 auto;
  border-top: 1px solid rgba(0, 180, 255, 0.06);
}

.lp-stack-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
  margin-top: 48px;
}

.lp-stack-item {
  padding: 20px 22px;
  border-radius: 10px;
  border: 1px solid rgba(0, 180, 255, 0.06);
  background: rgba(0, 20, 40, 0.3);
}

.lp-stack-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #00b4ff;
  margin-bottom: 8px;
}

.lp-stack-val {
  font-size: 0.82rem;
  color: #6a8aaa;
  line-height: 1.6;
}

/* Platform Capabilities */
.lp-platform-section {
  max-width: 1100px;
  margin: 0 auto;
  border-top: 1px solid rgba(0, 180, 255, 0.06);
}

.lp-cap-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 16px;
  margin-top: 56px;
}

.lp-cap-card {
  padding: 28px 24px;
  border-radius: 12px;
  border: 1px solid rgba(0, 180, 255, 0.06);
  background: rgba(0, 20, 40, 0.3);
  transition: all 0.3s ease;
}

.lp-cap-card:hover {
  border-color: rgba(0, 180, 255, 0.15);
  background: rgba(0, 30, 60, 0.3);
  transform: translateY(-2px);
}

.lp-cap-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: rgba(0, 140, 255, 0.1);
  color: #00b4ff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Space Grotesk', sans-serif;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  margin-bottom: 14px;
  border: 1px solid rgba(0, 180, 255, 0.1);
}

.lp-cap-card h3 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1rem;
  font-weight: 700;
  color: #d0e0f0;
  margin-bottom: 8px;
  letter-spacing: -0.01em;
}

.lp-cap-card p {
  font-size: 0.82rem;
  color: #5a7a94;
  line-height: 1.6;
  margin-bottom: 12px;
}

.lp-cap-detail {
  display: block;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.6rem;
  color: #3d6080;
  line-height: 1.7;
}

/* Demo CTA */
.lp-demo-section {
  max-width: 700px;
  margin: 0 auto;
  text-align: center;
}

.lp-demo-inner {
  padding: 56px 48px;
  border-radius: 16px;
  border: 1px solid rgba(0, 180, 255, 0.1);
  background: rgba(0, 30, 60, 0.2);
  position: relative;
  overflow: hidden;
}

.lp-demo-inner::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center, rgba(0, 136, 255, 0.05) 0%, transparent 70%);
  pointer-events: none;
}

.lp-demo-title {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1.8rem;
  font-weight: 800;
  color: #e0e8f0;
  letter-spacing: -0.03em;
  margin-bottom: 12px;
  position: relative;
}

.lp-demo-sub {
  font-size: 0.95rem;
  color: #5a7a94;
  line-height: 1.7;
  margin-bottom: 28px;
  position: relative;
}

/* Code */
.lp-code-section {
  max-width: 1100px;
  margin: 0 auto;
  text-align: center;
  border-top: 1px solid rgba(0, 180, 255, 0.06);
}

.lp-code-block {
  max-width: 560px;
  margin: 40px auto 0;
  background: rgba(0, 10, 20, 0.5);
  border: 1px solid rgba(0, 180, 255, 0.08);
  border-radius: 12px;
  overflow: hidden;
  text-align: left;
}

.lp-code-block-header {
  padding: 12px 20px;
  background: rgba(0, 180, 255, 0.03);
  border-bottom: 1px solid rgba(0, 180, 255, 0.06);
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  color: #3d6080;
  display: flex;
  align-items: center;
  gap: 8px;
}

.lp-dots { display: flex; gap: 5px; }
.lp-dots span {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: rgba(0, 180, 255, 0.12);
  display: inline-block;
}

.lp-code-block pre {
  padding: 24px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.76rem;
  line-height: 1.7;
  color: #7a9ab0;
  overflow-x: auto;
  margin: 0;
}

.lp .hl-tag { color: #00b4ff; }
.lp .hl-attr { color: #5a7a94; }
.lp .hl-val { color: #4db8e0; }
.lp .hl-comment { color: #2a4a60; font-style: italic; }

/* Footer */
.lp-footer {
  position: relative;
  z-index: 1;
  padding: 48px;
  border-top: 1px solid rgba(0, 180, 255, 0.06);
  display: flex;
  justify-content: space-between;
  align-items: center;
  max-width: 1100px;
  margin: 0 auto;
}

.lp-footer-brand {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 800;
  font-size: 1rem;
  color: #00b4ff;
  letter-spacing: 0.06em;
}

.lp-footer-links { display: flex; gap: 24px; }

.lp-footer-links a {
  color: #3d6080;
  text-decoration: none;
  font-size: 0.78rem;
  transition: color 0.2s;
}

.lp-footer-links a:hover { color: #8ab0d0; }

.lp-footer-copy {
  font-size: 0.72rem;
  color: #1e3a50;
  font-family: 'JetBrains Mono', monospace;
}

/* Animations */
@keyframes lpFadeUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.lp-reveal {
  opacity: 0;
  transform: translateY(30px);
  transition: opacity 0.6s ease, transform 0.6s ease;
}

.lp-visible {
  opacity: 1;
  transform: translateY(0);
}

/* Responsive */
@media (max-width: 768px) {
  .lp-nav { padding: 16px 24px; }
  .lp-nav-links a:not(.lp-nav-cta) { display: none; }
  .lp-section { padding: 72px 24px; }
  .lp-hero { padding: 120px 24px 80px; }
  .lp-hero h1 { font-size: 2.6rem; }
  .lp-loop-grid { grid-template-columns: 1fr; }
  .lp-cap-grid { grid-template-columns: 1fr; }
  .lp-stack-grid { grid-template-columns: 1fr; }
  .lp-hero-proof { flex-wrap: wrap; justify-content: center; gap: 20px; }
  .lp-footer { flex-direction: column; gap: 24px; text-align: center; }
  .lp-demo-inner { padding: 40px 24px; }
}
`
