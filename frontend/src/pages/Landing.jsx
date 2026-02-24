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

  // Cane Sales Assistant widget (only on landing page)
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://cane.fyi/widget.js'
    script.setAttribute('data-api-key', import.meta.env.VITE_CANE_WIDGET_API_KEY || '')
    script.setAttribute('data-agent-name', 'Cane Sales Assistant')
    script.setAttribute('data-color', '#c8963e')
    script.setAttribute('data-position', 'right')
    script.setAttribute('data-greeting', "Hey! I'm the Cane Sales Assistant and yes, I was built using Cane. Ask me anything about the platform, or create an account to see how I was built.")
    script.setAttribute('data-subtitle', 'Built with Cane')
    script.setAttribute('data-placeholder', 'Ask about agents, pricing, features...')
    script.setAttribute('data-auto-open', '5')
    script.setAttribute('data-border-radius', '16')
    script.setAttribute('data-workspace-id', 'adf53cd1-b910-497c-91b8-bf8dea1eec0a')
    document.body.appendChild(script)

    return () => {
      // Clean up widget when leaving landing page
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
          Cane
          <span className="lp-nav-sub">Operational Intelligence</span>
        </span>
        <div className="lp-nav-links">
          <a href="#how">How it works</a>
          <a href="#platform">Platform</a>
          <a href="#deploy">Deploy</a>
          <Link to="/guide">Docs</Link>
          <Link to="/login" className="lp-nav-cta">Sign in</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="lp-hero">
        <div className="lp-hero-badge">MCP connections + agent marketplace + analytics dashboard</div>
        <h1>Build AI agents that <span className="lp-accent">prove they work.</span></h1>
        <p className="lp-hero-sub">
          Upload documents. Build a specialized agent. Connect it to your tools.
          Verify it with automated evaluations. Deploy anywhere.
        </p>
        <div className="lp-hero-ctas">
          <Link to="/register" className="lp-btn lp-btn-primary">Start building</Link>
          <a href="#how" className="lp-btn lp-btn-secondary">See how it works</a>
        </div>
        <div className="lp-hero-proof">
          <div className="lp-hero-stat">
            <div className="lp-val">Any file type</div>
            <div className="lp-label">PDF, DOCX, audio, video, images</div>
          </div>
          <div className="lp-hero-stat">
            <div className="lp-val">MCP Protocol</div>
            <div className="lp-label">Connect calendars, CRMs, email</div>
          </div>
          <div className="lp-hero-stat">
            <div className="lp-val">LLM-as-Judge</div>
            <div className="lp-label">Automated scoring & evals</div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="lp-section">
        <div className="lp-loop-section">
          <div className="lp-section-label lp-reveal">The Loop</div>
          <div className="lp-section-title lp-reveal">Documents in. Verified agent out.</div>
          <p className="lp-section-sub lp-reveal">
            Four steps from raw files to a deployed, evaluated, agentic AI — with proof it works.
          </p>
          <div className="lp-loop-grid">
            {[
              { num: '01', title: 'Upload anything', desc: 'PDFs, Word docs, spreadsheets, images, audio, video. Cane extracts text, runs OCR, transcribes media, and chunks everything for semantic search.', tag: 'PDF, DOCX, XLSX, CSV, PNG, MP3, MP4' },
              { num: '02', title: 'Build a specialized agent', desc: 'Pick a template or start from scratch. Build a support agent, compliance bot, or a digital replica of yourself. Auto-generate a system prompt tuned to your content.', tag: 'Support / Compliance / Ops / Digital Replica' },
              { num: '03', title: 'Evaluate and verify', desc: 'Write test cases. Define scoring criteria. Run automated evaluations with LLM-as-Judge. Iterate until your agent meets the quality bar.', tag: 'LLM-as-Judge with weighted criteria' },
              { num: '04', title: 'Deploy everywhere', desc: 'Embed on any website with one script tag. Customize colors, greeting, and logo. Track conversations with built-in analytics. Share on the marketplace.', tag: 'Widget / API / Marketplace / Analytics' },
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

      {/* Platform Capabilities */}
      <section id="platform" className="lp-section">
        <div className="lp-platform-section">
          <div className="lp-section-label lp-reveal">Platform</div>
          <div className="lp-section-title lp-reveal">Everything your agent needs.</div>
          <p className="lp-section-sub lp-reveal">
            Not just a chatbot. A full operational intelligence platform.
          </p>
          <div className="lp-cap-grid">
            {[
              {
                icon: 'MC', title: 'MCP Connections',
                desc: 'Connect agents to external services via Model Context Protocol. Browse the catalog or add custom servers. Calendars, CRMs, email, Slack — your agent can interact with them all.',
                detail: 'Google Calendar · Salesforce · Gmail · Slack · Custom servers',
              },
              {
                icon: 'WH', title: 'Webhook Tools',
                desc: 'Give agents the ability to take actions. Log to Google Sheets, send Slack notifications, trigger Zapier workflows, call any REST API. Fire-and-forget or wait for responses.',
                detail: 'POST / GET / PUT · Auth headers · Payload templates',
              },
              {
                icon: 'AN', title: 'Analytics Dashboard',
                desc: 'Track every conversation across every channel. See daily volume, response times, channel breakdown, tool usage, and satisfaction scores. Know exactly how your agent performs.',
                detail: 'Per-agent metrics · Channel breakdown · Feedback tracking',
              },
              {
                icon: 'WC', title: 'Widget Customization',
                desc: 'Customize every aspect of the chat widget. Colors, greeting, logo, position, border radius, auto-open delay. Live preview in the builder. One-click embed code generation.',
                detail: 'Live preview · Logo upload · Position control · Auto-open',
              },
              {
                icon: 'MP', title: 'Agent Marketplace',
                desc: 'Clone pre-built agent packs with system prompts, eval suites, and test cases. Publish your own agents for others to use. Independent verification through re-running evals.',
                detail: 'One-click clone · Eval verification · Featured packs',
              },
              {
                icon: 'EV', title: 'Evaluation Engine',
                desc: 'Define test cases and scoring criteria. Run automated evaluations with LLM-as-Judge. Get pass/warn/fail verdicts per test case. Weighted criteria: accuracy, completeness, relevance, faithfulness.',
                detail: 'Custom criteria · Custom rules · Score history',
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

      {/* Deploy */}
      <section id="deploy" className="lp-section">
        <div className="lp-widget-section">
          <div className="lp-section-label lp-reveal">Deploy</div>
          <div className="lp-section-title lp-reveal">On your website in 60 seconds.</div>
          <p className="lp-section-sub lp-reveal">One script tag. That's it. Your agent lives on your site with full tool execution and source citations.</p>
          <div className="lp-widget-layout">
            <div className="lp-widget-text">
              {[
                { n: '1', t: 'Build your agent', d: 'Upload docs, configure the prompt, add webhook tools and MCP connections.' },
                { n: '2', t: 'Verify with evals', d: 'Run automated test suites. Get a score. Iterate until the agent meets your quality bar.' },
                { n: '3', t: 'Customize the widget', d: 'Set colors, greeting, logo, and position. Preview it live. Copy the embed snippet.' },
                { n: '4', t: 'Track with analytics', d: 'Every conversation is logged. See volume trends, response times, channel breakdown, and feedback scores.' },
              ].map((p, i) => (
                <div key={i} className="lp-point lp-reveal">
                  <div className="lp-point-num">{p.n}</div>
                  <div>
                    <h4>{p.t}</h4>
                    <p>{p.d}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="lp-widget-mock lp-reveal">
              <div className="lp-widget-mock-header">Acme Support</div>
              <div className="lp-widget-mock-body">
                <div className="lp-widget-msg lp-widget-msg-user">What's your refund policy?</div>
                <div className="lp-widget-msg lp-widget-msg-agent">
                  According to our Terms of Service, refunds are available within 30 days of purchase for unused products. To request a refund, contact support with your order number.
                  <div className="lp-widget-msg-source">terms-of-service.pdf</div>
                </div>
                <div className="lp-widget-msg lp-widget-msg-user">I bought the wrong size last week. Can I return it?</div>
                <div className="lp-widget-msg lp-widget-msg-agent">
                  Yes, since your purchase was within the last 30 days, you're eligible for a full refund. Please have your order number ready and our team will process it.
                  <div className="lp-widget-msg-source">returns-policy.pdf</div>
                </div>
              </div>
              <div className="lp-widget-mock-input">Ask a question...</div>
            </div>
          </div>
        </div>
      </section>

      {/* Code Snippet */}
      <section className="lp-section">
        <div className="lp-code-section">
          <div className="lp-section-label lp-reveal">Integration</div>
          <div className="lp-section-title lp-reveal">One script tag.</div>
          <p className="lp-section-sub lp-reveal" style={{ marginLeft: 'auto', marginRight: 'auto' }}>No SDK. No build step. No dependencies. Works on any website.</p>
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
              {'  '}<span className="hl-attr">data-agent-name</span>=<span className="hl-val">"My Support Agent"</span>{'\n'}
              {'  '}<span className="hl-attr">data-workspace-id</span>=<span className="hl-val">"your-agent-id"</span>{'\n'}
              {'  '}<span className="hl-attr">data-color</span>=<span className="hl-val">"#c8963e"</span>{'\n'}
              {'  '}<span className="hl-attr">data-greeting</span>=<span className="hl-val">"Hi! How can I help?"</span>{'\n'}
              {'  '}<span className="hl-attr">data-logo-url</span>=<span className="hl-val">"https://yoursite.com/logo.png"</span>{'\n'}
              <span className="hl-tag">{'></script>'}</span>
            </pre>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="lp-footer">
        <div className="lp-footer-brand">Cane</div>
        <div className="lp-footer-links">
          <Link to="/guide">Docs</Link>
          <Link to="/marketplace">Marketplace</Link>
          <a href="mailto:hello@cane.fyi">Contact</a>
        </div>
        <div className="lp-footer-copy">2026 Cane. Operational Intelligence.</div>
      </footer>
    </div>
  )
}

const landingStyles = `
/* ── Landing page scoped styles ── */
.lp {
  font-family: 'DM Sans', sans-serif;
  background: #1a1510;
  color: #e8dfcf;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
  overflow-x: hidden;
  position: relative;
}

.lp::before {
  content: '';
  position: fixed;
  inset: 0;
  opacity: 0.03;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  pointer-events: none;
  z-index: 0;
}

/* Nav */
.lp-nav {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 100;
  padding: 20px 48px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  backdrop-filter: blur(20px);
  background: rgba(26, 21, 16, 0.8);
  border-bottom: 1px solid rgba(255,255,255,0.04);
}

.lp-nav-brand {
  font-family: 'Outfit', sans-serif;
  font-weight: 800;
  font-size: 2.2rem;
  color: #f3efe6;
  letter-spacing: -0.02em;
  display: flex;
  flex-direction: column;
  line-height: 1;
}

.lp-nav-sub {
  font-size: 0.55rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #8a7a62;
  margin-top: 4px;
}

.lp-nav-links { display: flex; gap: 32px; align-items: center; }

.lp-nav-links a {
  color: #b5a48a;
  text-decoration: none;
  font-size: 0.875rem;
  font-weight: 500;
  transition: color 0.2s;
}

.lp-nav-links a:hover { color: #f3efe6; }

.lp-nav-cta {
  background: #c8963e !important;
  color: white !important;
  padding: 8px 20px;
  border-radius: 6px;
  font-weight: 600 !important;
  transition: background 0.2s !important;
}

.lp-nav-cta:hover { background: #b5842e !important; }

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
  width: 800px; height: 800px;
  background: radial-gradient(ellipse, rgba(200, 150, 62, 0.08) 0%, transparent 70%);
  pointer-events: none;
}

.lp-hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  border-radius: 20px;
  border: 1px solid rgba(200, 150, 62, 0.25);
  background: rgba(200, 150, 62, 0.08);
  font-size: 0.8rem;
  font-weight: 600;
  color: #dbb06a;
  margin-bottom: 32px;
  letter-spacing: 0.02em;
  animation: lpFadeUp 0.6s ease both;
}

.lp-hero h1 {
  font-family: 'Outfit', sans-serif;
  font-size: clamp(2.8rem, 6vw, 4.5rem);
  font-weight: 900;
  color: #f3efe6;
  letter-spacing: -0.04em;
  line-height: 1.05;
  max-width: 800px;
  margin-bottom: 24px;
  animation: lpFadeUp 0.6s ease 0.1s both;
}

.lp-accent { color: #c8963e; }

.lp-hero-sub {
  font-size: 1.15rem;
  color: #b5a48a;
  max-width: 560px;
  line-height: 1.7;
  margin-bottom: 44px;
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
  font-size: 1rem;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.2s;
  cursor: pointer;
  border: none;
  display: inline-block;
}

.lp-btn-primary {
  background: #c8963e;
  color: white;
}

.lp-btn-primary:hover {
  background: #b5842e;
  color: white;
  transform: translateY(-1px);
  box-shadow: 0 8px 24px rgba(200, 150, 62, 0.25);
}

.lp-btn-secondary {
  background: rgba(255,255,255,0.06);
  color: #e8dfcf;
  border: 1px solid rgba(255,255,255,0.1);
}

.lp-btn-secondary:hover {
  background: rgba(255,255,255,0.1);
  border-color: rgba(255,255,255,0.2);
  color: #e8dfcf;
}

.lp-hero-proof {
  margin-top: 64px;
  display: flex;
  gap: 48px;
  animation: lpFadeUp 0.6s ease 0.4s both;
}

.lp-hero-stat { text-align: center; }

.lp-val {
  font-family: 'Outfit', sans-serif;
  font-size: 1.5rem;
  font-weight: 800;
  color: #f3efe6;
  letter-spacing: -0.02em;
}

.lp-label {
  font-size: 0.78rem;
  color: #8a7a62;
  margin-top: 2px;
}

/* Sections */
.lp-section {
  position: relative;
  z-index: 1;
  padding: 120px 48px;
}

.lp-section-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #c8963e;
  margin-bottom: 16px;
}

.lp-section-title {
  font-family: 'Outfit', sans-serif;
  font-size: clamp(2rem, 4vw, 2.8rem);
  font-weight: 800;
  color: #f3efe6;
  letter-spacing: -0.03em;
  line-height: 1.1;
  margin-bottom: 16px;
}

.lp-section-sub {
  font-size: 1.05rem;
  color: #b5a48a;
  max-width: 520px;
  line-height: 1.7;
}

/* Loop */
.lp-loop-section { max-width: 1100px; margin: 0 auto; }

.lp-loop-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 64px;
}

.lp-loop-card {
  padding: 40px 36px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.06);
  background: rgba(255,255,255,0.02);
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.lp-loop-card:hover {
  border-color: rgba(200, 150, 62, 0.2);
  background: rgba(200, 150, 62, 0.04);
  transform: translateY(-2px);
}

.lp-step-num {
  font-family: 'Outfit', sans-serif;
  font-size: 3rem;
  font-weight: 900;
  color: rgba(200, 150, 62, 0.1);
  position: absolute;
  top: 20px; right: 28px;
  line-height: 1;
}

.lp-loop-card h3 {
  font-family: 'Outfit', sans-serif;
  font-size: 1.25rem;
  font-weight: 700;
  color: #f3efe6;
  margin-bottom: 10px;
  letter-spacing: -0.01em;
}

.lp-loop-card p {
  font-size: 0.92rem;
  color: #b5a48a;
  line-height: 1.65;
}

.lp-tag {
  display: inline-block;
  margin-top: 16px;
  padding: 4px 12px;
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  font-weight: 500;
  color: #dbb06a;
  background: rgba(200, 150, 62, 0.1);
  border: 1px solid rgba(200, 150, 62, 0.15);
}

/* Platform Capabilities */
.lp-platform-section {
  max-width: 1100px;
  margin: 0 auto;
  border-top: 1px solid rgba(255,255,255,0.06);
}

.lp-cap-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 16px;
  margin-top: 64px;
}

.lp-cap-card {
  padding: 32px 28px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.06);
  background: rgba(255,255,255,0.02);
  transition: all 0.3s ease;
}

.lp-cap-card:hover {
  border-color: rgba(200, 150, 62, 0.2);
  background: rgba(200, 150, 62, 0.04);
  transform: translateY(-2px);
}

.lp-cap-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: rgba(200, 150, 62, 0.12);
  color: #c8963e;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Outfit', sans-serif;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  margin-bottom: 16px;
}

.lp-cap-card h3 {
  font-family: 'Outfit', sans-serif;
  font-size: 1.05rem;
  font-weight: 700;
  color: #f3efe6;
  margin-bottom: 8px;
  letter-spacing: -0.01em;
}

.lp-cap-card p {
  font-size: 0.84rem;
  color: #b5a48a;
  line-height: 1.6;
  margin-bottom: 12px;
}

.lp-cap-detail {
  display: block;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.65rem;
  color: #8a7a62;
  line-height: 1.7;
}

/* Widget */
.lp-widget-section {
  max-width: 1100px;
  margin: 0 auto;
  border-top: 1px solid rgba(255,255,255,0.06);
}

.lp-widget-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 80px;
  align-items: center;
  margin-top: 64px;
}

.lp-point {
  display: flex;
  gap: 16px;
  margin-bottom: 28px;
}

.lp-point-num {
  width: 28px; height: 28px;
  border-radius: 6px;
  background: rgba(200, 150, 62, 0.12);
  color: #c8963e;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Outfit', sans-serif;
  font-weight: 800;
  font-size: 0.8rem;
  flex-shrink: 0;
  margin-top: 2px;
}

.lp-point h4 {
  font-family: 'Outfit', sans-serif;
  font-size: 0.95rem;
  font-weight: 700;
  color: #f3efe6;
  margin-bottom: 4px;
}

.lp-point p {
  font-size: 0.85rem;
  color: #8a7a62;
  line-height: 1.6;
}

.lp-widget-mock {
  background: #2d261e;
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,0.08);
  overflow: hidden;
  box-shadow: 0 24px 64px rgba(0,0,0,0.3);
}

.lp-widget-mock-header {
  padding: 16px 20px;
  background: #c8963e;
  color: white;
  font-family: 'Outfit', sans-serif;
  font-weight: 700;
  font-size: 0.9rem;
}

.lp-widget-mock-body {
  padding: 20px;
  min-height: 260px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.lp-widget-msg {
  max-width: 85%;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 0.82rem;
  line-height: 1.55;
}

.lp-widget-msg-user {
  align-self: flex-end;
  background: #c8963e;
  color: white;
  border-bottom-right-radius: 4px;
}

.lp-widget-msg-agent {
  align-self: flex-start;
  background: rgba(255,255,255,0.06);
  color: #e8dfcf;
  border-bottom-left-radius: 4px;
}

.lp-widget-msg-source {
  display: inline-block;
  margin-top: 6px;
  padding: 2px 8px;
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.65rem;
  background: rgba(200, 150, 62, 0.12);
  color: #dbb06a;
}

.lp-widget-mock-input {
  padding: 14px 20px;
  border-top: 1px solid rgba(255,255,255,0.06);
  color: #5c4f3d;
  font-size: 0.82rem;
}

/* Code */
.lp-code-section {
  max-width: 1100px;
  margin: 0 auto;
  text-align: center;
  border-top: 1px solid rgba(255,255,255,0.06);
}

.lp-code-block {
  max-width: 640px;
  margin: 48px auto 0;
  background: rgba(0,0,0,0.3);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px;
  overflow: hidden;
  text-align: left;
}

.lp-code-block-header {
  padding: 12px 20px;
  background: rgba(255,255,255,0.03);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.72rem;
  color: #8a7a62;
  display: flex;
  align-items: center;
  gap: 8px;
}

.lp-dots { display: flex; gap: 5px; }
.lp-dots span {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: rgba(255,255,255,0.1);
  display: inline-block;
}

.lp-code-block pre {
  padding: 24px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.78rem;
  line-height: 1.7;
  color: #d4c8b0;
  overflow-x: auto;
  margin: 0;
}

.lp .hl-tag { color: #c8963e; }
.lp .hl-attr { color: #b5a48a; }
.lp .hl-val { color: #7dae7d; }
.lp .hl-comment { color: #5c4f3d; font-style: italic; }

/* Footer */
.lp-footer {
  position: relative;
  z-index: 1;
  padding: 48px;
  border-top: 1px solid rgba(255,255,255,0.04);
  display: flex;
  justify-content: space-between;
  align-items: center;
  max-width: 1100px;
  margin: 0 auto;
}

.lp-footer-brand {
  font-family: 'Outfit', sans-serif;
  font-weight: 800;
  font-size: 1.1rem;
  color: #d4c8b0;
}

.lp-footer-links { display: flex; gap: 28px; }

.lp-footer-links a {
  color: #8a7a62;
  text-decoration: none;
  font-size: 0.82rem;
  transition: color 0.2s;
}

.lp-footer-links a:hover { color: #d4c8b0; }

.lp-footer-copy {
  font-size: 0.78rem;
  color: #5c4f3d;
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
  .lp-section { padding: 80px 24px; }
  .lp-hero { padding: 120px 24px 80px; }
  .lp-hero h1 { font-size: 2.4rem; }
  .lp-loop-grid { grid-template-columns: 1fr; }
  .lp-cap-grid { grid-template-columns: 1fr; }
  .lp-widget-layout { grid-template-columns: 1fr; gap: 40px; }
  .lp-hero-proof { flex-direction: column; gap: 24px; }
  .lp-footer { flex-direction: column; gap: 24px; text-align: center; }
}
`