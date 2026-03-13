import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Copy, Check } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

/* ── Reusable Components ── */

function CodeBlock({ code }) {
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
      { id: 'api-overview', label: 'Overview' },
      { id: 'api-auth', label: 'Authentication' },
    ],
  },
  {
    group: 'REST API',
    items: [
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
    group: 'PYTHON SDK',
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
    case 'api-overview': return <ApiOverviewSection />
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
    default: return <ApiOverviewSection />
  }
}

/* ── Sections ── */

function ApiOverviewSection() {
  return (
    <div>
      <h2 style={h2Style}>API Reference</h2>
      <p style={pStyle}>
        The Cane API provides programmatic access to agents, document search, evaluation suites, and the agent network. All endpoints are REST-based and return JSON.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        <div style={{
          padding: '16px 18px', background: 'var(--paper)',
          border: '1px solid var(--rule)', borderRadius: 'var(--radius)',
        }}>
          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text)', fontFamily: 'var(--font-display)', marginBottom: 6 }}>
            REST API
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            13 endpoints covering agents, search, eval, and observability. Base URL: https://cane.fyi/v1/
          </div>
        </div>
        <div style={{
          padding: '16px 18px', background: 'var(--paper)',
          border: '1px solid var(--rule)', borderRadius: 'var(--radius)',
        }}>
          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text)', fontFamily: 'var(--font-display)', marginBottom: 6 }}>
            Python SDK
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            11 methods wrapping the REST API. Install with pip install cane. Supports context managers.
          </div>
        </div>
      </div>
      <QA
        q="Base URL"
        a="All API endpoints are available at https://cane.fyi/v1/. All requests must include an API key in the Authorization header."
        code={`curl -H "Authorization: Bearer cane_xxx" https://cane.fyi/v1/health`}
      />
    </div>
  )
}

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
  )
}

function ApiSearchSection() {
  return (
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
  )
}

function ApiHealthSection() {
  return (
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
  )
}

function ApiRegisterSection() {
  return (
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
  )
}

function ApiAgentsSection() {
  return (
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
  )
}

function ApiLinkSection() {
  return (
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
  )
}

function ApiDeleteSection() {
  return (
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
  )
}

function ApiNetworkSection() {
  return (
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
  )
}

function ApiLogSection() {
  return (
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
  )
}

function ApiEvalSuitesSection() {
  return (
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
  )
}

function ApiEvalRunSection() {
  return (
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
  )
}

function ApiEvalResultsSection() {
  return (
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
    <SdkMethod
      signature="Cane(api_key, base_url='https://cane.fyi', timeout=30.0)"
      desc={"Initialize the Cane client. API key must start with 'cane_'."}
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
  )
}

function SdkAskSection() {
  return (
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
  )
}

function SdkSearchSection() {
  return (
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
  )
}

function SdkHealthSection() {
  return (
    <SdkMethod
      signature="client.health()"
      desc="Check API health."
      returns='{status, service, api_version}'
      example={`health = client.health()
print(health["status"])  # "ok"`}
    />
  )
}

function SdkRegisterSection() {
  return (
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
  )
}

function SdkAgentsSection() {
  return (
    <SdkMethod
      signature="client.agents()"
      desc="List all agents (native and external) in your tenant."
      returns='Dict with agents list and total count.'
      example={`data = client.agents()
for agent in data["agents"]:
    print(f'{agent["name"]} ({agent["type"]})')`}
    />
  )
}

function SdkLinkSection() {
  return (
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
  )
}

function SdkDeleteSection() {
  return (
    <SdkMethod
      signature="client.delete_agent(agent_id)"
      desc="Remove an external agent and its workspace."
      params={[
        { name: 'agent_id', type: 'str', required: true, desc: 'The agent to delete' },
      ]}
      returns='Dict with deleted agent_id.'
      example={`client.delete_agent("ws_compliance")`}
    />
  )
}

function SdkNetworkSection() {
  return (
    <SdkMethod
      signature="client.network()"
      desc="Get the full agent network graph."
      returns='Dict with nodes (agents), edges (links), and stats.'
      example={`graph = client.network()
print(f'{len(graph["nodes"])} agents')
print(f'{len(graph["edges"])} links')
print(f'{graph["stats"]["total_communications"]} total calls')`}
    />
  )
}

function SdkLogSection() {
  return (
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

export default function ApiDocsPage() {
  const [activeSection, setActiveSection] = useState('api-overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user } = useAuth()
  const location = useLocation()

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

      <button
        className="guide-mobile-toggle"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? 'Close' : 'Menu'}
      </button>

      <nav className={`guide-sidebar ${sidebarOpen ? 'guide-sidebar-open' : ''}`}>
        <div style={{ padding: '0 16px 16px' }}>
          <div style={{
            fontSize: '1.1rem', fontWeight: 800,
            fontFamily: 'var(--font-display)', letterSpacing: '-0.02em',
            color: 'var(--text)', marginBottom: 4,
          }}>
            API Docs
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            REST API + Python SDK
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

        {/* Link back to Getting Started */}
        <div style={{ padding: '16px', borderTop: '1px solid var(--rule)', marginTop: 8 }}>
          <Link to="/guide" style={{
            fontSize: '0.78rem', color: 'var(--accent)', textDecoration: 'none', fontWeight: 600,
          }}>
            &larr; Getting Started
          </Link>
        </div>
      </nav>

      <main className="guide-content">
        <SectionContent id={activeSection} />

        {!user && (
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
              Create a free account and start building.
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
