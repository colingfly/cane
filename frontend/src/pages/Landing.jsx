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
          <div className="lp-dropdown">
            <span className="lp-dropdown-trigger">Products <span className="lp-chevron">&#9662;</span></span>
            <div className="lp-dropdown-menu"><div className="lp-dropdown-inner">
              <a href="#orchestration" className="lp-dropdown-item">
                <span className="lp-dropdown-title">Orchestration</span>
                <span className="lp-dropdown-desc">Agent networks, delegation, tracing</span>
              </a>
              <a href="#eval" className="lp-dropdown-item">
                <span className="lp-dropdown-title">Eval</span>
                <span className="lp-dropdown-desc">LLM judge, regression detection, analytics</span>
              </a>
              <a href="#post-training" className="lp-dropdown-item">
                <span className="lp-dropdown-title">Post-Training</span>
                <span className="lp-dropdown-desc">Dataset export, fine-tuning, lineage</span>
              </a>
            </div></div>
          </div>
          <Link to="/guide">Docs</Link>
          <Link to="/login" className="lp-nav-cta">Sign in</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="lp-hero">
        <div className="lp-hero-grid">
          <div className="lp-hero-left">
            <h1 className="lp-reveal">
              Build for the<br />agentic economy.
            </h1>
            <p className="lp-hero-sub lp-reveal">
              Orchestrate agent networks. Evaluate with LLM judges. Export training data and fine-tune. One platform from prototype to production.
            </p>
            <div className="lp-hero-actions lp-reveal">
              <Link to="/register" className="lp-btn-fill">Get started free</Link>
              <Link to="/guide" className="lp-btn-ghost">Read the docs</Link>
            </div>
            <div className="lp-trust-line lp-reveal">
              <code>pip install cane</code>
              <span className="lp-trust-sep">|</span>
              <span>Open API. Python SDK. Embeddable widget.</span>
            </div>
          </div>
          <div className="lp-hero-right lp-reveal">
            <div className="lp-code-block">
              <div className="lp-code-header">
                <span className="lp-code-dot" style={{ background: '#ff5f57' }} />
                <span className="lp-code-dot" style={{ background: '#febc2e' }} />
                <span className="lp-code-dot" style={{ background: '#28c840' }} />
                <span className="lp-code-file">app.py</span>
              </div>
              <pre className="lp-code-body">{`from cane import Cane

client = Cane(api_key="cane_xxx")

# Query your agent
result = client.ask(
    "What is our refund policy?",
    workspace_id="ws_abc123"
)

print(result["answer"])
print(result["sources"])`}</pre>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="lp-stats lp-reveal">
        <div className="lp-stats-inner">
          {[
            ['4 export formats', 'SFT, DPO, OpenAI, raw JSONL'],
            ['4-stage retrieval', 'Vector, BM25, RRF, cross-encoder'],
            ['3 auth modes', 'JWT, OAuth 2.0, scoped API keys'],
            ['Full audit trail', 'Every inter-agent call logged with ms timing'],
          ].map(([title, desc], i) => (
            <div key={i} className="lp-stat">
              <div className="lp-stat-title">{title}</div>
              <div className="lp-stat-desc">{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Pillar 1: Orchestration */}
      <section id="orchestration" className="lp-section">
        <div className="lp-contain">
          <div className="lp-section-head lp-reveal">
            <div className="lp-product-label">Orchestration</div>
            <h2>Connect, route, and trace agent networks.</h2>
            <p>Agent-to-agent delegation, automatic routing, execution tracing, and external agent registration. Build multi-agent systems with full observability.</p>
          </div>

          {/* Network SVG */}
          <div className="lp-network-svg lp-reveal">
            <svg viewBox="0 0 600 400" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <marker id="arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <path d="M0,0 L8,3 L0,6" fill="rgba(255,255,255,0.25)" />
                </marker>
              </defs>
              <line x1="410" y1="120" x2="210" y2="185" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" markerEnd="url(#arrow)" />
              <line x1="300" y1="320" x2="210" y2="210" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" markerEnd="url(#arrow)" />
              <line x1="300" y1="320" x2="430" y2="180" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" markerEnd="url(#arrow)" />
              <circle cx="190" cy="200" r="36" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
              <circle cx="190" cy="200" r="34" fill="rgba(255,255,255,0.04)" />
              <text x="190" y="196" textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="11" fontWeight="600" fontFamily="Space Grotesk, sans-serif">AI</text>
              <text x="190" y="210" textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="11" fontWeight="600" fontFamily="Space Grotesk, sans-serif">News</text>
              <text x="190" y="252" textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="10" fontFamily="DM Sans, sans-serif">Web scraper</text>
              <circle cx="420" cy="140" r="36" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
              <circle cx="420" cy="140" r="34" fill="rgba(255,255,255,0.04)" />
              <text x="420" y="136" textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="11" fontWeight="600" fontFamily="Space Grotesk, sans-serif">Tweet</text>
              <text x="420" y="150" textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="11" fontWeight="600" fontFamily="Space Grotesk, sans-serif">Gen</text>
              <text x="420" y="192" textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="10" fontFamily="DM Sans, sans-serif">Content writer</text>
              <circle cx="440" cy="280" r="36" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
              <circle cx="440" cy="280" r="34" fill="rgba(255,255,255,0.04)" />
              <text x="440" y="276" textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="11" fontWeight="600" fontFamily="Space Grotesk, sans-serif">Lead</text>
              <text x="440" y="290" textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="11" fontWeight="600" fontFamily="Space Grotesk, sans-serif">Research</text>
              <text x="440" y="332" textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="10" fontFamily="DM Sans, sans-serif">Company intel</text>
              <circle cx="290" cy="330" r="36" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
              <circle cx="290" cy="330" r="34" fill="rgba(255,255,255,0.06)" />
              <text x="290" y="326" textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="11" fontWeight="600" fontFamily="Space Grotesk, sans-serif">Cold</text>
              <text x="290" y="340" textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="11" fontWeight="600" fontFamily="Space Grotesk, sans-serif">Outreach</text>
              <text x="290" y="382" textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="10" fontFamily="DM Sans, sans-serif">Email writer</text>
              <text x="305" y="140" textAnchor="middle" fill="rgba(255,255,255,0.15)" fontSize="8" fontFamily="JetBrains Mono, monospace">delegates</text>
              <text x="235" y="275" textAnchor="middle" fill="rgba(255,255,255,0.15)" fontSize="8" fontFamily="JetBrains Mono, monospace">delegates</text>
              <text x="380" y="310" textAnchor="middle" fill="rgba(255,255,255,0.15)" fontSize="8" fontFamily="JetBrains Mono, monospace">delegates</text>
            </svg>
          </div>

          <div className="lp-product-grid">
            {[
              ['Agent-to-Agent Delegation', 'Link any agent as a callable tool for another agent. A supervisor delegates questions to specialists and combines their answers. Depth-limited recursion prevents runaway chains.'],
              ['Orchestrator Mode', 'Flip one toggle and an agent becomes a router. It auto-discovers every other agent in your workspace, reads their descriptions, and routes incoming queries to the right specialist.'],
              ['External Agent Registry', 'Register any HTTP endpoint as an agent in the Cane network. Bearer, header, or no auth. Your external agents appear in the graph and can be delegated to by any native agent.'],
              ['Execution Tracing', 'Every inter-agent call is logged with caller, callee, query, response, depth level, and millisecond timing. Reconstruct full session flows. Detect performance hotspots and error patterns.'],
            ].map(([title, desc], i) => (
              <div key={i} className="lp-product-card lp-reveal">
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
            ))}
          </div>

          {/* Orchestration code block */}
          <div className="lp-section-code lp-reveal">
            <div className="lp-code-block">
              <div className="lp-code-header">
                <span className="lp-code-dot" style={{ background: '#ff5f57' }} />
                <span className="lp-code-dot" style={{ background: '#febc2e' }} />
                <span className="lp-code-dot" style={{ background: '#28c840' }} />
                <span className="lp-code-file">orchestrate.py</span>
              </div>
              <pre className="lp-code-body">{`from cane import Cane

client = Cane(api_key="cane_xxx")

# Register an external agent
client.register_agent(
    name="Compliance Check",
    description="Verify regulatory compliance",
    endpoint="https://your-api.com/comply",
    auth_type="bearer",
    auth_token="sk_xxx"
)

# Link it as a tool for another agent
client.link_agent(
    agent_id="agent_compliance",
    parent_agent_id="agent_support",
    tool_name="compliance_check",
    tool_description="Check regulatory compliance"
)

# View the full network graph
graph = client.network()
print(f"{len(graph['nodes'])} agents, {len(graph['edges'])} links")`}</pre>
            </div>
          </div>
        </div>
      </section>

      {/* Pillar 2: Eval */}
      <section id="eval" className="lp-section">
        <div className="lp-contain">
          <div className="lp-section-head lp-reveal">
            <div className="lp-product-label">Eval</div>
            <h2>Measure, track, and verify agent quality.</h2>
            <p>LLM-as-judge scoring with weighted criteria. Regression detection across runs. Failure pattern analysis. Consistency tracking. Full analytics pipeline.</p>
          </div>
          <div className="lp-product-grid lp-product-grid-3">
            {[
              ['LLM-as-Judge', 'Write test cases with expected answers. An LLM judge scores each response on accuracy, completeness, relevance, and faithfulness. Custom criteria weights and natural-language rules.'],
              ['Regression Detection', 'Compare scores across runs question-by-question. Surface questions where accuracy dropped after a prompt change. Catch regressions before they reach users.'],
              ['Score Trends', 'Track mean, median, p5, and p95 scores across every run. Visualize improvement or degradation over time. Know exactly how your agent is trending.'],
              ['Consistency Analysis', 'Measure answer variance across multiple runs of the same questions. Flag volatile questions that produce inconsistent results. Consistency scores from 0 to 100.'],
              ['Failure Patterns', 'Classify failures into categories: hallucination, incomplete, inaccurate, poor citation, tone issues. See which patterns dominate and get sample questions for each.'],
              ['Latency Analysis', 'P50, p95, and p99 response times per run. Identify slow questions. Track latency distribution with histogram bucketing. Spot performance bottlenecks.'],
            ].map(([title, desc], i) => (
              <div key={i} className="lp-product-card lp-reveal">
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
            ))}
          </div>

          {/* Eval code block */}
          <div className="lp-section-code lp-reveal">
            <div className="lp-code-block">
              <div className="lp-code-header">
                <span className="lp-code-dot" style={{ background: '#ff5f57' }} />
                <span className="lp-code-dot" style={{ background: '#febc2e' }} />
                <span className="lp-code-dot" style={{ background: '#28c840' }} />
                <span className="lp-code-file">terminal</span>
              </div>
              <pre className="lp-code-body">{`# List available eval suites
curl -H "Authorization: Bearer cane_xxx" \\
  https://cane.fyi/v1/eval/suites

# Submit your agent for evaluation
curl -X POST -H "Authorization: Bearer cane_xxx" \\
  "https://cane.fyi/v1/eval/run?environment_id=suite_123\\
  &target_url=https://your-agent.com/ask"

# Get results
curl -H "Authorization: Bearer cane_xxx" \\
  https://cane.fyi/v1/eval/run/run_456

# Response:
# {
#   "status": "completed",
#   "overall_score": 87.3,
#   "passed": 42, "warned": 5, "failed": 3,
#   "results": [...]
# }`}</pre>
            </div>
          </div>
        </div>
      </section>

      {/* Pillar 3: Post-Training */}
      <section id="post-training" className="lp-section">
        <div className="lp-contain">
          <div className="lp-section-head lp-reveal">
            <div className="lp-product-label">Post-Training</div>
            <h2>From eval results to fine-tuned models.</h2>
            <p>Export high-scoring eval results as training data. Submit fine-tuning jobs. Compare base vs. fine-tuned models. Track model lineage back to the eval suite that produced the data.</p>
          </div>

          {/* Pipeline visualization */}
          <div className="lp-pipeline lp-reveal">
            {[
              'Run Evals',
              'Filter by Score',
              'Export Dataset',
              'Fine-tune',
              'Re-evaluate',
            ].map((step, i) => (
              <div key={i} className="lp-pipeline-step">
                <div className="lp-pipeline-num">{i + 1}</div>
                <div className="lp-pipeline-title">{step}</div>
                {i < 4 && <div className="lp-pipeline-arrow">&rarr;</div>}
              </div>
            ))}
          </div>

          <div className="lp-product-grid">
            {[
              ['Dataset Export', 'Export eval results as JSONL in 4 formats: SFT (prompt/completion), DPO (chosen/rejected preference pairs), OpenAI messages format, or raw with full scores and metadata.'],
              ['Fine-tuning Pipeline', 'Generate datasets filtered by score threshold, submit fine-tuning jobs to OpenAI, and track training progress. All from within the platform.'],
              ['Model Comparison', 'Side-by-side comparison of base model vs. fine-tuned model responses. Send the same question to both and see the difference in quality.'],
              ['Lineage Tracking', 'Every fine-tuned model links back to the eval suite, score threshold, and training examples that produced it. Full provenance from data to deployed model.'],
            ].map(([title, desc], i) => (
              <div key={i} className="lp-product-card lp-reveal">
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
            ))}
          </div>

          {/* Post-training code block */}
          <div className="lp-section-code lp-reveal">
            <div className="lp-code-block">
              <div className="lp-code-header">
                <span className="lp-code-dot" style={{ background: '#ff5f57' }} />
                <span className="lp-code-dot" style={{ background: '#febc2e' }} />
                <span className="lp-code-dot" style={{ background: '#28c840' }} />
                <span className="lp-code-file">terminal</span>
              </div>
              <pre className="lp-code-body">{`# Export high-scoring results as OpenAI training data
curl -H "Authorization: Bearer cane_xxx" \\
  "https://cane.fyi/v1/eval/export/run_456\\
  ?format=openai&min_score=80"

# Output (JSONL):
# {"messages": [
#   {"role": "system", "content": "You are a helpful assistant."},
#   {"role": "user", "content": "What is our refund policy?"},
#   {"role": "assistant", "content": "Our refund policy allows..."}
# ]}`}</pre>
            </div>
          </div>
        </div>
      </section>

      {/* SDK / API Credibility */}
      <section className="lp-section">
        <div className="lp-contain">
          <div className="lp-section-head lp-reveal">
            <h2>Built for developers.</h2>
            <p>Python SDK, REST API, and embeddable widget. Three ways to integrate.</p>
          </div>
          <div className="lp-sdk-grid lp-reveal">
            <div className="lp-sdk-col">
              <div className="lp-sdk-label">Python SDK</div>
              <div className="lp-code-block lp-code-sm">
                <pre className="lp-code-body">{`pip install cane

from cane import Cane
client = Cane(api_key="cane_xxx")
result = client.ask("Your question")`}</pre>
              </div>
            </div>
            <div className="lp-sdk-col">
              <div className="lp-sdk-label">REST API</div>
              <div className="lp-code-block lp-code-sm">
                <pre className="lp-code-body">{`curl -X POST \\
  https://cane.fyi/v1/ask \\
  -H "Authorization: Bearer cane_xxx" \\
  -d '{"query": "Your question"}'`}</pre>
              </div>
            </div>
            <div className="lp-sdk-col">
              <div className="lp-sdk-label">Embed Widget</div>
              <div className="lp-code-block lp-code-sm">
                <pre className="lp-code-body">{`<script
  src="https://cane.fyi/widget.js"
  data-api-key="cane_xxx"
  data-agent-name="Support"
  data-color="#2563eb">
</script>`}</pre>
              </div>
            </div>
          </div>
          <div className="lp-arch-link lp-reveal">
            <Link to="/guide">Full API and SDK reference &rarr;</Link>
          </div>
        </div>
      </section>

      {/* Architecture */}
      <section className="lp-section">
        <div className="lp-contain">
          <div className="lp-section-head lp-reveal">
            <h2>Architecture</h2>
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

      {/* CTA */}
      <section className="lp-section lp-demo-section">
        <div className="lp-contain lp-reveal" style={{ textAlign: 'center' }}>
          <h2 style={{ marginBottom: 16 }}>Ship agents to production.</h2>
          <p className="lp-demo-sub">
            Orchestrate. Evaluate. Fine-tune. The complete infrastructure for production AI agents.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <Link to="/register" className="lp-btn-fill">Get started free</Link>
            <Link to="/guide" className="lp-btn-ghost">Read the docs</Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="lp-footer">
        <div className="lp-footer-links">
          <a href="#orchestration">Orchestration</a>
          <a href="#eval">Eval</a>
          <a href="#post-training">Post-Training</a>
          <Link to="/guide">Docs</Link>
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

.lp-nav-links a, .lp-dropdown-trigger {
  color: rgba(255,255,255,0.4);
  text-decoration: none;
  font-size: 0.82rem;
  font-weight: 500;
  transition: color 0.15s;
  cursor: pointer;
}

.lp-nav-links a:hover, .lp-dropdown:hover .lp-dropdown-trigger { color: #fff; }

.lp-nav-cta {
  color: #fff !important;
  background: #2563eb;
  padding: 6px 16px;
  border-radius: 6px;
  transition: background 0.15s !important;
}

.lp-nav-cta:hover { background: #3b82f6 !important; }

/* Dropdown */
.lp-dropdown { position: relative; }

.lp-dropdown-trigger {
  display: flex;
  align-items: center;
  gap: 4px;
  user-select: none;
}

.lp-chevron {
  font-size: 0.6rem;
  transition: transform 0.2s;
}

.lp-dropdown:hover .lp-chevron { transform: rotate(180deg); }

.lp-dropdown-menu {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  padding-top: 8px;
  width: 280px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
}

.lp-dropdown:hover .lp-dropdown-menu {
  opacity: 1;
  pointer-events: auto;
}

.lp-dropdown-inner {
  background: rgba(10,10,10,0.95);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  padding: 8px;
}

.lp-dropdown-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 14px;
  border-radius: 8px;
  text-decoration: none !important;
  transition: background 0.1s;
}

.lp-dropdown-item:hover { background: rgba(37,99,235,0.08); }

.lp-dropdown-title {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 0.82rem;
  font-weight: 600;
  color: #fff !important;
  letter-spacing: -0.01em;
}

.lp-dropdown-desc {
  font-size: 0.72rem;
  color: rgba(255,255,255,0.35) !important;
  line-height: 1.4;
}

/* Hero */
.lp-hero {
  padding: 160px 48px 100px;
  max-width: 1100px;
  margin: 0 auto;
}

.lp-hero-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 64px;
  align-items: center;
}

.lp-eyebrow {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 0.7rem;
  font-weight: 700;
  color: #60a5fa;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  margin-bottom: 20px;
}

.lp-hero h1 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: clamp(2.2rem, 4vw, 3.2rem);
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.035em;
  line-height: 1.1;
  margin-bottom: 24px;
}

.lp-hero-sub {
  font-size: 1.05rem;
  color: rgba(255,255,255,0.45);
  max-width: 480px;
  line-height: 1.7;
  margin-bottom: 32px;
}

.lp-hero-actions { display: flex; gap: 12px; margin-bottom: 32px; }

.lp-trust-line {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.78rem;
  color: rgba(255,255,255,0.3);
}

.lp-trust-line code {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  color: #60a5fa;
  background: rgba(37,99,235,0.1);
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid rgba(37,99,235,0.15);
}

.lp-trust-sep {
  color: rgba(255,255,255,0.12);
}

/* Buttons */
.lp-btn-fill {
  display: inline-block;
  padding: 12px 28px;
  background: #2563eb;
  color: #fff;
  font-size: 0.88rem;
  font-weight: 600;
  border-radius: 8px;
  text-decoration: none;
  transition: all 0.15s;
  font-family: 'DM Sans', sans-serif;
}

.lp-btn-fill:hover { background: #3b82f6; color: #fff; }

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
  border-color: rgba(37,99,235,0.3);
  color: rgba(255,255,255,0.7);
}

/* Code blocks */
.lp-code-block {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  overflow: hidden;
}

.lp-code-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 16px;
  background: rgba(255,255,255,0.03);
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

.lp-code-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.lp-code-file {
  margin-left: 8px;
  font-size: 0.72rem;
  color: rgba(255,255,255,0.3);
  font-family: 'JetBrains Mono', monospace;
}

.lp-code-body {
  padding: 20px;
  margin: 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.78rem;
  line-height: 1.7;
  color: rgba(255,255,255,0.6);
  overflow-x: auto;
  white-space: pre;
}

.lp-code-sm .lp-code-body {
  padding: 16px;
  font-size: 0.72rem;
  line-height: 1.6;
}

.lp-section-code {
  margin-top: 48px;
  max-width: 640px;
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
  color: #60a5fa;
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

/* Product label */
.lp-product-label {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 0.68rem;
  font-weight: 700;
  color: #60a5fa;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 12px;
}

/* Product card grid */
.lp-product-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.06);
}

.lp-product-grid-3 {
  grid-template-columns: repeat(3, 1fr);
}

.lp-product-card {
  padding: 36px 32px;
  background: #000;
}

.lp-product-card h3 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1rem;
  font-weight: 600;
  color: #fff;
  margin-bottom: 10px;
  letter-spacing: -0.01em;
}

.lp-product-card p {
  font-size: 0.84rem;
  color: rgba(255,255,255,0.4);
  line-height: 1.7;
}

/* Network visualization */
.lp-network-svg {
  max-width: 600px;
  margin: 0 auto 48px;
}

.lp-network-svg svg {
  width: 100%;
  height: auto;
}

/* Pipeline visualization */
.lp-pipeline {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  margin-bottom: 56px;
  padding: 24px 32px;
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px;
  overflow-x: auto;
}

.lp-pipeline-step {
  display: flex;
  align-items: center;
  gap: 10px;
}

.lp-pipeline-num {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(37,99,235,0.15);
  border: 1px solid rgba(37,99,235,0.3);
  color: #60a5fa;
  font-family: 'Space Grotesk', sans-serif;
  font-size: 0.68rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.lp-pipeline-title {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 0.78rem;
  font-weight: 600;
  color: rgba(255,255,255,0.7);
  letter-spacing: -0.01em;
  white-space: nowrap;
}

.lp-pipeline-arrow {
  color: rgba(255,255,255,0.12);
  font-size: 0.9rem;
  flex-shrink: 0;
  margin: 0 12px;
}

/* SDK grid */
.lp-sdk-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

.lp-sdk-col {}

.lp-sdk-label {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 0.78rem;
  font-weight: 600;
  color: rgba(255,255,255,0.5);
  margin-bottom: 12px;
  letter-spacing: -0.01em;
}

.lp-arch-link {
  margin-top: 32px;
  text-align: center;
}

.lp-arch-link a {
  color: #60a5fa;
  text-decoration: none;
  font-size: 0.85rem;
  font-weight: 500;
  transition: color 0.15s;
}

.lp-arch-link a:hover { color: #93bbfd; }

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
  justify-content: center;
  align-items: center;
  max-width: 1100px;
  margin: 0 auto;
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
  .lp-nav-links a:not(.lp-nav-cta), .lp-dropdown { display: none; }
  .lp-hero { padding: 140px 24px 80px; }
  .lp-hero-grid { grid-template-columns: 1fr; gap: 40px; }
  .lp-hero h1 { font-size: 2rem; }
  .lp-section { padding: 64px 24px; }
  .lp-stats-inner { grid-template-columns: 1fr 1fr; }
  .lp-stat { padding: 24px 0; }
  .lp-product-grid, .lp-product-grid-3 { grid-template-columns: 1fr; }
  .lp-sdk-grid { grid-template-columns: 1fr; }
  .lp-pipeline { flex-direction: column; gap: 16px; }
  .lp-pipeline-arrow { transform: rotate(90deg); margin: 0; }
  .lp-stack-item { flex: 1 1 100%; }
  .lp-footer { padding: 24px; }
  .lp-footer-links { flex-wrap: wrap; justify-content: center; }
  .lp-trust-line { flex-direction: column; gap: 8px; }
  .lp-trust-sep { display: none; }
  .lp-code-body { font-size: 0.7rem; }
}
`
