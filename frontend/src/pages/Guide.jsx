import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Copy, Check } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

/* ── Reusable Components ── */

function CodeBlock({ code, lang }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div style={{ position: 'relative', marginTop: 8, marginBottom: 8 }}>
      <button
        onClick={handleCopy}
        style={{
          position: 'absolute', top: 8, right: 8, background: 'rgba(255,255,255,0.08)',
          border: 'none', borderRadius: 4, padding: '4px 8px', cursor: 'pointer',
          color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
      </button>
      <pre style={{
        background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.7)', padding: 16,
        borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', lineHeight: 1.6,
        overflowX: 'auto', border: '1px solid var(--rule)', margin: 0,
        fontFamily: 'var(--font-mono)',
      }}>
        <code>{code}</code>
      </pre>
    </div>
  )
}

function QA({ q, a, code, note }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        fontWeight: 700, fontSize: '0.88rem', marginBottom: 6, color: 'var(--text)',
        fontFamily: 'var(--font-display)', letterSpacing: '-0.01em',
      }}>
        {q}
      </div>
      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
        {a}
      </div>
      {code && <CodeBlock code={code} />}
      {note && (
        <div style={{
          marginTop: 10, padding: '10px 14px',
          background: 'var(--accent-muted)', borderRadius: 'var(--radius-sm)',
          fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6,
          borderLeft: '3px solid var(--accent)',
        }}>
          {note}
        </div>
      )}
    </div>
  )
}

function SectionBlock({ title, children }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{ height: 1, flex: 1, background: 'var(--rule)' }} />
        <span style={{
          fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.1em',
          color: 'var(--text-muted)', textTransform: 'uppercase', whiteSpace: 'nowrap',
        }}>
          {title}
        </span>
        <div style={{ height: 1, flex: 1, background: 'var(--rule)' }} />
      </div>
      {children}
    </div>
  )
}

function MethodBadge({ method }) {
  const colors = {
    GET: { bg: 'rgba(34,197,94,0.12)', color: '#22c55e', border: 'rgba(34,197,94,0.2)' },
    POST: { bg: 'rgba(59,130,246,0.12)', color: '#3b82f6', border: 'rgba(59,130,246,0.2)' },
    PUT: { bg: 'rgba(234,179,8,0.12)', color: '#eab308', border: 'rgba(234,179,8,0.2)' },
    DELETE: { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', border: 'rgba(239,68,68,0.2)' },
  }
  const c = colors[method] || colors.GET
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
      fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700,
      letterSpacing: '0.02em',
    }}>
      {method}
    </span>
  )
}

function ParamTable({ params }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 12 }}>
      <table style={{
        width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem',
        border: '1px solid var(--rule)', borderRadius: 6,
      }}>
        <thead>
          <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
            {['Name', 'Type', 'Required', 'Description'].map(h => (
              <th key={h} style={{
                textAlign: 'left', padding: '8px 12px', fontWeight: 700,
                color: 'var(--text-muted)', borderBottom: '1px solid var(--rule)',
                fontFamily: 'var(--font-display)', fontSize: '0.72rem',
                letterSpacing: '0.04em', textTransform: 'uppercase',
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {params.map((p, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--rule)' }}>
              <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: 'var(--text)', fontWeight: 600 }}>
                {p.name}
              </td>
              <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                {p.type}
              </td>
              <td style={{ padding: '8px 12px', color: p.required ? '#22c55e' : 'var(--text-muted)' }}>
                {p.required ? 'Yes' : 'No'}
              </td>
              <td style={{ padding: '8px 12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {p.desc}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EndpointBlock({ method, path, desc, auth, params, request, response }) {
  return (
    <div style={{
      marginBottom: 32, padding: '20px 22px',
      background: 'var(--paper)', border: '1px solid var(--rule)',
      borderRadius: 'var(--radius)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <MethodBadge method={method} />
        <code style={{
          fontFamily: 'var(--font-mono)', fontSize: '0.85rem',
          color: 'var(--text)', fontWeight: 600,
        }}>
          {path}
        </code>
      </div>
      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 12 }}>
        {desc}
      </div>
      {auth && (
        <div style={{
          fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 12,
          padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 4,
          fontFamily: 'var(--font-mono)', border: '1px solid var(--rule)',
        }}>
          Auth: {auth}
        </div>
      )}
      {params && params.length > 0 && <ParamTable params={params} />}
      {request && <CodeBlock code={request} />}
      {response && (
        <>
          <div style={{
            fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 12, marginBottom: 4,
          }}>
            Response
          </div>
          <CodeBlock code={response} />
        </>
      )}
    </div>
  )
}

function SdkMethod({ signature, desc, params, returns, example }) {
  return (
    <div style={{
      marginBottom: 32, padding: '20px 22px',
      background: 'var(--paper)', border: '1px solid var(--rule)',
      borderRadius: 'var(--radius)',
    }}>
      <code style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.82rem',
        color: '#60a5fa', fontWeight: 600, display: 'block', marginBottom: 10,
      }}>
        {signature}
      </code>
      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 12 }}>
        {desc}
      </div>
      {params && params.length > 0 && <ParamTable params={params} />}
      {returns && (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 8 }}>
          <strong style={{ color: 'var(--text)' }}>Returns:</strong> {returns}
        </div>
      )}
      {example && <CodeBlock code={example} />}
    </div>
  )
}

/* ── Sidebar Structure ── */

const SECTIONS = [
  {
    group: 'GETTING STARTED',
    items: [
      { id: 'overview', label: 'Overview' },
      { id: 'quickstart', label: 'Quick Start' },
      { id: 'installation', label: 'Installation' },
    ],
  },
  {
    group: 'ORCHESTRATION',
    items: [
      { id: 'agent-networks', label: 'Agent Networks' },
      { id: 'delegation', label: 'Delegation' },
      { id: 'orchestrator-mode', label: 'Orchestrator Mode' },
      { id: 'external-agents', label: 'External Agents' },
      { id: 'tracing', label: 'Tracing' },
      { id: 'web-tools', label: 'Web Tools' },
    ],
  },
  {
    group: 'EVAL',
    items: [
      { id: 'creating-suites', label: 'Creating Suites' },
      { id: 'judge-criteria', label: 'Judge Criteria' },
      { id: 'running-evals', label: 'Running Evals' },
      { id: 'eval-analytics', label: 'Analytics' },
      { id: 'regressions', label: 'Regressions' },
      { id: 'failure-patterns', label: 'Failure Patterns' },
    ],
  },
  {
    group: 'POST-TRAINING',
    items: [
      { id: 'dataset-export', label: 'Dataset Export' },
      { id: 'fine-tuning', label: 'Fine-tuning' },
      { id: 'model-comparison', label: 'Model Comparison' },
      { id: 'lineage', label: 'Lineage' },
    ],
  },
  {
    group: 'PLATFORM',
    items: [
      { id: 'agents', label: 'Agents' },
      { id: 'documents', label: 'Documents' },
      { id: 'connectors', label: 'Connectors' },
      { id: 'tools', label: 'Tools & MCP' },
      { id: 'widget', label: 'Widget' },
      { id: 'marketplace', label: 'Marketplace' },
      { id: 'schedules', label: 'Schedules' },
      { id: 'memory', label: 'Memory' },
    ],
  },
  {
    group: 'API REFERENCE',
    items: [
      { id: 'api-auth', label: 'Authentication' },
      { id: 'api-ask', label: 'POST /v1/ask' },
      { id: 'api-search', label: 'POST /v1/search' },
      { id: 'api-health', label: 'GET /v1/health' },
      { id: 'api-register', label: 'POST /v1/agents/register' },
      { id: 'api-agents', label: 'GET /v1/agents' },
      { id: 'api-link', label: 'POST /v1/agents/{id}/link' },
      { id: 'api-delete', label: 'DELETE /v1/agents/{id}' },
      { id: 'api-network', label: 'GET /v1/network' },
      { id: 'api-log', label: 'POST /v1/log' },
      { id: 'api-eval-suites', label: 'GET /v1/eval/suites' },
      { id: 'api-eval-run', label: 'POST /v1/eval/run' },
      { id: 'api-eval-results', label: 'GET /v1/eval/run/{id}' },
    ],
  },
  {
    group: 'SDK REFERENCE',
    items: [
      { id: 'sdk-install', label: 'Installation' },
      { id: 'sdk-cane', label: 'Cane()' },
      { id: 'sdk-ask', label: 'ask()' },
      { id: 'sdk-search', label: 'search()' },
      { id: 'sdk-health', label: 'health()' },
      { id: 'sdk-register', label: 'register_agent()' },
      { id: 'sdk-agents', label: 'agents()' },
      { id: 'sdk-link', label: 'link_agent()' },
      { id: 'sdk-delete', label: 'delete_agent()' },
      { id: 'sdk-network', label: 'network()' },
      { id: 'sdk-log', label: 'log()' },
    ],
  },
]

/* ── Section Content ── */

function SectionContent({ id }) {
  switch (id) {
    case 'overview': return <OverviewSection />
    case 'quickstart': return <QuickStartSection />
    case 'installation': return <InstallationSection />
    case 'agent-networks': return <AgentNetworksSection />
    case 'delegation': return <DelegationSection />
    case 'orchestrator-mode': return <OrchestratorModeSection />
    case 'external-agents': return <ExternalAgentsSection />
    case 'tracing': return <TracingSection />
    case 'web-tools': return <WebToolsSection />
    case 'creating-suites': return <CreatingSuitesSection />
    case 'judge-criteria': return <JudgeCriteriaSection />
    case 'running-evals': return <RunningEvalsSection />
    case 'eval-analytics': return <EvalAnalyticsSection />
    case 'regressions': return <RegressionsSection />
    case 'failure-patterns': return <FailurePatternsSection />
    case 'dataset-export': return <DatasetExportSection />
    case 'fine-tuning': return <FineTuningSection />
    case 'model-comparison': return <ModelComparisonSection />
    case 'lineage': return <LineageSection />
    case 'agents': return <AgentsSection />
    case 'documents': return <DocumentsSection />
    case 'connectors': return <ConnectorsSection />
    case 'tools': return <ToolsSection />
    case 'widget': return <WidgetSection />
    case 'marketplace': return <MarketplaceSection />
    case 'schedules': return <SchedulesSection />
    case 'memory': return <MemorySection />
    case 'api-auth': return <ApiAuthSection />
    case 'api-ask': return <ApiAskSection />
    case 'api-search': return <ApiSearchSection />
    case 'api-health': return <ApiHealthSection />
    case 'api-register': return <ApiRegisterSection />
    case 'api-agents': return <ApiAgentsSection />
    case 'api-link': return <ApiLinkSection />
    case 'api-delete': return <ApiDeleteSection />
    case 'api-network': return <ApiNetworkSection />
    case 'api-log': return <ApiLogSection />
    case 'api-eval-suites': return <ApiEvalSuitesSection />
    case 'api-eval-run': return <ApiEvalRunSection />
    case 'api-eval-results': return <ApiEvalResultsSection />
    case 'sdk-install': return <SdkInstallSection />
    case 'sdk-cane': return <SdkCaneSection />
    case 'sdk-ask': return <SdkAskSection />
    case 'sdk-search': return <SdkSearchSection />
    case 'sdk-health': return <SdkHealthSection />
    case 'sdk-register': return <SdkRegisterSection />
    case 'sdk-agents': return <SdkAgentsSection />
    case 'sdk-link': return <SdkLinkSection />
    case 'sdk-delete': return <SdkDeleteSection />
    case 'sdk-network': return <SdkNetworkSection />
    case 'sdk-log': return <SdkLogSection />
    default: return <OverviewSection />
  }
}

/* ── Getting Started ── */

function OverviewSection() {
  return (
    <div>
      <h2 style={h2Style}>Overview</h2>
      <p style={pStyle}>
        Cane is an AI infrastructure platform for building, evaluating, and improving production AI agents. It covers three pillars:
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
        {[
          ['Orchestration', 'Agent networks, delegation chains, execution tracing, external agent registration'],
          ['Eval', 'LLM-as-judge scoring, regression detection, failure pattern analysis, consistency tracking'],
          ['Post-Training', 'Dataset export in 4 formats (SFT, DPO, OpenAI, raw), fine-tuning pipeline, model lineage'],
        ].map(([title, desc]) => (
          <div key={title} style={{
            padding: '16px 18px', background: 'var(--paper)',
            border: '1px solid var(--rule)', borderRadius: 'var(--radius)',
          }}>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text)', fontFamily: 'var(--font-display)', marginBottom: 6 }}>
              {title}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {desc}
            </div>
          </div>
        ))}
      </div>
      <QA
        q="How does the AI search work?"
        a="Cane uses hybrid search, combining dense vector embeddings (BAAI/bge-base-en-v1.5) with sparse keyword matching (BM25). Results are fused using Reciprocal Rank Fusion, then re-ranked by a cross-encoder (ms-marco-MiniLM-L-6-v2). The top chunks are sent to Claude as context for the final answer."
      />
      <QA
        q="What AI model powers the responses?"
        a="Cane uses Anthropic's Claude via the official SDK. Streaming responses are supported. The model sees your system prompt, retrieved document chunks, and tool definitions, then generates a grounded response with source citations."
      />
    </div>
  )
}

function QuickStartSection() {
  return (
    <div>
      <h2 style={h2Style}>Quick Start</h2>
      <p style={pStyle}>Get from zero to a working agent in 5 steps.</p>
      {[
        {
          step: '1. Install the SDK',
          desc: 'Install the Cane Python SDK from PyPI.',
          code: 'pip install cane',
        },
        {
          step: '2. Get your API key',
          desc: 'Go to Settings in the Cane dashboard. Generate an API key and scope it to your agent.',
          code: null,
        },
        {
          step: '3. Query your agent',
          desc: 'Use the SDK to send a question to your agent.',
          code: `from cane import Cane

client = Cane(api_key="cane_xxx")
result = client.ask("What is our refund policy?")
print(result["answer"])`,
        },
        {
          step: '4. Run an eval',
          desc: 'Create an eval suite in the dashboard with test cases and scoring criteria, then trigger a run via the API.',
          code: `curl -X POST -H "Authorization: Bearer cane_xxx" \\
  "https://cane.fyi/v1/eval/run?environment_id=suite_123\\
  &target_url=https://your-agent.com/ask"`,
        },
        {
          step: '5. Export training data',
          desc: 'Export high-scoring eval results as training data for fine-tuning.',
          code: `curl -H "Authorization: Bearer cane_xxx" \\
  "https://cane.fyi/v1/eval/export/run_456?format=openai&min_score=80"`,
        },
      ].map((item, i) => (
        <div key={i} style={{ marginBottom: 28 }}>
          <div style={{
            fontWeight: 700, fontSize: '0.92rem', color: 'var(--text)',
            fontFamily: 'var(--font-display)', marginBottom: 6,
          }}>
            {item.step}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            {item.desc}
          </div>
          {item.code && <CodeBlock code={item.code} />}
        </div>
      ))}
    </div>
  )
}

function InstallationSection() {
  return (
    <div>
      <h2 style={h2Style}>Installation</h2>
      <QA
        q="Python SDK"
        a="Install via pip. Requires Python 3.8+."
        code="pip install cane"
      />
      <QA
        q="REST API"
        a="No installation needed. All API endpoints are available at https://cane.fyi/v1/. Authenticate with your API key in the Authorization header."
        code={`curl -H "Authorization: Bearer cane_xxx" \\
  https://cane.fyi/v1/health`}
      />
      <QA
        q="Embeddable Widget"
        a="Add one script tag to your website. No build step required."
        code={`<script
  src="https://cane.fyi/widget.js"
  data-api-key="cane_xxx"
  data-agent-name="Support"
  data-workspace-id="your-agent-id"
></script>`}
      />
    </div>
  )
}

/* ── Orchestration ── */

function AgentNetworksSection() {
  return (
    <div>
      <h2 style={h2Style}>Agent Networks</h2>
      <QA
        q="What is the agent network?"
        a="A network of interconnected AI agents that can delegate tasks to each other. Each agent has its own knowledge base, system prompt, and tools. Agents communicate via delegation links, where one agent calls another as a tool and incorporates the response."
      />
      <QA
        q="How do I view the network?"
        a='Click "Network" in the sidebar. The page shows a live force-directed graph with nodes (agents) and edges (delegation links). Each edge is labeled with communication count and average response time.'
      />
      <QA
        q="What stats are shown?"
        a="Total communications across all agents, average response time, and per-connection counts. The stats sidebar breaks down communication volume and timing per agent pair."
      />
    </div>
  )
}

function DelegationSection() {
  return (
    <div>
      <h2 style={h2Style}>Delegation</h2>
      <QA
        q="How does agent delegation work?"
        a="Any agent can call another agent as a tool. When Agent A has Agent B linked as a sub-agent, Agent A can delegate part of a query to Agent B. Agent B runs its full pipeline (retrieval, tools, reasoning) and returns the result to Agent A, which incorporates it into its final response."
      />
      <QA
        q="How do I link agents together?"
        a='Go to the agent detail page and open the Tools tab. Scroll to the Sub-Agents section and click "Link Agent." Select the agent you want to link. The linked agent appears as a callable tool with its description used to determine when delegation happens.'
      />
      <QA
        q="Are there depth limits?"
        a="Yes. The default max delegation depth is 3, which prevents infinite recursion. If Agent A calls Agent B, and Agent B calls Agent C, that chain is depth 3. If Agent C tries to call another agent, the call is blocked."
      />
      <QA
        q="What gets logged during delegation?"
        a="Every inter-agent call is logged with: the calling agent (caller), the called agent (callee), the input sent, the output returned, and the duration in milliseconds. You can view the full communication history on the Network page."
      />
    </div>
  )
}

function OrchestratorModeSection() {
  return (
    <div>
      <h2 style={h2Style}>Orchestrator Mode</h2>
      <QA
        q="What is orchestrator mode?"
        a="Orchestrator mode turns an agent into an automatic router. When enabled, the agent discovers all other agents in the environment and routes incoming queries to the best specialist based on agent descriptions. No manual linking required."
      />
      <QA
        q="How do I enable it?"
        a='Go to the agent detail page and open the Configure tab. Toggle on "Orchestrator Mode." The agent will automatically discover all available agents and route queries based on their descriptions and specializations.'
      />
      <QA
        q="When should I use orchestrator mode vs manual linking?"
        a="Use manual linking when you want explicit, controlled delegation chains (e.g., Cold Outreach always calls Lead Researcher). Use orchestrator mode when you want a general-purpose entry point that automatically routes to the right specialist. You can combine both."
      />
    </div>
  )
}

function ExternalAgentsSection() {
  return (
    <div>
      <h2 style={h2Style}>External Agents</h2>
      <QA
        q="What are external agents?"
        a="External agents are HTTP endpoints registered into the Cane network. They appear as nodes in the network graph and can be delegated to by any native agent. When a native agent delegates to an external agent, Cane POSTs to the registered endpoint."
      />
      <QA
        q="How do I register one?"
        a="Via the API or SDK. Provide a name, description, endpoint URL, and auth configuration. The agent gets a workspace ID and appears in the network graph."
        code={`client.register_agent(
    name="Compliance Check",
    description="Verify regulatory compliance",
    endpoint="https://your-api.com/comply",
    auth_type="bearer",
    auth_token="sk_xxx"
)`}
      />
      <QA
        q="What auth types are supported?"
        a='"bearer" (Authorization: Bearer token), "header" (custom header), or "none". Auth tokens are encrypted at rest.'
      />
    </div>
  )
}

function TracingSection() {
  return (
    <div>
      <h2 style={h2Style}>Execution Tracing</h2>
      <QA
        q="What is execution tracing?"
        a="Every inter-agent call is logged with caller, callee, query, response, depth level, and millisecond timing. You can reconstruct full session flows and detect performance hotspots."
      />
      <QA
        q="What analytics are available?"
        a="Call volume over time, average latency per child agent, p95 latency, error rates, most called agents, and performance hotspots (agents with avg latency > 3s or error rate > 10%)."
      />
      <QA
        q="How do I view traces?"
        a="Go to the agent detail page and open the Traces tab. You will see recent traces with parent/child agent names, duration, depth, and status. Click any trace to see the full session flow."
      />
    </div>
  )
}

function WebToolsSection() {
  return (
    <div>
      <h2 style={h2Style}>Web Tools</h2>
      <QA
        q="What web tools are available?"
        a="Two self-hosted tools: Search (powered by DuckDuckGo HTML lite) and Scrape (powered by Jina Reader with direct HTML fallback). Both run on your Cane instance with no external API keys required."
      />
      <QA
        q="How do I add the search tool?"
        a='Add a webhook tool with the URL: /api/tools/search?q={{query}} and set it to "Wait for Response." Describe it as "Search the web for current information."'
      />
      <QA
        q="How do I add the scrape tool?"
        a='Add a webhook tool with the URL: /api/tools/scrape?url={{url}} and set it to "Wait for Response." Describe it as "Read the full content of a web page."'
      />
      <QA
        q="Do I need API keys for web tools?"
        a="No. Both search and scrape are fully self-hosted. Search hits DuckDuckGo HTML lite directly. Scrape uses Jina Reader as primary and falls back to direct HTML fetching."
      />
    </div>
  )
}

/* ── Eval ── */

function CreatingSuitesSection() {
  return (
    <div>
      <h2 style={h2Style}>Creating Eval Suites</h2>
      <QA
        q="What is an evaluation?"
        a="An evaluation is an automated test suite for your AI agent. You write questions with expected answers, define scoring criteria, and Cane runs every question through your agent, then uses an LLM judge to score each response."
      />
      <QA
        q="How do I create one?"
        a='Go to Evaluations from the sidebar. Click "New Environment" and link it to an agent. Add test cases, each with a question and expected answer. Then set up judge criteria and assign weights.'
      />
      <QA
        q="How many test cases should I have?"
        a="Start with 10-15 that cover your agent's most critical scenarios: common questions, edge cases, and potential failure modes. Quality matters more than quantity."
      />
    </div>
  )
}

function JudgeCriteriaSection() {
  return (
    <div>
      <h2 style={h2Style}>Judge Criteria</h2>
      <QA
        q="What criteria does the judge evaluate?"
        a="Four built-in criteria: Accuracy (factual correctness vs expected answer), Completeness (did it address all parts of the question), Relevance (did it stay on topic), and Faithfulness (is it grounded in the source documents, not hallucinated). Each criterion is scored 0-100 and weighted to produce a composite score."
      />
      <QA
        q="Can I customize the weights?"
        a="Yes. By default each criterion is weighted equally at 25%. You can adjust weights to match your priorities. A compliance agent might weight Accuracy at 40% and Faithfulness at 35%."
      />
      <QA
        q="Can I add custom rules?"
        a='Yes. Custom rules are natural-language instructions given to the judge: "Deduct points if the response gives legal advice" or "Award extra credit for citing specific section numbers."'
      />
    </div>
  )
}

function RunningEvalsSection() {
  return (
    <div>
      <h2 style={h2Style}>Running Evals</h2>
      <QA
        q="How do I run an evaluation?"
        a='Click "Run Evaluation" in any environment. Cane sends each test case question through the agent, captures the response, and uses the LLM judge to score it against the expected answer and your criteria.'
      />
      <QA
        q="What do the statuses mean?"
        a="Pass (green): scored above 70%. Warn (yellow): scored between 50-70%. Fail (red): below 50%."
      />
      <QA
        q="Reading results"
        a="The performance card shows the overall score, pass/warn/fail breakdown, criteria-level averages, and per-test-case details. Click any test case to see the AI's response, the expected answer, the judge's reasoning, and individual criteria scores."
      />
    </div>
  )
}

function EvalAnalyticsSection() {
  return (
    <div>
      <h2 style={h2Style}>Eval Analytics</h2>
      <QA
        q="What analytics are available?"
        a="Score trends (mean/median/p5/p95 across runs), regression detection, category breakdown by tags, latency percentiles (p50/p95/p99), failure pattern classification, consistency scoring, answer drift detection, and criteria deep dive."
      />
      <QA
        q="How do I access analytics?"
        a='Open an eval environment and click the "Analytics" tab. The dashboard shows KPIs, score trends, and top failure criteria. Use the sub-navigation to drill into specific analytics views.'
      />
    </div>
  )
}

function RegressionsSection() {
  return (
    <div>
      <h2 style={h2Style}>Regression Detection</h2>
      <QA
        q="How does regression detection work?"
        a="Cane compares scores across runs question-by-question. If a question scored 90 in run A but dropped to 65 in run B, that is flagged as a regression with a delta of -25. You can set a threshold (default 10 points) to control sensitivity."
      />
      <QA
        q="What metrics are shown?"
        a="Total regressions, total improvements, average delta, worst regression, and a per-question breakdown showing the old score, new score, and delta."
      />
    </div>
  )
}

function FailurePatternsSection() {
  return (
    <div>
      <h2 style={h2Style}>Failure Patterns</h2>
      <QA
        q="What failure patterns are detected?"
        a='Failures are classified into categories: hallucination (made up facts), incomplete (missing parts of the answer), inaccurate (factually wrong), poor_citation (claims sources not provided), tone_issues (inappropriate style), and other. Classification is based on the judge reasoning text.'
      />
      <QA
        q="How are patterns classified?"
        a="The system analyzes the LLM judge's reasoning text for each failed response, looking for keywords that indicate the failure type. Sample questions are provided for each pattern category."
      />
    </div>
  )
}

/* ── Post-Training ── */

function DatasetExportSection() {
  return (
    <div>
      <h2 style={h2Style}>Dataset Export</h2>
      <QA
        q="What export formats are available?"
        a='Four formats: SFT (prompt/completion pairs for supervised fine-tuning), DPO (chosen/rejected preference pairs), OpenAI (messages format compatible with OpenAI fine-tuning API), and Raw (full eval data with all scores and metadata).'
      />
      <QA
        q="How do I export?"
        a="Open an eval run and click Export. Select a format and minimum score threshold. Results below the threshold are excluded. The output is JSONL."
        code={`# SFT format output
{"prompt": "What is our refund policy?", "completion": "Our refund policy allows..."}

# OpenAI format output
{"messages": [
  {"role": "system", "content": "You are a helpful assistant."},
  {"role": "user", "content": "What is our refund policy?"},
  {"role": "assistant", "content": "Our refund policy allows..."}
]}`}
      />
      <QA
        q="What about DPO pairs?"
        a="DPO export pairs high-scoring answers (chosen) with low-scoring answers (rejected) for the same question. You can also do cross-run DPO, which pairs the best answer from one run with the worst from another."
      />
    </div>
  )
}

function FineTuningSection() {
  return (
    <div>
      <h2 style={h2Style}>Fine-tuning</h2>
      <QA
        q="How does the fine-tuning pipeline work?"
        a="Generate a training dataset from high-scoring eval results, submit a fine-tuning job to OpenAI, and track training progress. The pipeline filters results by score threshold (default 80+) and formats them for the OpenAI fine-tuning API."
      />
      <QA
        q="What models can I fine-tune?"
        a="Currently supports OpenAI models compatible with their fine-tuning API (e.g., gpt-4o-mini). Select the base model, score threshold, and number of epochs when submitting."
      />
    </div>
  )
}

function ModelComparisonSection() {
  return (
    <div>
      <h2 style={h2Style}>Model Comparison</h2>
      <QA
        q="How do I compare models?"
        a="Send the same question to both a base model and a fine-tuned model. Cane returns both responses side by side so you can evaluate the improvement qualitatively."
      />
    </div>
  )
}

function LineageSection() {
  return (
    <div>
      <h2 style={h2Style}>Lineage Tracking</h2>
      <QA
        q="What is model lineage?"
        a="Every fine-tuned model links back to the eval suite, score threshold, and training examples that produced it. You can trace from a deployed model back to the exact eval data used for training."
      />
      <QA
        q="What metadata is tracked?"
        a="OpenAI job ID, environment/suite ID, base model, fine-tuned model name, training file ID, number of training examples, score threshold, number of epochs, creation date, and current status."
      />
    </div>
  )
}

/* ── Platform ── */

function AgentsSection() {
  return (
    <div>
      <h2 style={h2Style}>Agents</h2>
      <QA
        q="What is an agent?"
        a="An agent is a specialized AI assistant trained on a specific set of files. It has a custom system prompt that shapes how the AI interprets and responds to questions."
      />
      <QA
        q="How do I create an agent?"
        a='Go to Agent Builder and click "Create Your Own." Give it a name, then upload files. You can write your own system prompt or use Auto-generate, which analyzes your uploaded files and writes a specialized prompt.'
      />
      <QA
        q="What makes a good system prompt?"
        a="Be specific about the agent's role, the type of questions it should expect, and how it should format answers. Tell it what to do when it cannot find an answer. Include any domain-specific rules."
        note="Tip: After auto-generating a prompt, run an evaluation to see how the agent performs. Then tweak the prompt based on where it fails."
      />
      <QA
        q="Digital Replicas"
        a={"A Digital Replica is an AI clone of a specific person. Upload writing samples (emails, social posts, messages, documents), fill in a personality profile, and Cane generates a system prompt that captures the person's voice. 10+ writing samples is a good starting point."}
      />
    </div>
  )
}

function DocumentsSection() {
  return (
    <div>
      <h2 style={h2Style}>Documents</h2>
      <QA
        q="What file types can I upload?"
        a="PDFs, Word docs (DOCX), spreadsheets (XLSX, CSV), images (PNG, JPG, GIF, TIFF, WEBP), audio (MP3, WAV, M4A, FLAC), and video (MP4, MKV, AVI, MOV, WEBM). You can also sync files from Google Drive."
      />
      <QA
        q="How long does processing take?"
        a="Most files process in under a minute. Audio and video take longer due to transcription. You can keep working while files process in the background."
      />
      <QA
        q="What happens during processing?"
        a="Cane extracts text, splits it into searchable chunks, and creates embeddings for semantic search. For images, it runs OCR. For audio and video, it generates a transcript."
      />
    </div>
  )
}

function ConnectorsSection() {
  return (
    <div>
      <h2 style={h2Style}>Live Connectors</h2>
      <QA
        q="What are live connectors?"
        a="Live connectors sync external data sources directly into your agent's knowledge base. Connect Google Drive, pick a folder, and Cane automatically downloads, processes, and indexes every file. When files change in the source, your agent's knowledge base updates automatically."
      />
      <QA
        q="How do I connect Google Drive?"
        a={'Go to your agent detail page and find the "Live Connectors" section. Click "Connect Google Drive." A popup window opens for Google sign-in. Authorize read-only access. Once connected, pick folders to sync.'}
      />
      <QA
        q="How does incremental sync work?"
        a="After the initial sync, Cane uses the Google Drive Changes API to detect new, modified, and deleted files. Syncs run automatically on a schedule (default: every 60 minutes). You can also trigger a sync manually."
      />
    </div>
  )
}

function ToolsSection() {
  return (
    <div>
      <h2 style={h2Style}>Tools & MCP</h2>
      <QA
        q="What are agent tools?"
        a="Tools let your agents take actions, not just answer questions. When a tool is configured, the AI decides when to use it based on the description you provide. Cane uses Claude's native tool_use capability."
      />
      <QA
        q="Webhook tools"
        a='HTTP requests to any URL: Zapier, Make, n8n, custom APIs. Two modes: "Fire & Forget" (send and move on) and "Wait for Response" (pause, read the reply, and incorporate the data).'
      />
      <QA
        q="MCP connections"
        a="Model Context Protocol (MCP) servers that expose structured tools from external services. Connect to a Google Calendar MCP server and your agent gets tools to read events, create events, and check availability."
      />
      <QA
        q="Can I use both?"
        a="Yes. Webhook tools and MCP connections work side by side. The AI sees all available tools from both sources and decides which to use based on the user's question."
      />
    </div>
  )
}

function WidgetSection() {
  return (
    <div>
      <h2 style={h2Style}>Widget</h2>
      <QA
        q="How do I embed the widget?"
        a='Copy the embed snippet from the agent detail page and paste it before the closing </body> tag on your website. The snippet includes all your customization settings as data attributes.'
        code={`<script
  src="https://cane.fyi/widget.js"
  data-api-key="cane_xxx"
  data-agent-name="Support Agent"
  data-workspace-id="your-agent-id"
  data-color="#2563eb"
  data-greeting="Hi! How can I help?"
  data-auto-open="5"
></script>`}
      />
      <QA
        q="What can I customize?"
        a="Color (hex), greeting message, subtitle text, input placeholder, position (left/right), border radius, logo URL, and auto-open delay (seconds, 0 = disabled)."
      />
    </div>
  )
}

function MarketplaceSection() {
  return (
    <div>
      <h2 style={h2Style}>Marketplace</h2>
      <QA
        q="What is the marketplace?"
        a="Publish agents for others to discover, clone, and use. Every listing includes the agent's eval score, test cases, and scoring criteria, so anyone can independently verify accuracy."
      />
      <QA
        q="How do I publish?"
        a='Go to your agent detail page and scroll to the Publish section. Select a category, choose what to include (full pack with docs or blueprint-only), and optionally attach an eval run.'
      />
      <QA
        q="How do I clone?"
        a='Find an agent on the marketplace and click "Clone Agent." Cane creates a copy with the system prompt, documents (for full packs), and the complete eval suite. You can re-run the evaluation to independently verify the score.'
      />
    </div>
  )
}

function SchedulesSection() {
  return (
    <div>
      <h2 style={h2Style}>Scheduled Runs</h2>
      <QA
        q="What are scheduled runs?"
        a="Configure agents to run autonomously on intervals or daily triggers. Background execution with run history, status tracking, and manual trigger support."
      />
    </div>
  )
}

function MemorySection() {
  return (
    <div>
      <h2 style={h2Style}>Agent Memory</h2>
      <QA
        q="How does agent memory work?"
        a="Agents extract facts, preferences, and instructions from conversations automatically. Memories persist across sessions and are injected into future prompts. Agents get smarter over time as they accumulate context about users and topics."
      />
    </div>
  )
}

/* ── API Reference ── */

function ApiAuthSection() {
  return (
    <div>
      <h2 style={h2Style}>Authentication</h2>
      <p style={pStyle}>
        All API endpoints require authentication via API key. Include your key in the Authorization header as a Bearer token.
      </p>
      <CodeBlock code={`Authorization: Bearer cane_your_key_here`} />
      <QA
        q="Getting an API key"
        a='Go to Settings in the dashboard (owner access required). Click "Generate new key," give it a name, and optionally scope it to a specific agent. The full key is shown once. Copy it immediately.'
      />
      <QA
        q="Scoped keys"
        a="When you scope an API key to an agent, all requests using that key are automatically scoped. You do not need to pass workspace_id on every request."
      />
      <QA
        q="Rate limits"
        a="Each API key is limited to 1,000 requests per day. The counter resets at midnight UTC."
      />
      <QA
        q="Error responses"
        a="401 Unauthorized: missing or invalid API key. 403 Forbidden: key does not have access to the requested resource. 429 Too Many Requests: rate limit exceeded."
      />
    </div>
  )
}

function ApiAskSection() {
  return (
    <div>
      <EndpointBlock
        method="POST"
        path="/v1/ask"
        desc="Ask a question against your documents. Returns an AI-generated answer with source citations. If the agent has tools configured, they execute automatically."
        auth="Bearer token (API key)"
        params={[
          { name: 'query', type: 'string', required: true, desc: 'The question to ask' },
          { name: 'workspace_id', type: 'string', required: false, desc: 'Agent/workspace to query. Uses API key scope if omitted.' },
          { name: 'max_chunks', type: 'integer', required: false, desc: 'Max document chunks to include (1-20, default 5)' },
          { name: 'history', type: 'array', required: false, desc: 'Conversation history as [{role, content}, ...]' },
        ]}
        request={`curl -X POST https://cane.fyi/v1/ask \\
  -H "Authorization: Bearer cane_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "query": "What is our refund policy?",
    "workspace_id": "ws_abc123",
    "max_chunks": 5
  }'`}
        response={`{
  "answer": "According to the terms of service, refunds are...",
  "sources": ["terms-of-service.pdf"],
  "chunks_used": 5,
  "model": "claude-haiku-4-5-20251001"
}`}
      />
    </div>
  )
}

function ApiSearchSection() {
  return (
    <div>
      <EndpointBlock
        method="POST"
        path="/v1/search"
        desc="Search documents and return raw chunks with relevance scores. No AI synthesis. Useful when you want to build your own UI or processing pipeline."
        auth="Bearer token (API key)"
        params={[
          { name: 'query', type: 'string', required: true, desc: 'Search query' },
          { name: 'workspace_id', type: 'string', required: false, desc: 'Agent/workspace to search. Uses API key scope if omitted.' },
          { name: 'max_results', type: 'integer', required: false, desc: 'Max results to return (1-50, default 10)' },
        ]}
        request={`curl -X POST https://cane.fyi/v1/search \\
  -H "Authorization: Bearer cane_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "onboarding procedures", "max_results": 5}'`}
        response={`{
  "results": [
    {
      "text": "New employees must complete...",
      "source_file": "onboarding-guide.pdf",
      "score": 0.8742,
      "metadata": {"page": 3, "chunk_index": 7}
    }
  ],
  "query": "onboarding procedures",
  "total": 5
}`}
      />
    </div>
  )
}

function ApiHealthSection() {
  return (
    <div>
      <EndpointBlock
        method="GET"
        path="/v1/health"
        desc="Check API health. Returns service status and API version."
        auth="None required"
        request={`curl https://cane.fyi/v1/health`}
        response={`{
  "status": "ok",
  "service": "cane",
  "api_version": "v1"
}`}
      />
    </div>
  )
}

function ApiRegisterSection() {
  return (
    <div>
      <EndpointBlock
        method="POST"
        path="/v1/agents/register"
        desc="Register an external agent into the Cane network. The agent gets a workspace ID and appears in the network graph. When a native agent delegates to it, Cane POSTs to the endpoint."
        auth="Bearer token (API key)"
        params={[
          { name: 'name', type: 'string', required: true, desc: 'Agent name' },
          { name: 'description', type: 'string', required: false, desc: 'What this agent does (used for routing decisions)' },
          { name: 'endpoint', type: 'string', required: true, desc: 'HTTP endpoint URL that accepts POST with {"query": "..."}' },
          { name: 'auth_type', type: 'string', required: false, desc: '"bearer", "header", or "none" (default: "none")' },
          { name: 'auth_token', type: 'string', required: false, desc: 'Auth token (encrypted at rest)' },
          { name: 'icon', type: 'string', required: false, desc: 'Emoji or short icon string' },
        ]}
        request={`curl -X POST https://cane.fyi/v1/agents/register \\
  -H "Authorization: Bearer cane_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Compliance Check",
    "description": "Verify regulatory compliance",
    "endpoint": "https://your-api.com/comply",
    "auth_type": "bearer",
    "auth_token": "sk_xxx"
  }'`}
        response={`{
  "agent_id": "ws_abc123",
  "name": "Compliance Check",
  "type": "external"
}`}
      />
    </div>
  )
}

function ApiAgentsSection() {
  return (
    <div>
      <EndpointBlock
        method="GET"
        path="/v1/agents"
        desc="List all agents (native and external) in your tenant. Returns agent metadata, linked sub-agents, and orchestrator mode status."
        auth="Bearer token (API key)"
        request={`curl https://cane.fyi/v1/agents \\
  -H "Authorization: Bearer cane_xxx"`}
        response={`{
  "agents": [
    {
      "id": "ws_abc123",
      "name": "Support Agent",
      "description": "Handles customer support queries",
      "icon": "",
      "type": "native",
      "orchestrator_mode": false,
      "linked_agents": [
        {"child_id": "ws_def456", "tool_name": "compliance_check"}
      ]
    }
  ],
  "total": 1
}`}
      />
    </div>
  )
}

function ApiLinkSection() {
  return (
    <div>
      <EndpointBlock
        method="POST"
        path="/v1/agents/{agent_id}/link"
        desc="Link an agent as a sub-agent of another (create a delegation edge). The child agent becomes a callable tool for the parent."
        auth="Bearer token (API key)"
        params={[
          { name: 'parent_agent_id', type: 'string', required: true, desc: 'The parent agent that will delegate' },
          { name: 'tool_name', type: 'string', required: true, desc: 'Name Claude sees for this tool (e.g. "compliance_check")' },
          { name: 'tool_description', type: 'string', required: true, desc: 'When to delegate (e.g. "Check regulatory compliance")' },
        ]}
        request={`curl -X POST https://cane.fyi/v1/agents/ws_def456/link \\
  -H "Authorization: Bearer cane_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "parent_agent_id": "ws_abc123",
    "tool_name": "compliance_check",
    "tool_description": "Check regulatory compliance"
  }'`}
        response={`{
  "link_id": "link_xxx",
  "parent": "ws_abc123",
  "child": "ws_def456"
}`}
      />
    </div>
  )
}

function ApiDeleteSection() {
  return (
    <div>
      <EndpointBlock
        method="DELETE"
        path="/v1/agents/{agent_id}"
        desc="Remove an external agent and its workspace. Deletes the agent config, all delegation links, and the workspace. Only external agents can be deleted via API."
        auth="Bearer token (API key)"
        request={`curl -X DELETE https://cane.fyi/v1/agents/ws_def456 \\
  -H "Authorization: Bearer cane_xxx"`}
        response={`{
  "deleted": "ws_def456"
}`}
      />
    </div>
  )
}

function ApiNetworkSection() {
  return (
    <div>
      <EndpointBlock
        method="GET"
        path="/v1/network"
        desc="Get the full agent network graph: nodes (agents), edges (delegation links), and communication statistics. Includes auto-discovered edges from communication logs."
        auth="Bearer token (API key)"
        request={`curl https://cane.fyi/v1/network \\
  -H "Authorization: Bearer cane_xxx"`}
        response={`{
  "nodes": [
    {"id": "ws_abc", "name": "Support", "type": "native", "orchestrator_mode": false}
  ],
  "edges": [
    {"source": "ws_abc", "target": "ws_def", "tool_name": "compliance", "comm_count": 42}
  ],
  "stats": {
    "total_communications": 156,
    "avg_response_ms": 1230
  }
}`}
      />
    </div>
  )
}

function ApiLogSection() {
  return (
    <div>
      <EndpointBlock
        method="POST"
        path="/v1/log"
        desc="Log an agent-to-agent communication for observability. Logged calls appear in the network graph and audit trail."
        auth="Bearer token (API key)"
        params={[
          { name: 'caller_id', type: 'string', required: true, desc: 'The agent that made the call' },
          { name: 'callee_id', type: 'string', required: true, desc: 'The agent that was called' },
          { name: 'query', type: 'string', required: false, desc: 'What was sent' },
          { name: 'response', type: 'string', required: false, desc: 'What was returned' },
          { name: 'duration_ms', type: 'integer', required: false, desc: 'How long the call took' },
          { name: 'status', type: 'string', required: false, desc: '"ok" or "error" (default: "ok")' },
        ]}
        request={`curl -X POST https://cane.fyi/v1/log \\
  -H "Authorization: Bearer cane_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "caller_id": "ws_abc",
    "callee_id": "ws_def",
    "query": "Check compliance for order #123",
    "response": "Order is compliant with regulations.",
    "duration_ms": 450,
    "status": "ok"
  }'`}
        response={`{
  "logged": true,
  "id": "comm_xxx"
}`}
      />
    </div>
  )
}

function ApiEvalSuitesSection() {
  return (
    <div>
      <EndpointBlock
        method="GET"
        path="/v1/eval/suites"
        desc="List all public evaluation suites available for testing your agent against."
        auth="Bearer token (API key)"
        request={`curl https://cane.fyi/v1/eval/suites \\
  -H "Authorization: Bearer cane_xxx"`}
        response={`{
  "suites": [
    {
      "id": "env_abc",
      "name": "Customer Support Eval",
      "description": "Tests for support agent accuracy",
      "test_case_count": 25,
      "criteria": [
        {"key": "accuracy", "label": "Accuracy", "weight": 30},
        {"key": "completeness", "label": "Completeness", "weight": 25},
        {"key": "relevance", "label": "Relevance", "weight": 25},
        {"key": "faithfulness", "label": "Faithfulness", "weight": 20}
      ]
    }
  ]
}`}
      />
    </div>
  )
}

function ApiEvalRunSection() {
  return (
    <div>
      <EndpointBlock
        method="POST"
        path="/v1/eval/run"
        desc="Submit an external agent for evaluation against a public eval suite. The agent must be reachable via HTTP. Returns 202 Accepted with a run ID for polling."
        auth="Bearer token (API key)"
        params={[
          { name: 'environment_id', type: 'string', required: true, desc: 'Eval suite to run against' },
          { name: 'target_url', type: 'string', required: true, desc: 'HTTP endpoint of your agent' },
          { name: 'target_headers', type: 'string', required: false, desc: 'JSON string of custom headers (default: "{}")' },
          { name: 'target_payload_template', type: 'string', required: false, desc: 'Payload template with {{question}} placeholder' },
          { name: 'target_response_path', type: 'string', required: false, desc: 'JSON path to extract the answer (default: "response")' },
        ]}
        request={`curl -X POST -H "Authorization: Bearer cane_xxx" \\
  "https://cane.fyi/v1/eval/run\\
  ?environment_id=env_abc\\
  &target_url=https://your-agent.com/ask"`}
        response={`{
  "run_id": "run_456",
  "status": "pending",
  "total_cases": 25,
  "environment_id": "env_abc",
  "environment_name": "Customer Support Eval"
}`}
      />
    </div>
  )
}

function ApiEvalResultsSection() {
  return (
    <div>
      <EndpointBlock
        method="GET"
        path="/v1/eval/run/{run_id}"
        desc="Get evaluation run results. Only accessible to the API key that triggered the run or keys belonging to the same tenant."
        auth="Bearer token (API key)"
        request={`curl https://cane.fyi/v1/eval/run/run_456 \\
  -H "Authorization: Bearer cane_xxx"`}
        response={`{
  "run_id": "run_456",
  "status": "completed",
  "overall_score": 87.3,
  "total_cases": 25,
  "passed": 20,
  "warned": 3,
  "failed": 2,
  "results": [
    {
      "question": "What is our refund policy?",
      "expected_answer": "Refunds within 30 days...",
      "agent_answer": "According to our terms...",
      "overall_score": 92.5,
      "criteria_scores": {
        "accuracy": 95,
        "completeness": 90,
        "relevance": 95,
        "faithfulness": 88
      },
      "status": "pass",
      "response_time_ms": 1250
    }
  ]
}`}
      />
    </div>
  )
}

/* ── SDK Reference ── */

function SdkInstallSection() {
  return (
    <div>
      <h2 style={h2Style}>SDK Installation</h2>
      <p style={pStyle}>Install the Cane Python SDK from PyPI. Requires Python 3.8+.</p>
      <CodeBlock code="pip install cane" />
      <p style={pStyle}>Import and initialize:</p>
      <CodeBlock code={`from cane import Cane

client = Cane(api_key="cane_xxx")`} />
    </div>
  )
}

function SdkCaneSection() {
  return (
    <div>
      <SdkMethod
        signature="Cane(api_key, base_url='https://cane.fyi', timeout=30.0)"
        desc="Initialize the Cane client. API key must start with 'cane_'."
        params={[
          { name: 'api_key', type: 'str', required: true, desc: 'Your Cane API key (starts with "cane_")' },
          { name: 'base_url', type: 'str', required: false, desc: 'Base URL of your Cane instance (default: https://cane.fyi)' },
          { name: 'timeout', type: 'float', required: false, desc: 'Request timeout in seconds (default: 30.0)' },
        ]}
        returns="Cane client instance. Supports context manager (with statement)."
        example={`from cane import Cane

# Basic usage
client = Cane(api_key="cane_xxx")

# With context manager
with Cane(api_key="cane_xxx") as client:
    result = client.ask("Hello")`}
      />
    </div>
  )
}

function SdkAskSection() {
  return (
    <div>
      <SdkMethod
        signature="client.ask(query, workspace_id='', max_chunks=5, history=None)"
        desc="Ask a question against your documents. Returns an AI-generated answer with source citations."
        params={[
          { name: 'query', type: 'str', required: true, desc: 'The question to ask' },
          { name: 'workspace_id', type: 'str', required: false, desc: 'Agent/workspace to query. Uses API key scope if omitted.' },
          { name: 'max_chunks', type: 'int', required: false, desc: 'Max document chunks to include (1-20, default: 5)' },
          { name: 'history', type: 'list', required: false, desc: 'Conversation history as [{role, content}, ...]' },
        ]}
        returns='Dict with answer, sources, chunks_used, model.'
        example={`result = client.ask(
    "What is our refund policy?",
    workspace_id="ws_abc123"
)
print(result["answer"])
print(result["sources"])`}
      />
    </div>
  )
}

function SdkSearchSection() {
  return (
    <div>
      <SdkMethod
        signature="client.search(query, workspace_id='', max_results=10)"
        desc="Search documents and return raw chunks with relevance scores."
        params={[
          { name: 'query', type: 'str', required: true, desc: 'Search query' },
          { name: 'workspace_id', type: 'str', required: false, desc: 'Agent/workspace to search' },
          { name: 'max_results', type: 'int', required: false, desc: 'Max results to return (1-50, default: 10)' },
        ]}
        returns='Dict with results, query, total.'
        example={`results = client.search("onboarding procedures", max_results=5)
for r in results["results"]:
    print(f'{r["source_file"]}: {r["score"]}')`}
      />
    </div>
  )
}

function SdkHealthSection() {
  return (
    <div>
      <SdkMethod
        signature="client.health()"
        desc="Check API health."
        returns='{status, service, api_version}'
        example={`health = client.health()
print(health["status"])  # "ok"`}
      />
    </div>
  )
}

function SdkRegisterSection() {
  return (
    <div>
      <SdkMethod
        signature="client.register_agent(name, description, endpoint, auth_type='none', auth_token='', icon='', parameters=None)"
        desc="Register an external agent into the Cane network. The agent gets a workspace ID and appears in the network graph."
        params={[
          { name: 'name', type: 'str', required: true, desc: 'Agent name' },
          { name: 'description', type: 'str', required: true, desc: 'What this agent does (used for routing)' },
          { name: 'endpoint', type: 'str', required: true, desc: 'HTTP endpoint URL' },
          { name: 'auth_type', type: 'str', required: false, desc: '"bearer", "header", or "none"' },
          { name: 'auth_token', type: 'str', required: false, desc: 'Auth token (encrypted at rest)' },
          { name: 'icon', type: 'str', required: false, desc: 'Emoji or short icon string' },
        ]}
        returns='Dict with agent_id, name, type.'
        example={`agent = client.register_agent(
    name="Compliance Check",
    description="Verify regulatory compliance",
    endpoint="https://your-api.com/comply",
    auth_type="bearer",
    auth_token="sk_xxx"
)
print(agent["agent_id"])`}
      />
    </div>
  )
}

function SdkAgentsSection() {
  return (
    <div>
      <SdkMethod
        signature="client.agents()"
        desc="List all agents (native and external) in your tenant."
        returns='Dict with agents list and total count.'
        example={`data = client.agents()
for agent in data["agents"]:
    print(f'{agent["name"]} ({agent["type"]})')`}
      />
    </div>
  )
}

function SdkLinkSection() {
  return (
    <div>
      <SdkMethod
        signature="client.link_agent(agent_id, parent_agent_id, tool_name, tool_description)"
        desc="Link an agent as a sub-agent of another (create a delegation edge)."
        params={[
          { name: 'agent_id', type: 'str', required: true, desc: 'The child agent to be called' },
          { name: 'parent_agent_id', type: 'str', required: true, desc: 'The parent agent that will delegate' },
          { name: 'tool_name', type: 'str', required: true, desc: 'Name Claude sees for this tool' },
          { name: 'tool_description', type: 'str', required: true, desc: 'When to delegate' },
        ]}
        returns='Dict with link_id, parent, child.'
        example={`link = client.link_agent(
    agent_id="ws_compliance",
    parent_agent_id="ws_support",
    tool_name="compliance_check",
    tool_description="Check regulatory compliance"
)`}
      />
    </div>
  )
}

function SdkDeleteSection() {
  return (
    <div>
      <SdkMethod
        signature="client.delete_agent(agent_id)"
        desc="Remove an external agent and its workspace."
        params={[
          { name: 'agent_id', type: 'str', required: true, desc: 'The agent to delete' },
        ]}
        returns='Dict with deleted agent_id.'
        example={`client.delete_agent("ws_compliance")`}
      />
    </div>
  )
}

function SdkNetworkSection() {
  return (
    <div>
      <SdkMethod
        signature="client.network()"
        desc="Get the full agent network graph."
        returns='Dict with nodes (agents), edges (links), and stats.'
        example={`graph = client.network()
print(f'{len(graph["nodes"])} agents')
print(f'{len(graph["edges"])} links')
print(f'{graph["stats"]["total_communications"]} total calls')`}
      />
    </div>
  )
}

function SdkLogSection() {
  return (
    <div>
      <SdkMethod
        signature="client.log(caller_id, callee_id, query, response, duration_ms, status='ok')"
        desc="Log an agent-to-agent communication for observability. Logged calls appear in the network graph and audit trail."
        params={[
          { name: 'caller_id', type: 'str', required: true, desc: 'The agent that made the call' },
          { name: 'callee_id', type: 'str', required: true, desc: 'The agent that was called' },
          { name: 'query', type: 'str', required: true, desc: 'What was sent' },
          { name: 'response', type: 'str', required: true, desc: 'What was returned' },
          { name: 'duration_ms', type: 'int', required: true, desc: 'How long the call took' },
          { name: 'status', type: 'str', required: false, desc: '"ok" or "error"' },
        ]}
        returns='Dict with logged status and communication ID.'
        example={`client.log(
    caller_id="ws_support",
    callee_id="ws_compliance",
    query="Is order #123 compliant?",
    response="Yes, order is compliant.",
    duration_ms=450
)`}
      />
    </div>
  )
}

/* ── Shared Styles ── */

const h2Style = {
  fontSize: '1.3rem', fontWeight: 800, marginBottom: 16,
  fontFamily: 'var(--font-display)', letterSpacing: '-0.02em',
  color: 'var(--text)',
}

const pStyle = {
  fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.7,
  marginBottom: 20, maxWidth: 640,
}

/* ── Main Component ── */

export default function Guide() {
  const [activeSection, setActiveSection] = useState('overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user } = useAuth()
  const location = useLocation()

  // Handle hash-based navigation
  useEffect(() => {
    if (location.hash) {
      const id = location.hash.slice(1)
      const allIds = SECTIONS.flatMap(s => s.items.map(i => i.id))
      if (allIds.includes(id)) {
        setActiveSection(id)
      }
    }
  }, [location.hash])

  const handleNav = (id) => {
    setActiveSection(id)
    setSidebarOpen(false)
    window.scrollTo(0, 0)
    window.history.replaceState(null, '', `#${id}`)
  }

  return (
    <div className="fade-in" style={{ display: 'flex', maxWidth: 1100, margin: '0 auto', gap: 0 }}>
      <style>{guideStyles}</style>

      {/* Mobile sidebar toggle */}
      <button
        className="guide-mobile-toggle"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? 'Close' : 'Menu'}
      </button>

      {/* Sidebar */}
      <nav className={`guide-sidebar ${sidebarOpen ? 'guide-sidebar-open' : ''}`}>
        <div style={{ padding: '0 16px 16px' }}>
          <div style={{
            fontSize: '1.1rem', fontWeight: 800,
            fontFamily: 'var(--font-display)', letterSpacing: '-0.02em',
            color: 'var(--text)', marginBottom: 4,
          }}>
            Docs
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Cane AI Infrastructure
          </div>
        </div>

        {SECTIONS.map((section) => (
          <div key={section.group} style={{ marginBottom: 8 }}>
            <div style={{
              padding: '6px 16px',
              fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em',
              color: 'var(--text-muted)', textTransform: 'uppercase',
            }}>
              {section.group}
            </div>
            {section.items.map((item) => (
              <button
                key={item.id}
                onClick={() => handleNav(item.id)}
                className={`guide-sidebar-item ${activeSection === item.id ? 'guide-sidebar-active' : ''}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        ))}
      </nav>

      {/* Content */}
      <main className="guide-content">
        <SectionContent id={activeSection} />

        {/* Footer */}
        {user ? (
          <div style={{
            marginTop: 36, marginBottom: 20, padding: '16px 18px',
            background: 'var(--paper)', borderRadius: 'var(--radius)',
            border: '1px solid var(--rule)',
            fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6,
          }}>
            <strong style={{ color: 'var(--text)' }}>Need help?</strong> Reach out to your team admin or email us
            at <a href="mailto:hello@cane.fyi" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>hello@cane.fyi</a>.
          </div>
        ) : (
          <div style={{
            marginTop: 36, marginBottom: 20, padding: '22px 24px',
            background: 'var(--paper)', borderRadius: 'var(--radius)',
            border: '1px solid var(--rule)',
            textAlign: 'center',
          }}>
            <div style={{
              fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)',
              fontFamily: 'var(--font-display)', marginBottom: 6,
            }}>
              Ready to try it?
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
              Create a free account and build your first agent in under five minutes.
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <Link to="/register" style={{
                display: 'inline-block', padding: '10px 24px',
                background: '#fff', color: '#000',
                borderRadius: 'var(--radius-sm)', fontSize: '0.85rem',
                fontWeight: 700, textDecoration: 'none',
              }}>
                Sign up free
              </Link>
              <Link to="/login" style={{
                display: 'inline-block', padding: '10px 24px',
                background: 'transparent', color: 'var(--text-secondary)',
                borderRadius: 'var(--radius-sm)', fontSize: '0.85rem',
                fontWeight: 600, textDecoration: 'none',
                border: '1px solid var(--rule)',
              }}>
                Sign in
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

const guideStyles = `
.guide-sidebar {
  width: 240px;
  flex-shrink: 0;
  position: sticky;
  top: 56px;
  height: calc(100vh - 56px);
  overflow-y: auto;
  padding: 20px 0;
  border-right: 1px solid var(--rule);
}

.guide-sidebar::-webkit-scrollbar { width: 4px; }
.guide-sidebar::-webkit-scrollbar-track { background: transparent; }
.guide-sidebar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

.guide-sidebar-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 5px 16px 5px 24px;
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--text-muted);
  background: none;
  border: none;
  cursor: pointer;
  transition: color 0.1s, background 0.1s;
  font-family: var(--font-body);
  line-height: 1.6;
}

.guide-sidebar-item:hover {
  color: var(--text-secondary);
  background: rgba(255,255,255,0.03);
}

.guide-sidebar-active {
  color: var(--text) !important;
  background: rgba(255,255,255,0.06) !important;
  font-weight: 700;
  border-left: 2px solid var(--accent);
  padding-left: 22px;
}

.guide-content {
  flex: 1;
  min-width: 0;
  max-width: 720px;
  padding: 28px 36px;
}

.guide-mobile-toggle {
  display: none;
  position: fixed;
  bottom: 20px;
  left: 20px;
  z-index: 50;
  padding: 8px 16px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  font-family: var(--font-body);
}

@media (max-width: 768px) {
  .guide-sidebar {
    position: fixed;
    left: -260px;
    top: 56px;
    z-index: 40;
    background: var(--bg);
    transition: left 0.2s;
    width: 260px;
    border-right: 1px solid var(--rule);
  }
  .guide-sidebar-open {
    left: 0;
  }
  .guide-content {
    padding: 20px 16px;
    max-width: 100%;
  }
  .guide-mobile-toggle {
    display: block;
  }
}
`
