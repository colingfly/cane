import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, Check, Search, Bot, FlaskConical, FileText, Upload, Zap, Shield, Globe, Store, Wrench, Code, MessageSquare } from 'lucide-react'
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
          connect it to your tools, verify it with evaluations, and deploy it on any website — or publish
          it to the marketplace for others to use.
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
          title="Agentic Tools"
          description="Agents don't just answer — they act. Connect webhooks to fire Slack messages, log to spreadsheets, create tickets, or pull live data into responses."
          detail="Webhook integration with Zapier, Make, n8n — 5,000+ apps"
        />
        <FeatureCard
          icon={FlaskConical}
          title="Built-in Evaluations"
          description="Write test cases, define scoring criteria, and run automated evaluations. Cane scores every answer on accuracy, completeness, relevance, and faithfulness."
          detail="LLM-as-Judge with weighted criteria and failure classification"
        />
        <FeatureCard
          icon={Globe}
          title="Deploy Anywhere"
          description="Embed your agent on any website with one script tag. Branded chat widget, API access, or publish to the marketplace for others to clone and verify."
          detail="Widget, REST API, and marketplace distribution"
        />
      </div>

      {/* How it works */}
      <SectionBlock title="How It Works">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {[
            {
              step: '1',
              icon: Upload,
              title: 'Upload your files',
              desc: 'Drag and drop files into Cane. Text is extracted, split into chunks, and embedded for semantic search. PDFs, Word docs, spreadsheets, images, audio, and video are all supported.',
            },
            {
              step: '2',
              icon: Bot,
              title: 'Build a specialized agent',
              desc: 'Choose a template or create your own. Upload domain-specific files, customize the AI prompt (or let Cane auto-generate one), and connect tools for real-world actions.',
            },
            {
              step: '3',
              icon: FlaskConical,
              title: 'Evaluate and verify',
              desc: 'Write test cases or auto-generate them from your docs. Run evaluations. Cane scores every response and shows exactly where the agent excels and where it falls short.',
            },
            {
              step: '4',
              icon: Globe,
              title: 'Deploy',
              desc: 'Embed the agent on your website with a single script tag, access it via the REST API, or publish it to the marketplace. One agent, multiple distribution channels.',
            },
          ].map(s => (
            <div key={s.step} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: 'var(--cane-900)', color: 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.75rem',
                flexShrink: 0, marginTop: 2,
              }}>
                {s.step}
              </div>
              <div>
                <div style={{
                  fontWeight: 700, fontSize: '0.86rem', color: 'var(--text)',
                  fontFamily: 'var(--font-display)', marginBottom: 4,
                }}>
                  {s.title}
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  {s.desc}
                </div>
              </div>
            </div>
          ))}
        </div>
      </SectionBlock>

      {/* Under the hood */}
      <SectionBlock title="Under the Hood">
        <div style={{
          padding: '16px 20px',
          background: 'var(--paper)',
          border: '1px solid var(--rule)',
          borderRadius: 'var(--radius)',
          fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.7,
        }}>
          <p style={{ marginBottom: 12 }}>
            Cane uses retrieval-augmented generation (RAG) to ground every answer in your source material. Files are chunked and embedded using BGE, stored in ChromaDB, and retrieved at query time using a hybrid pipeline that combines dense vector search with sparse keyword matching and reciprocal rank fusion.
          </p>
          <p style={{ marginBottom: 12 }}>
            Answers are generated by Claude (Anthropic) with a system prompt that enforces source grounding — the AI can only answer from what it finds in your documents. When tools are configured, Cane uses Claude's native tool_use capability to execute webhooks and incorporate external data seamlessly.
          </p>
          <p style={{ margin: 0 }}>
            Evaluations use an LLM-as-Judge architecture: a separate model scores each response on configurable criteria with weighted aggregation. Scores, judge reasoning, and per-criteria breakdowns are stored for every run so you can track improvement over time.
          </p>
        </div>
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
          a="Yes. On the Agent Builder page, click the trash icon on any agent card. This deletes the agent, its files, tools, eval environments, and any marketplace listings. This action cannot be undone."
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
          a="Webhook tools — HTTP requests fired to any URL. This covers a massive range of integrations because services like Zapier, Make, and n8n let you create webhook URLs that trigger any workflow. Fire-and-forget tools just notify (log to sheet, ping Slack). Wait-for-response tools pull live data into the agent's answer."
        />
      </SectionBlock>

      <SectionBlock title="Setting Up Tools">
        <QA
          q="How do I add a tool to an agent?"
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
        <QA
          q="What is an environment?"
          a="An environment is where evaluations happen. It links to one agent, contains a set of test cases, defines judge criteria, and stores the history of all evaluation runs. Think of it as a test bench for a specific agent."
        />
      </SectionBlock>

      <SectionBlock title="Setting Up">
        <QA
          q="How do I create an environment?"
          a='Go to Environments from the sidebar and click "New Environment." Give it a name and select which agent to test. The agent must already exist and have files uploaded.'
        />
        <QA
          q="How do I write test cases?"
          a='In the environment, go to the Test Cases tab and click "Add Test Case." Enter a question and the expected answer. The expected answer does not have to be word-for-word — it is a reference the judge uses to evaluate whether the agent covered the right content. Write what a correct answer should include.'
        />
        <QA
          q="Can I auto-generate test cases?"
          a='Yes. Click "Auto-generate" on the Test Cases tab. Cane analyzes your agent&apos;s documents and generates question-answer pairs that cover the key topics. Review and edit them before running an evaluation — auto-generated cases are a starting point, not a final product.'
        />
      </SectionBlock>

      <SectionBlock title="Judge Criteria">
        <QA
          q="What are judge criteria?"
          a="Judge criteria define how each response is scored. By default, Cane uses four criteria: Accuracy (are the facts correct?), Completeness (does it cover everything important?), Relevance (does it actually answer the question?), and Faithfulness (is it grounded in the source documents, not hallucinated?). Each criterion is scored 0-100."
        />
        <QA
          q="How is the overall score calculated?"
          a="The overall score for each test case is the weighted average of its criteria scores. By default, all four criteria are weighted equally (25% each). You can adjust weights — for example, if faithfulness matters more than completeness for your use case, give it 40% weight."
        />
        <QA
          q="Can I add custom criteria?"
          a='Yes. In the Judge Criteria tab, add your own criteria with a name, description, and weight. For example: "Tone" (is the response professional?), "Specificity" (does it cite specific numbers or dates?), or "Safety" (does it avoid giving dangerous advice?). The LLM judge uses your description to score each one.'
        />
      </SectionBlock>

      <SectionBlock title="Running Evaluations">
        <QA
          q="How do I run an evaluation?"
          a='Click "Run Evaluation" from the environment page. Cane sends each test case question to your agent, collects the response, then passes both the response and expected answer to an LLM judge for scoring. Results stream in as each test case completes.'
        />
        <QA
          q="How long does an evaluation take?"
          a="Each test case typically takes 3-8 seconds (the agent query plus the judge scoring). A 10-question evaluation runs in about a minute. Results appear as they complete, so you do not have to wait for the full run."
        />
        <QA
          q="Can I re-run evaluations?"
          a="Yes. Every run is saved in the environment's history. Re-run after changing the agent's prompt, adding files, or updating test cases. Compare runs to track improvement."
        />
      </SectionBlock>

      <SectionBlock title="Reading Results">
        <QA
          q="What do the scores mean?"
          a="Each test case gets an overall score from 0-100. Above 80 is a pass (green). Between 60-80 is a warning (amber) — the answer is okay but has gaps. Below 60 is a fail (red) — the answer is wrong, incomplete, or off-topic. The environment's overall score is the average across all test cases."
        />
        <QA
          q="What is judge reasoning?"
          a="For every test case, the LLM judge writes an explanation of why it scored the response the way it did. This is the most useful part of the evaluation — it tells you exactly what the agent got right, what it missed, and what it got wrong. Use it to diagnose problems."
        />
      </SectionBlock>

      <SectionBlock title="Improving Scores">
        <QA
          q="My agent scored low on accuracy. What do I do?"
          a="Low accuracy usually means the agent is stating incorrect facts. Check the judge reasoning. Common fixes: make sure the source documents actually contain the correct information, and add a line to the system prompt like 'Only answer based on the provided documents. If the answer is not in the documents, say so.'"
        />
        <QA
          q="My agent scored low on faithfulness. What do I do?"
          a="Low faithfulness means the agent is generating information not found in the source documents — hallucination. Add strong grounding instructions to the prompt: 'Base your answer strictly on the provided context. Do not add information from outside knowledge.' An agent that says 'I do not have enough information' is more faithful than one that gives a confident but unsupported answer."
          note="Faithfulness is the hardest criterion to score well on. It is also the most important for trust-sensitive deployments like compliance, healthcare, and legal."
        />
        <QA
          q="General tips for improving scores"
          a="Start with your worst-scoring test cases and read the judge reasoning. Most improvements come from three levers: better system prompts (be more specific about behavior and grounding rules), better documents (make sure the source files actually contain the answers you expect), and better test cases (if an expected answer is vague, the judge cannot score accurately). Change one thing, re-run, compare."
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
          q="What is the embed widget?"
          a="A single JavaScript snippet that adds your agent as a chat interface on any website. Visitors see a floating chat bubble. They click it, ask questions, and get answers from your agent — with full tool execution and source citations. No login required for end users."
        />
        <QA
          q="How do I embed an agent?"
          a='Go to your agent detail page and scroll to the "Embed on Your Website" section. Copy the script tag, replace YOUR_API_KEY with a real API key from Settings, and paste it into any HTML page. The widget handles everything else.'
          code={'<script\n  src="https://cane.fyi/widget.js"\n  data-api-key="cane_your_key_here"\n  data-agent-name="My Support Agent"\n  data-workspace-id="your-agent-id"\n  data-color="#8B7355"\n  data-greeting="Hi! How can I help?"\n></script>'}
        />
        <QA
          q="What can I customize?"
          a="data-color sets the primary color (header, buttons, message bubbles) — use any hex color to match your brand. data-greeting sets the welcome message. data-agent-name sets the header title. data-position can be 'left' or 'right' to control which corner the bubble appears in."
        />
        <QA
          q="Does the widget work on mobile?"
          a="Yes. On screens under 480px, the widget expands to full screen for a native chat feel."
        />
      </SectionBlock>

      <SectionBlock title="API Access">
        <QA
          q="What can I do with the API?"
          a="The Cane API lets you query your agent programmatically from any external app — a Slack bot, mobile app, internal portal, or custom integration. Any agent you build in Cane can be accessed via API."
        />
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
          a='After cloning, go to the eval environment that was created and click "Run Evaluation." Cane runs the published test cases against your copy of the agent. You will get an independent score that you can compare against the published listing score.'
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
          a="Conversation history is maintained during your active session but is not permanently stored. Starting a new chat or refreshing the page clears the conversation."
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
          a="Deleting a file removes it and all its indexed content permanently. Deleting an agent removes the agent, its files, tools, eval environments, marketplace listings, and all vector data. These actions cannot be undone."
        />
      </SectionBlock>
    </div>
  )
}

// ─── TABS ───

const tabs = [
  { id: 'start', label: 'Getting Started', Component: GettingStarted },
  { id: 'agents', label: 'Agents', Component: AgentsTab },
  { id: 'tools', label: 'Tools', Component: ToolsTab },
  { id: 'evals', label: 'Evaluations', Component: EvaluationsTab },
  { id: 'deploy', label: 'Deploy', Component: DeployTab },
  { id: 'marketplace', label: 'Marketplace', Component: MarketplaceTab },
  { id: 'faq', label: 'FAQ', Component: FAQTab },
]

export default function Guide() {
  const [activeTab, setActiveTab] = useState('start')
  const { user } = useAuth()
  const ActiveComponent = tabs.find(t => t.id === activeTab)?.Component || GettingStarted

  return (
    <div className="fade-in" style={{ maxWidth: 720, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 8 }}>
        <h2 style={{
          fontSize: '1.55rem', fontWeight: 800, marginBottom: 4,
          fontFamily: 'var(--font-display)', letterSpacing: '-0.03em',
        }}>
          Guide
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