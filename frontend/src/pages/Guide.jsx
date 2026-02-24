import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, Check, Search, Bot, FlaskConical, FileText, Upload, Zap, Shield, Globe, Store, Wrench, Code, MessageSquare, BarChart3, Palette, Plug } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

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
          color: '#aaa', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
      </button>
      <pre style={{
        background: '#1a1210', color: '#d4c4b0', padding: 16,
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

// ─── TAB CONTENT ───

function FeatureCard({ icon: Icon, title, description, detail }) {
  return (
    <div style={{
      padding: '20px 22px',
      background: 'var(--paper)',
      border: '1px solid var(--rule)',
      borderRadius: 'var(--radius)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'var(--cane-900)', color: 'var(--cane-400)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon size={16} />
        </div>
        <div style={{
          fontWeight: 700, fontSize: '0.88rem', color: 'var(--text)',
          fontFamily: 'var(--font-display)', letterSpacing: '-0.01em',
        }}>
          {title}
        </div>
      </div>
      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: detail ? 10 : 0 }}>
        {description}
      </div>
      {detail && (
        <div style={{
          fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.6,
          fontFamily: 'var(--font-mono)', padding: '8px 12px',
          background: 'rgba(0,0,0,0.03)', borderRadius: 6,
        }}>
          {detail}
        </div>
      )}
    </div>
  )
}

function GettingStarted() {
  return (
    <div>
      {/* Hero */}
      <div style={{ marginBottom: 32 }}>
        <div style={{
          fontSize: '1.15rem', fontWeight: 800, color: 'var(--text)',
          fontFamily: 'var(--font-display)', letterSpacing: '-0.02em',
          lineHeight: 1.4, marginBottom: 10,
        }}>
          Build AI agents that know things, do things, and prove they work.
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.7, maxWidth: 560 }}>
          Cane turns your documents into deployable AI agents. Upload files, build a specialized agent,
          connect it to your tools via webhooks and MCP, verify it with evaluations, and deploy it on any
          website — or publish it to the marketplace for others to use.
        </div>
      </div>

      {/* Feature grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 32 }}>
        <FeatureCard
          icon={Bot}
          title="Custom AI Agents"
          description="Build agents scoped to specific files with custom behavior. A support agent, a compliance agent, a product expert — each with its own knowledge base and instructions."
          detail="Auto-generated system prompts from corpus analysis"
        />
        <FeatureCard
          icon={Wrench}
          title="Tools & MCP Connections"
          description="Agents don't just answer — they act. Connect webhooks to fire Slack messages, or use MCP to connect calendars, CRMs, email, and more."
          detail="Webhooks + Model Context Protocol (MCP) server support"
        />
        <FeatureCard
          icon={FlaskConical}
          title="Built-in Evaluations"
          description="Write test cases, define scoring criteria, and run automated evaluations. Cane scores every answer on accuracy, completeness, relevance, and faithfulness."
          detail="LLM-as-Judge with weighted criteria and failure classification"
        />
        <FeatureCard
          icon={Globe}
          title="Deploy & Analyze"
          description="Embed your agent on any website with a customizable widget. Track every conversation with built-in analytics. Publish to the marketplace."
          detail="Widget customization, analytics dashboard, marketplace distribution"
        />
      </div>

      {/* How it works */}
      <SectionBlock title="How It Works">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {[
            {
              step: '1',
              icon: Upload,
              title: 'Upload your documents',
              description: 'Drop PDFs, Word docs, spreadsheets, images, audio, or video. Cane extracts text, runs OCR on images, transcribes media, and chunks everything into searchable embeddings.',
            },
            {
              step: '2',
              icon: Bot,
              title: 'Build an agent',
              description: 'Choose a template or start from scratch. Upload domain-specific files. Auto-generate a system prompt, or write your own. Add webhook tools and MCP connections to let your agent take actions.',
            },
            {
              step: '3',
              icon: FlaskConical,
              title: 'Run evaluations',
              description: 'Write test questions with expected answers. Define scoring criteria with custom weights. Run the suite. Cane scores every response and gives you pass/warn/fail verdicts.',
            },
            {
              step: '4',
              icon: Globe,
              title: 'Deploy and monitor',
              description: 'Embed on any website with one script tag. Customize the widget appearance. Track conversations in the analytics dashboard. Publish to the marketplace for others to clone.',
            },
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: 'var(--cane-900)', color: 'var(--cane-400)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                fontWeight: 800, fontFamily: 'var(--font-display)', fontSize: '0.85rem',
              }}>
                {item.step}
              </div>
              <div>
                <div style={{
                  fontWeight: 700, fontSize: '0.88rem', color: 'var(--text)',
                  fontFamily: 'var(--font-display)', marginBottom: 4,
                }}>
                  {item.title}
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  {item.description}
                </div>
              </div>
            </div>
          ))}
        </div>
      </SectionBlock>

      <SectionBlock title="Under the Hood">
        <QA
          q="How does the AI search work?"
          a="Cane uses hybrid search — combining dense vector embeddings (BAAI/bge-base-en-v1.5) with sparse keyword matching (BM25). Results are fused using Reciprocal Rank Fusion, then re-ranked by a cross-encoder (ms-marco-MiniLM-L-6-v2). The top chunks are sent to Claude as context for the final answer."
        />
        <QA
          q="What AI model powers the responses?"
          a="Cane uses Anthropic's Claude via the official SDK. Streaming responses are supported. The model sees your system prompt, retrieved document chunks, and tool definitions, then generates a grounded response with source citations."
        />
      </SectionBlock>
    </div>
  )
}

function AgentsTab() {
  return (
    <div>
      <SectionBlock title="What Are Agents">
        <QA
          q="What is an agent?"
          a="An agent is a specialized AI assistant trained on a specific set of files. It has a custom system prompt that shapes how the AI interprets and responds to questions. Think of it as a subject-matter expert that only knows about one domain — your HR policies, your product docs, your legal contracts."
        />
        <QA
          q="Why use agents instead of searching everything?"
          a="Agents give you control over two things: scope (which files are searched) and behavior (how the AI responds). A legal agent can be instructed to cite specific clauses. A support agent can be told to use friendly language. Without agents, every query hits your entire file pool with a generic prompt."
        />
      </SectionBlock>

      <SectionBlock title="Creating Agents">
        <QA
          q="What templates are available?"
          a='Three pre-built templates: Customer Support Agent (for website-facing support with friendly tone and escalation handling), Compliance & Policy Agent (for regulated industries with strict citation and no speculation), and Internal Ops Agent (for SOPs, onboarding, and procedures with tool integration). Each comes with an optimized system prompt for its use case.'
        />
        <QA
          q="How do I create a custom agent?"
          a='Go to Agent Builder and click "Create Your Own." Give it a name, then upload files. You can write your own system prompt or use Auto-generate — which analyzes your uploaded files and writes a specialized prompt based on the domain, terminology, and content it finds. Edit the result before saving.'
        />
        <QA
          q="What makes a good system prompt?"
          a="Be specific about the agent's role, the type of questions it should expect, and how it should format answers. Tell it what to do when it cannot find an answer — should it say so, or make a best guess? Include any domain-specific rules: always cite section numbers, always include dates, never give legal advice, etc."
          note="Tip: After auto-generating a prompt, run an evaluation to see how the agent performs. Then tweak the prompt based on where it fails."
        />
      </SectionBlock>

      <SectionBlock title="Using Agents">
        <QA
          q="How do I search with an agent?"
          a='Agents appear in the Search page dropdown under the "Agents" group. Select one to scope your search to that agent&apos;s files and system prompt. You can also click "Ask this agent" from the agent detail page.'
        />
        <QA
          q="Can I update an agent's files later?"
          a="Yes. Go to the agent detail page and upload additional files or delete existing ones. New files are processed and indexed automatically. The agent's search results will include the new content immediately after processing completes."
        />
        <QA
          q="Can I delete an agent?"
          a="Yes. On the Agent Builder page, click the trash icon on any agent card. This deletes the agent, its files, tools, MCP connections, evaluations, analytics logs, and any marketplace listings. This action cannot be undone."
        />
      </SectionBlock>
    </div>
  )
}

function ToolsTab() {
  return (
    <div>
      <SectionBlock title="What Are Tools">
        <QA
          q="What are agent tools?"
          a="Tools let your agents take actions — not just answer questions. When a tool is configured, the AI decides when to use it based on the description you provide. For example, a tool described as 'log compliance questions to the monitoring system' will fire automatically whenever someone asks about compliance topics."
        />
        <QA
          q="How do tools work under the hood?"
          a="Cane uses Claude's native tool_use capability. When your agent has tools configured, Claude sees the tool definitions alongside the document context. If it decides a tool is relevant, it calls it, Cane executes the HTTP request, and the result (if applicable) is fed back into the response. The user sees one seamless answer."
        />
        <QA
          q="What types of tools are supported?"
          a="Two types: Webhook tools (HTTP requests to any URL — Zapier, Make, n8n, custom APIs) and MCP Connections (Model Context Protocol servers that expose structured tools from external services like Google Calendar, Salesforce, and Slack)."
        />
      </SectionBlock>

      <SectionBlock title="Webhook Tools">
        <QA
          q="How do I add a webhook tool?"
          a='Go to the agent detail page and scroll to the Tools section. Click "Add Tool" and fill in the name, webhook URL, and description. The description is critical — it tells the AI when to invoke the tool. Be specific: "Use this tool when the user asks about refund policies" is better than "send notifications."'
        />
        <QA
          q="What is Fire & Forget vs Wait for Response?"
          a="Fire & Forget means the agent sends the request and moves on — it does not wait for a reply. Use this for logging, notifications, and triggers. Wait for Response means the agent pauses, reads the reply, and incorporates that data into its answer. Use this for data lookups, status checks, and live information."
        />
        <QA
          q="How do I test a tool?"
          a='Click the "Test" button next to any tool. Cane sends a sample payload to the URL and shows you the result — status code, response body, and timing. Always test before going live.'
        />
        <QA
          q="What does the payload look like?"
          a="By default, the webhook receives a JSON payload with the user's question and the agent's answer. You can customize the payload template using {{variable}} placeholders that map to the tool's parameters."
          code={'{\n  "question": "What is the refund policy?",\n  "answer": "According to our terms, refunds are available within 30 days..."\n}'}
        />
      </SectionBlock>

      <SectionBlock title="MCP Connections">
        <QA
          q="What is MCP?"
          a="Model Context Protocol (MCP) is an open standard for connecting AI agents to external services. Instead of configuring individual webhooks, you connect to an MCP server that exposes multiple tools at once. For example, connecting a Google Calendar MCP server gives your agent tools to read events, create events, and check availability — all from one connection."
        />
        <QA
          q="How do I connect an MCP server?"
          a='In the agent detail page, find the Connections section. Click "Browse Catalog" to see pre-built connectors (Google Calendar, Salesforce, Gmail, Slack, etc.) or click "Custom" to enter any MCP server URL manually. Each connection auto-discovers available tools.'
        />
        <QA
          q="Can I use both webhooks and MCP?"
          a="Yes. Webhook tools and MCP connections work side by side. The AI sees all available tools from both sources and decides which to use based on the user's question. Use webhooks for simple integrations and MCP for richer service connections."
        />
        <QA
          q="What MCP servers are in the catalog?"
          a="The built-in catalog includes connectors for Google Calendar, Salesforce, Gmail, Slack, GitHub, and more. Each catalog entry shows what tools it provides and how to connect. You can also add any custom MCP server by entering its URL."
        />
      </SectionBlock>

      <SectionBlock title="Common Integrations">
        <QA
          q="Zapier / Make / n8n"
          a="Create a webhook trigger in Zapier (or Make or n8n), copy the webhook URL, and paste it as your tool URL in Cane. Now your agent can trigger any of 5,000+ app integrations — Google Sheets, Slack, Gmail, Salesforce, Jira, HubSpot, Microsoft Teams, and more."
        />
        <QA
          q="Slack notifications"
          a="Create a Slack Incoming Webhook URL from the Slack API dashboard. Add it as a fire-and-forget tool with a description like 'Notify the team channel whenever a user asks about security incidents.' Every matching question triggers a Slack message with the full Q&A."
        />
        <QA
          q="Google Sheets logging"
          a="Use a Zapier webhook that appends rows to a Google Sheet. Every agent interaction gets logged automatically with the question, answer, and timestamp. Instant analytics without writing code."
        />
        <QA
          q="Live data lookups"
          a='Set a tool to "Wait for Response" and point it at an API that returns real-time data — inventory levels, order status, exchange rates. The agent will call the API, read the response, and weave that live data into its answer alongside document context.'
        />
      </SectionBlock>
    </div>
  )
}

function EvaluationsTab() {
  return (
    <div>
      <SectionBlock title="What Are Evaluations">
        <QA
          q="What is an evaluation?"
          a="An evaluation is an automated test suite for your AI agent. You write questions with expected answers, define scoring criteria, and Cane runs every question through your agent, then uses an LLM judge to score each response. The result is a detailed scorecard showing where your agent excels and where it falls short."
        />
        <QA
          q="Why should I evaluate my agent?"
          a='Without evaluations, you are guessing whether your agent is any good. You might ask it a few questions manually and think "that looks right," but you have no way to measure accuracy systematically, track improvement over time, or catch regressions when you change the prompt or add files. Evaluations give you a number: your agent scores 79/100 today. You tweak the prompt, re-run, and it scores 84. That is progress you can prove.'
        />
      </SectionBlock>

      <SectionBlock title="Setting Up">
        <QA
          q="How do I create an evaluation?"
          a='Go to Evaluations from the sidebar. Click "New Environment" and link it to an agent. Add test cases — each with a question and expected answer. Then set up judge criteria (accuracy, completeness, relevance, faithfulness) and assign weights.'
        />
        <QA
          q="How many test cases should I have?"
          a="Start with 10–15 that cover your agent's most critical scenarios: common questions, edge cases, and potential failure modes. Add more as you discover gaps. Quality matters more than quantity — each test case should test something distinct."
        />
      </SectionBlock>

      <SectionBlock title="Judge Criteria">
        <QA
          q="What criteria does the judge evaluate?"
          a="Four built-in criteria: Accuracy (factual correctness vs expected answer), Completeness (did it address all parts of the question), Relevance (did it stay on topic), and Faithfulness (is it grounded in the source documents, not hallucinated). Each criterion is scored 0–100 and weighted to produce a composite score."
        />
        <QA
          q="Can I customize the weights?"
          a="Yes. By default each criterion is weighted equally at 25%. You can adjust weights to match your priorities — a compliance agent might weight Accuracy at 40% and Faithfulness at 35%, while a support agent might weight Relevance and Completeness higher."
        />
        <QA
          q="Can I add custom rules?"
          a='Yes. Custom rules are natural-language instructions given to the judge: "Deduct points if the response gives legal advice" or "Award extra credit for citing specific section numbers." These rules are applied alongside the standard criteria.'
        />
      </SectionBlock>

      <SectionBlock title="Running Evaluations">
        <QA
          q="How do I run an evaluation?"
          a='Click "Run Evaluation" in any environment. Cane sends each test case question through the agent, captures the response, and uses the LLM judge to score it against the expected answer and your criteria. The run typically takes 30–90 seconds depending on the number of test cases.'
        />
        <QA
          q="What do the statuses mean?"
          a="Pass (green): The response scored above 70% overall. Warn (yellow): The response scored between 50–70% — partially correct but needs work. Fail (red): Below 50% — the response was significantly off."
        />
      </SectionBlock>

      <SectionBlock title="Reading Results">
        <QA
          q="What is the performance card?"
          a="The performance card shows the overall score, pass/warn/fail breakdown, criteria-level averages, and per-test-case details. Click any test case to see the AI's response, the expected answer, the judge's reasoning, and individual criteria scores."
        />
      </SectionBlock>

      <SectionBlock title="Improving Scores">
        <QA
          q="My agent scored poorly. What should I do?"
          a="Look at the criteria breakdown. If Accuracy is low, check whether your documents actually contain the information needed. If Faithfulness is low, tighten the system prompt to say 'only use information from the provided documents.' If Completeness is low, try making the prompt more explicit about comprehensive answers."
          note="The fastest path to improvement: look at the test cases that failed, read the judge's reasoning, and adjust the system prompt to address the specific failure patterns."
        />
      </SectionBlock>
    </div>
  )
}

function AnalyticsTab() {
  return (
    <div>
      <SectionBlock title="Analytics Dashboard">
        <QA
          q="What is the analytics dashboard?"
          a='Every agent has its own analytics page accessible from the agent detail view. It tracks all conversations across every channel — internal search, embedded widget, and API. Click the analytics icon (bar chart) next to your agent name to access it.'
        />
        <QA
          q="What metrics are tracked?"
          a="Total conversations, average response time, satisfaction rate (from thumbs up/down feedback), daily conversation volume, channel breakdown (internal/widget/API), tool usage frequency, and recent conversation logs with query previews."
        />
        <QA
          q="Can I filter by time range?"
          a="Yes. The dashboard supports 7-day, 30-day, and 90-day views. Use the time range selector at the top to switch between them."
        />
      </SectionBlock>

      <SectionBlock title="Conversation Tracking">
        <QA
          q="Which conversations are logged?"
          a="Every query that goes through the /api/ask endpoint (internal chat), the /v1/ask endpoint (API and widget), and widget interactions. Each log includes the query, answer preview, channel, response time, sources used, and tools called."
        />
        <QA
          q="How does feedback work?"
          a="Users can give thumbs up or thumbs down on any response. The analytics dashboard aggregates this into a satisfaction percentage. Use this signal to identify which types of questions your agent handles well and where it struggles."
        />
      </SectionBlock>
    </div>
  )
}

function WidgetTab() {
  return (
    <div>
      <SectionBlock title="Widget Customization">
        <QA
          q="How do I customize the chat widget?"
          a='In the agent detail page, find the "Widget & Embed" section. Use the configuration panel to set colors, greeting text, subtitle, logo URL, position (left or right), border radius, input placeholder, and auto-open delay. Changes update the live preview and embed snippet instantly.'
        />
        <QA
          q="What can I customize?"
          a="Color (hex), greeting message, subtitle text, input placeholder, position (left/right), border radius, logo URL (displayed in the header), and auto-open delay (seconds before the widget opens automatically, 0 = disabled)."
        />
      </SectionBlock>

      <SectionBlock title="Embedding">
        <QA
          q="How do I embed the widget?"
          a='Copy the embed snippet from the agent detail page and paste it before the closing </body> tag on your website. The snippet includes all your customization settings as data attributes. You need an API key — generate one in Settings and scope it to the agent.'
          code={'<script\n  src="https://cane.fyi/widget.js"\n  data-api-key="cane_your_key_here"\n  data-agent-name="My Support Agent"\n  data-workspace-id="your-agent-id"\n  data-color="#c8963e"\n  data-greeting="Hi! How can I help?"\n  data-logo-url="https://yoursite.com/logo.png"\n  data-auto-open="5"\n></script>'}
        />
        <QA
          q="What data attributes are available?"
          a="data-api-key (required), data-agent-name, data-workspace-id (required), data-color, data-greeting, data-position (right/left), data-subtitle, data-placeholder, data-border-radius, data-logo-url, and data-auto-open (seconds, 0 = disabled)."
        />
        <QA
          q="Can I save widget settings per agent?"
          a="Yes. Click 'Save Config' in the widget customizer and your settings are stored with the agent. The embed snippet auto-updates with the saved configuration."
        />
      </SectionBlock>
    </div>
  )
}

function DeployTab() {
  return (
    <div>
      <SectionBlock title="Embed Widget">
        <QA
          q="How do I add the chat widget to my site?"
          a='Copy the embed snippet from your agent detail page and paste it before the closing </body> tag. The widget is self-contained — one script tag, no dependencies.'
          code={'<script\n  src="https://cane.fyi/widget.js"\n  data-api-key="cane_your_key_here"\n  data-agent-name="Support Agent"\n  data-workspace-id="your-agent-id"\n  data-color="#c8963e"\n  data-greeting="Hi! How can I help?"\n></script>'}
        />
        <QA
          q="Can I customize the look?"
          a="Yes. Use the widget customizer in the agent detail page to set colors, greeting, logo, position, border radius, and auto-open delay. All settings are passed as data attributes in the script tag."
        />
      </SectionBlock>

      <SectionBlock title="API Access">
        <QA
          q="How do I get an API key?"
          a='Go to Settings and scroll to the API Keys section (owner access required). Click "Generate new key," give it a name, and optionally scope it to a specific agent. The full key is shown once — copy it immediately.'
        />
        <QA
          q="Ask a question"
          a="Send a POST request to /v1/ask with your question. The response includes an AI-generated answer with source files. If the agent has tools configured, they execute automatically."
          code={'curl -X POST https://cane.fyi/v1/ask \\\n  -H "Authorization: Bearer cane_your_key_here" \\\n  -H "Content-Type: application/json" \\\n  -d \'{\n    "query": "What is our refund policy?",\n    "workspace_id": "your-agent-id"\n  }\''}
        />
        <QA
          q="Response format"
          a="The /v1/ask endpoint returns a JSON object with the answer, source files, and metadata."
          code={'{\n  "answer": "According to the terms of service, refunds are...",\n  "sources": ["terms-of-service.pdf"],\n  "chunks_used": 5,\n  "model": "claude-haiku-4-5-20251001"\n}'}
        />
        <QA
          q="Raw search (no AI synthesis)"
          a="Use /v1/search to get raw content chunks with relevance scores — useful when you want to build your own UI or processing pipeline."
          code={'curl -X POST https://cane.fyi/v1/search \\\n  -H "Authorization: Bearer cane_your_key_here" \\\n  -H "Content-Type: application/json" \\\n  -d \'{\n    "query": "onboarding procedures",\n    "max_results": 5\n  }\''}
        />
        <QA
          q="Rate limits"
          a="Each API key is limited to 1,000 requests per day. The counter resets at midnight UTC."
        />
      </SectionBlock>
    </div>
  )
}

function MarketplaceTab() {
  return (
    <div>
      <SectionBlock title="How It Works">
        <QA
          q="What is the marketplace?"
          a="The marketplace is where you publish agents for others to discover, clone, and use. Every listing includes the agent's eval score, test cases, and scoring criteria — so anyone can independently verify that the agent works before trusting it."
        />
        <QA
          q="What are agent packs?"
          a='Pre-built agent packages that include a complete setup: system prompt, eval suite with test cases and criteria, and optionally documents. Cane ships with featured packs like "AI Sales Rep" and "AI Receptionist" that you can clone with one click and start using immediately.'
        />
        <QA
          q="What makes this different from other AI marketplaces?"
          a='Verified trust. When you clone an agent from the marketplace, you also get its entire eval suite — test cases, criteria, and expected answers. You can re-run the evaluation on your own copy to independently confirm the published score. The score is not marketing — it is reproducible.'
        />
      </SectionBlock>

      <SectionBlock title="Publishing">
        <QA
          q="How do I publish an agent?"
          a='Go to your agent detail page and scroll to the Publish section. Select a category, choose what to include (full pack with docs or blueprint-only), and optionally attach an eval run. Click "Publish Agent" and it goes live on the marketplace.'
        />
        <QA
          q="What are pack types?"
          a="Full Pack includes everything — system prompt, documents, and eval suite. Cloners get a ready-to-use agent. Bring Your Own Docs (BYOD) includes the prompt and eval suite but not the documents — cloners upload their own files into the same framework. BYOD is useful when the eval methodology is the product, not the specific documents."
        />
        <QA
          q="Do I need eval scores to publish?"
          a="No, but agents with eval scores get significantly more trust. A listing that shows 'Scored 87/100 across 15 test cases' is far more compelling than one with no verification. Run at least one evaluation before publishing."
        />
        <QA
          q="Can I remove my listing?"
          a='Yes. Go to your listing on the marketplace and click "Remove from Marketplace." The listing is delisted immediately. Agents that were already cloned by other users continue to work in their accounts.'
        />
      </SectionBlock>

      <SectionBlock title="Cloning">
        <QA
          q="How do I clone an agent?"
          a='Find an agent on the marketplace and click "Clone Agent." Cane creates a copy in your account with the system prompt, documents (for full packs), and the complete eval suite. You can customize the clone — change the prompt, add your own files, re-run the evaluation.'
        />
        <QA
          q="How do I verify a clone?"
          a='After cloning, go to the evaluation that was created and click "Run Evaluation." Cane runs the published test cases against your copy of the agent. You will get an independent score that you can compare against the published listing score.'
        />
        <QA
          q="What if my verification score differs from the published score?"
          a="Small differences (a few points) are normal due to LLM non-determinism. Large differences may indicate that the documents in the listing are not well-suited to the test cases, or that the original publisher optimized their prompt for specific questions. The verification score is the one that matters for your deployment."
        />
      </SectionBlock>
    </div>
  )
}

function FAQTab() {
  return (
    <div>
      <SectionBlock title="Files & Processing">
        <QA
          q="What file types can I upload?"
          a="PDFs, Word docs (DOCX), spreadsheets (XLSX, CSV), images (PNG, JPG, GIF, TIFF, WEBP), audio (MP3, WAV, M4A, FLAC), and video (MP4, MKV, AVI, MOV, WEBM)."
        />
        <QA
          q="How long does processing take?"
          a="Most files process in under a minute. Audio and video take longer due to transcription. You can keep working while files process in the background."
        />
        <QA
          q="What happens during processing?"
          a="Cane extracts text from your files, splits it into searchable chunks, and creates embeddings for semantic search. For images, it runs OCR. For audio and video, it generates a transcript."
        />
      </SectionBlock>

      <SectionBlock title="Search & Conversations">
        <QA
          q="Can I search a specific agent or workspace?"
          a='Yes. Use the dropdown below the search bar to select an agent or workspace. "All workspaces" searches everything you have access to.'
        />
        <QA
          q="What are follow-up questions?"
          a="After your first search, you can ask follow-up questions in the same session. Cane remembers the context of the conversation. Click 'New chat' to start fresh."
        />
        <QA
          q="Are my conversations saved?"
          a="Yes. All conversations are logged in the analytics dashboard for the relevant agent. You can see recent queries, response previews, channel information, and response times."
        />
      </SectionBlock>

      <SectionBlock title="Team & Account">
        <QA
          q="How do I invite team members?"
          a="Go to Settings and use the team invite section. Enter their email address and they will receive access. Team members can search and upload files to shared workspaces."
        />
        <QA
          q="What are the different roles?"
          a="Owners can manage the team, workspaces, agents, and all settings. Members can upload files and search. Everyone on the team accesses the same file pool."
        />
        <QA
          q="Can I scope an API key to one agent?"
          a="Yes. When generating an API key in Settings, select an agent from the scope dropdown. All requests using that key are automatically scoped — no need to pass workspace_id on every request."
        />
      </SectionBlock>

      <SectionBlock title="Security & Data">
        <QA
          q="Who can see my data?"
          a="Only members of your organization. Each tenant is fully isolated — documents, agents, and settings are not visible to other accounts. API keys are scoped to your tenant."
        />
        <QA
          q="What happens when I delete something?"
          a="Deleting a file removes it and all its indexed content permanently. Deleting an agent removes the agent, its files, tools, MCP connections, evaluations, analytics logs, marketplace listings, and all vector data. These actions cannot be undone."
        />
      </SectionBlock>
    </div>
  )
}

// ─── TABS ───

const tabs = [
  { id: 'guide', label: 'User Guide', Component: UserGuideTab },
  { id: 'api', label: 'API Docs', Component: APIDocsTab },
  { id: 'faq', label: 'FAQ', Component: FAQTab },
]

function UserGuideTab() {
  return (
    <div>
      <GettingStarted />
      <SectionBlock title="Agents" />
      <AgentsTab />
      <SectionBlock title="Tools & Connections" />
      <ToolsTab />
      <SectionBlock title="Evaluations" />
      <EvaluationsTab />
      <SectionBlock title="Widget & Embed" />
      <WidgetTab />
      <SectionBlock title="Analytics" />
      <AnalyticsTab />
      <SectionBlock title="Marketplace" />
      <MarketplaceTab />
    </div>
  )
}

function APIDocsTab() {
  return (
    <div>
      <DeployTab />
    </div>
  )
}

export default function Guide() {
  const [activeTab, setActiveTab] = useState('guide')
  const { user } = useAuth()
  const ActiveComponent = tabs.find(t => t.id === activeTab)?.Component || UserGuideTab

  return (
    <div className="fade-in" style={{ maxWidth: 960, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 8 }}>
        <h2 style={{
          fontSize: '1.55rem', fontWeight: 800, marginBottom: 4,
          fontFamily: 'var(--font-display)', letterSpacing: '-0.03em',
        }}>
          Docs
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Everything you need to know about building, evaluating, and deploying agents on Cane.
        </p>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 0,
        borderBottom: '1px solid var(--rule)',
        marginBottom: 28,
        overflowX: 'auto',
      }}>
        {tabs.map(tab => {
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 14px',
                fontSize: '0.78rem',
                fontWeight: active ? 700 : 500,
                color: active ? 'var(--text)' : 'var(--text-muted)',
                background: 'none',
                border: 'none',
                borderBottom: active ? '2px solid var(--cane-900)' : '2px solid transparent',
                marginBottom: -1,
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
                transition: 'color 0.1s',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Active tab content */}
      <ActiveComponent />

      {/* Footer — context-aware */}
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
              background: 'var(--accent)', color: 'white',
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
    </div>
  )
}
