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

        <div style={{ padding: '12px 16px', marginTop: 8, borderTop: '1px solid var(--rule)' }}>
          <Link to="/api-docs" style={{
            fontSize: '0.78rem', fontWeight: 600, color: 'var(--accent)',
            textDecoration: 'none', display: 'block', padding: '5px 0',
          }}>
            API &amp; SDK Reference &rarr;
          </Link>
        </div>
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
