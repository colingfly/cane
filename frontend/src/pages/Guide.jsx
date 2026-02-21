import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, Check, Search, Bot, FlaskConical, FileText, Upload, Zap, Shield } from 'lucide-react'
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
          Your documents, answering questions.
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.7, maxWidth: 560 }}>
          Cane turns your files into a searchable knowledge base you can ask questions in plain English.
          Upload documents, build specialized AI agents, and evaluate whether they're giving the right answers — all in one platform.
        </div>
      </div>

      {/* Feature grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 32 }}>
        <FeatureCard
          icon={Search}
          title="Semantic Search"
          description="Ask questions in natural language and get answers with sources cited. No keywords, no digging through folders."
          detail="Hybrid retrieval: dense vectors (BGE) + sparse matching (BM25) + LLM reranking"
        />
        <FeatureCard
          icon={Bot}
          title="Custom AI Agents"
          description="Build agents scoped to specific files with custom behavior — an HR agent, a compliance agent, a product expert. Each with its own knowledge base and instructions."
          detail="Auto-generated system prompts from corpus analysis"
        />
        <FeatureCard
          icon={FlaskConical}
          title="Built-in Evaluations"
          description="Write test cases, define scoring criteria, and run automated evaluations. Cane scores every answer on accuracy, completeness, relevance, and faithfulness."
          detail="LLM-as-Judge with weighted criteria and failure classification"
        />
        <FeatureCard
          icon={FileText}
          title="Multimodal Ingestion"
          description="PDFs, Word docs, spreadsheets, images, audio, video — Cane processes it all. OCR for images, Whisper for transcription, smart chunking for everything."
          detail="Supports PDF, DOCX, XLSX, CSV, PNG, JPG, MP3, WAV, MP4"
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
              desc: 'Drag and drop files into Cane. Text is extracted, split into chunks, and embedded for semantic search. Most files process in under a minute.',
            },
            {
              step: '2',
              icon: Search,
              title: 'Search with natural language',
              desc: 'Ask a question like "What is our PTO policy?" or "How do I configure the API?" — Cane finds the most relevant chunks across your files and synthesizes a clear answer with sources.',
            },
            {
              step: '3',
              icon: Bot,
              title: 'Build a specialized agent',
              desc: 'Pick a template or create your own. Upload domain-specific files, customize the AI prompt (or let Cane auto-generate one), and deploy an agent that knows exactly one thing deeply.',
            },
            {
              step: '4',
              icon: FlaskConical,
              title: 'Evaluate and improve',
              desc: 'Write test cases with expected answers. Run an evaluation. Cane scores every response and shows you exactly where the agent gets it right and where it falls short — so you can iterate with data, not guesses.',
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
            Answers are generated by Claude, Anthropic's language model, with a system prompt that enforces source grounding — the AI can only answer from what it finds in your documents. No hallucination by design.
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
          a="Agents give you control over two things: scope (which files are searched) and behavior (how the AI responds). A legal agent can be instructed to cite specific clauses. An ops agent can be told to give step-by-step procedures. Without agents, every query hits your entire file pool with a generic prompt."
        />
      </SectionBlock>

      <SectionBlock title="Creating Agents">
        <QA
          q="What templates are available?"
          a="Three pre-built templates: Operations Guide (for SOPs, handbooks, and procedures), Academic Tutor (for lecture materials and coursework), and Knowledge Base (for product docs, FAQs, and service guides). Each comes with an optimized system prompt for its use case."
        />
        <QA
          q="How do I create a custom agent?"
          a='Go to Agent Builder and click "Create Your Own." Give it a name, then upload files. You can write your own system prompt or use Auto-generate — which analyzes your uploaded files and writes a specialized prompt based on the domain, terminology, and content it finds. Edit the result before saving.'
        />
        <QA
          q="What makes a good system prompt?"
          a="Be specific about the agent's role, the type of questions it should expect, and how it should format answers. Tell it what to do when it can't find an answer — should it say so, or make a best guess? Include any domain-specific rules: always cite section numbers, always include dates, never give legal advice, etc."
          note="Tip: After auto-generating a prompt, run an evaluation to see how the agent performs. Then tweak the prompt based on where it fails."
        />
      </SectionBlock>

      <SectionBlock title="Using Agents">
        <QA
          q="How do I search with an agent?"
          a='Agents appear in the Search page dropdown under the "Agents" group. Select one to scope your search to that agent&apos;s files and system prompt. You can also click "Ask this agent" from the agent detail page to go directly to Search with that agent pre-selected.'
        />
        <QA
          q="Can I update an agent's files later?"
          a="Yes. Go to the agent detail page and upload additional files or delete existing ones. New files are processed and indexed automatically. The agent's search results will include the new content immediately after processing completes."
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
          a='Switch to the "Test Cases" tab inside your environment. Each test case has a question (what to ask the agent) and an expected answer (what a correct response should contain). You do not need to write the perfect answer word-for-word — the judge scores based on meaning, not exact match.'
          note='Tip: Write 10-20 test cases covering your agent&apos;s most important use cases. Include easy ones ("What is X?"), hard ones ("Compare X and Y"), and edge cases ("What happens if Z is not specified?").'
        />
        <QA
          q="What makes a good expected answer?"
          a="Include the key facts the response must contain. You do not need full sentences — bullet points or fragments work. The judge is looking for whether the agent's response covers the same ground, not whether it matches your phrasing. Be specific: 'The policy allows 15 days PTO' is better than 'The policy describes PTO allowances.'"
        />
      </SectionBlock>

      <SectionBlock title="Judge Criteria">
        <QA
          q="What are judge criteria?"
          a="Judge criteria define how each response is scored. By default, Cane uses four criteria: Accuracy (are the facts correct?), Completeness (does it cover everything important?), Relevance (does it actually answer the question?), and Faithfulness (is it grounded in the source documents, not hallucinated?). Each criterion is scored 0-100."
        />
        <QA
          q="How is the overall score calculated?"
          a="The overall score for each test case is the weighted average of its criteria scores. By default, all four criteria are weighted equally (25% each). You can adjust weights in the Judge Criteria tab — for example, if faithfulness matters more than completeness for your use case, give it 40% weight."
        />
        <QA
          q="Can I add custom criteria?"
          a='Yes. In the Judge Criteria tab, you can add your own criteria with a name, description, and weight. For example, you might add "Tone" (is the response professional?) or "Specificity" (does it cite specific numbers/dates?) or "Safety" (does it avoid giving dangerous advice?). The LLM judge uses your description to score each one.'
        />
      </SectionBlock>

      <SectionBlock title="Running Evaluations">
        <QA
          q="How do I run an evaluation?"
          a='Click "Run Evaluation" from the environment page. Cane sends each test case question to your agent, collects the response, then passes both the response and expected answer to an LLM judge for scoring. Results stream in as each test case completes — you can watch progress in real time.'
        />
        <QA
          q="How long does an evaluation take?"
          a="Each test case typically takes 3-8 seconds (the agent query plus the judge scoring). A 10-question evaluation runs in about a minute. Results appear as they complete, so you do not have to wait for the full run to start seeing scores."
        />
        <QA
          q="Can I re-run evaluations?"
          a="Yes. Every run is saved in the environment's history. You can re-run at any time — after changing the agent's prompt, adding files, or updating test cases. Compare runs side by side to track improvement."
        />
      </SectionBlock>

      <SectionBlock title="Reading Results">
        <QA
          q="What do the scores mean?"
          a="Each test case gets an overall score from 0-100. Above 80 is a pass (green). Between 60-80 is a warning (amber) — the answer is okay but has gaps. Below 60 is a fail (red) — the answer is wrong, incomplete, or off-topic. The environment's overall score is the average across all test cases."
        />
        <QA
          q="How do I read the results table?"
          a="Each row shows one test case: its status (pass/warn/fail), the question, response time, and score. Click a row to expand it and see the agent's actual answer, your expected answer, the judge's reasoning, and a per-criterion score breakdown with progress bars."
        />
        <QA
          q="What is judge reasoning?"
          a="For every test case, the LLM judge writes a short explanation of why it scored the response the way it did. This is the most useful part of the evaluation — it tells you exactly what the agent got right, what it missed, and what it got wrong. Use it to diagnose problems."
        />
      </SectionBlock>

      <SectionBlock title="Improving Scores">
        <QA
          q="My agent scored low on accuracy. What do I do?"
          a="Low accuracy usually means the agent is stating incorrect facts. Check the judge reasoning to see what is wrong. Common fixes: make sure the source documents actually contain the correct information. If the agent is hallucinating, add a line to the system prompt like 'Only answer based on the provided documents. If the answer is not in the documents, say so.' If the wrong chunks are being retrieved, consider splitting large documents into smaller, more focused files."
        />
        <QA
          q="My agent scored low on completeness. What do I do?"
          a="Low completeness means the answer is partially right but missing important details. Common fixes: check if the expected answer requires information spread across multiple files — the agent may only be finding one. Add explicit instructions to the system prompt like 'When answering, be thorough and include all relevant details from the documents.'"
        />
        <QA
          q="My agent scored low on faithfulness. What do I do?"
          a="Low faithfulness means the agent is generating information not found in the source documents — hallucination. This is the most important criterion to get right. Add strong grounding instructions to the prompt: 'Base your answer strictly on the provided context. Do not add information from outside knowledge.' Review whether your expected answers contain information that is not actually in the uploaded files. If the agent lacks information to answer a question, it should say so rather than guess."
          note="Faithfulness is the hardest criterion to score well on. An agent that says 'I do not have enough information to answer this' is more faithful than one that gives a confident but unsupported answer."
        />
        <QA
          q="General tips for improving scores"
          a="Start with your worst-scoring test cases and read the judge reasoning carefully. Most score improvements come from three levers: better system prompts (be more specific about behavior, format, and grounding rules), better documents (make sure the source files actually contain the answers you expect), and better test cases (if an expected answer is vague, the judge cannot score accurately). Iterate: change one thing, re-run, compare scores."
        />
      </SectionBlock>
    </div>
  )
}

function APITab() {
  return (
    <div>
      <SectionBlock title="Overview">
        <QA
          q="What can I do with the API?"
          a="The Cane API lets you query your files programmatically from any external app — a Slack bot, customer support widget, internal portal, or custom integration. Any agent you build in Cane can be accessed via API."
        />
        <QA
          q="How do I get an API key?"
          a='Go to Settings and scroll to the API Keys section (owner access required). Click "Generate new key," give it a name, and optionally scope it to a specific workspace or agent. The full key is shown once — copy it immediately.'
        />
      </SectionBlock>

      <SectionBlock title="Endpoints">
        <QA
          q="Ask a question"
          a="Send a POST request to /v1/ask with your question. The response includes an AI-generated answer and source files."
          code={'curl -X POST https://cane.fyi/v1/ask \\\n  -H "Authorization: Bearer cane_your_key_here" \\\n  -H "Content-Type: application/json" \\\n  -d \'{\n    "query": "What is our PTO policy?",\n    "workspace_id": "optional-workspace-id"\n  }\''}
        />
        <QA
          q="Response format"
          a="The /v1/ask endpoint returns a JSON object with the answer, source files, and metadata."
          code={'{\n  "answer": "According to the employee handbook...",\n  "sources": ["employee-handbook.pdf"],\n  "chunks_used": 5,\n  "model": "claude-haiku-4-5-20251001"\n}'}
        />
        <QA
          q="Raw search (no AI synthesis)"
          a="Use /v1/search to get raw content chunks with relevance scores — useful when you want to build your own UI or processing pipeline."
          code={'curl -X POST https://cane.fyi/v1/search \\\n  -H "Authorization: Bearer cane_your_key_here" \\\n  -H "Content-Type: application/json" \\\n  -d \'{\n    "query": "onboarding procedures",\n    "max_results": 5\n  }\''}
        />
        <QA
          q="Health check"
          a="GET /v1/health returns service status. No authentication required."
          code={'curl https://cane.fyi/v1/health\n\n# {"status": "ok", "service": "cane", "api_version": "v1"}'}
        />
      </SectionBlock>

      <SectionBlock title="Configuration">
        <QA
          q="Can I scope a key to one agent?"
          a="Yes. When generating an API key in Settings, select a workspace or agent from the scope dropdown. All requests using that key are automatically scoped — no need to pass workspace_id on every request."
        />
        <QA
          q="What are the rate limits?"
          a="Each API key is limited to 1,000 requests per day. The counter resets at midnight UTC. If you need higher limits, contact your administrator."
        />
      </SectionBlock>
    </div>
  )
}

function FAQTab() {
  return (
    <div>
      <SectionBlock title="Search & Conversations">
        <QA
          q="Can I search a specific workspace or agent?"
          a='Yes. Use the dropdown below the search bar to select a workspace or agent. "All workspaces" searches everything you have access to. Agents appear under a separate group in the dropdown.'
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

      <SectionBlock title="Files & Processing">
        <QA
          q="What file types can I upload?"
          a="PDFs, Word docs (DOCX), spreadsheets (XLSX, CSV), images (PNG, JPG, GIF, TIFF, WEBP), audio (MP3, WAV, M4A, FLAC), and video (MP4, MKV, AVI, MOV, WEBM)."
        />
        <QA
          q="How long does processing take?"
          a="Most files process in under a minute. Audio and video take longer due to transcription. You will see a status indicator while processing is in progress. You can keep working while files process in the background."
        />
        <QA
          q="What happens during processing?"
          a="Cane extracts text from your files, splits it into searchable chunks, and creates embeddings for semantic search. For images, it runs OCR. For audio and video, it generates a transcript."
        />
        <QA
          q="Can I delete a file?"
          a="Yes. On the Files page, click the trash icon next to any file. This removes the file and all its indexed content. This action cannot be undone."
        />
      </SectionBlock>

      <SectionBlock title="Workspaces">
        <QA
          q="What is a workspace?"
          a="A workspace is a collection of files grouped by topic, department, or project. When you search within a workspace, only files in that workspace are searched."
        />
        <QA
          q="How do I create a workspace?"
          a='Go to Settings and look for the Workspaces section. Click "Add Workspace" and give it a name. You can then upload files directly to that workspace.'
        />
        <QA
          q="When should I use multiple workspaces?"
          a="Use separate workspaces when you have distinct file collections that should not overlap in search results. For example: one for HR policies, another for product docs, another for training materials."
        />
      </SectionBlock>

      <SectionBlock title="Team & Account">
        <QA
          q="How do I invite team members?"
          a="Go to Settings and use the team invite section. Enter their email address and they will receive access. Team members can search and upload files to shared workspaces."
        />
        <QA
          q="What are the different roles?"
          a="Owners can manage the team, workspaces, agents, and all files. Members can upload files and search. Everyone on the team searches the same file pool."
        />
        <QA
          q="How do I change my password?"
          a="Go to Settings and look for the password section. Enter your current password and your new password to update it."
        />
      </SectionBlock>
    </div>
  )
}

// ─── TABS ───

const tabs = [
  { id: 'start', label: 'Getting Started', Component: GettingStarted },
  { id: 'agents', label: 'Agents', Component: AgentsTab },
  { id: 'evals', label: 'Evaluations', Component: EvaluationsTab },
  { id: 'api', label: 'API', Component: APITab },
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
          Everything you need to know about using Cane.
        </p>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 0,
        borderBottom: '1px solid var(--rule)',
        marginBottom: 28,
      }}>
        {tabs.map(tab => {
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 16px',
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
            Create a free account and upload your first files in under a minute.
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