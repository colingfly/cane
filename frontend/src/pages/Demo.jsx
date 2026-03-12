import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'

const API_BASE = window.location.origin
const MAX_MESSAGES = 10
const MAX_FILES = 3
const MAX_SIZE = 5 * 1024 * 1024
const ALLOWED_EXT = /\.(pdf|txt|csv|docx)$/i

export default function Demo() {
  // Session
  const [session, setSession] = useState(null)
  const [sessionLoading, setSessionLoading] = useState(true)

  // Agent config
  const [agentName, setAgentName] = useState('My Agent')
  const [agentDesc, setAgentDesc] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [promptSaving, setPromptSaving] = useState(false)
  const [promptDirty, setPromptDirty] = useState(false)
  const promptTimer = useRef(null)

  // Files
  const [documents, setDocuments] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState('')
  const [dragover, setDragover] = useState(false)
  const fileRef = useRef()

  // Chat
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [history, setHistory] = useState([])
  const [msgCount, setMsgCount] = useState(0)
  const [error, setError] = useState(null)
  const bottomRef = useRef(null)

  // Widget customizer
  const [widgetColor, setWidgetColor] = useState('#ffffff')
  const [widgetGreeting, setWidgetGreeting] = useState('Hi! Ask me anything.')
  const [widgetPosition, setWidgetPosition] = useState('right')
  const [widgetSubtitle, setWidgetSubtitle] = useState('Powered by Cane')

  // Deploy
  const [copied, setCopied] = useState(false)

  // Tabs
  const [tab, setTab] = useState('configure')

  const rateLimited = msgCount >= MAX_MESSAGES
  const readyDocs = documents.filter(d => d.status === 'ready')
  const processingDocs = documents.filter(d => d.status === 'processing')

  // Initialize demo session
  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/demo/session`, { method: 'POST' })
        if (!res.ok) throw new Error('Failed to start demo')
        const data = await res.json()
        setSession({ workspace_id: data.workspace_id, api_key: data.api_key })
      } catch (e) {
        console.error('Demo session error:', e)
      } finally {
        setSessionLoading(false)
      }
    }
    init()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history, streamText])

  // Auto-save system prompt (debounced)
  const savePrompt = async (prompt) => {
    if (!session) return
    setPromptSaving(true)
    try {
      await fetch(`${API_BASE}/api/demo/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: session.workspace_id, system_prompt: prompt }),
      })
      setPromptDirty(false)
    } catch (e) {
      console.error('Failed to save prompt:', e)
    } finally {
      setPromptSaving(false)
    }
  }

  const handlePromptChange = (val) => {
    setSystemPrompt(val)
    setPromptDirty(true)
    if (promptTimer.current) clearTimeout(promptTimer.current)
    promptTimer.current = setTimeout(() => savePrompt(val), 1000)
  }

  // File upload
  const handleUpload = async (files) => {
    if (!files?.length || uploading || !session) return
    const valid = Array.from(files).filter(f =>
      f.size <= MAX_SIZE && ALLOWED_EXT.test(f.name)
    ).slice(0, MAX_FILES - documents.length)
    if (valid.length === 0) return

    setUploading(true)
    for (const file of valid) {
      setUploadStatus(`Uploading ${file.name}...`)
      try {
        const form = new FormData()
        form.append('file', file)
        form.append('workspace_id', session.workspace_id)
        const res = await fetch(`${API_BASE}/api/demo/upload`, { method: 'POST', body: form })
        const data = await res.json()
        if (res.ok && data.document_id) {
          setDocuments(prev => [...prev, {
            id: data.document_id, filename: data.filename,
            status: 'processing', chunk_count: 0,
          }])
        }
      } catch (e) {
        console.error('Upload failed:', e)
      }
    }
    setUploading(false)
    setUploadStatus('')
    pollDocuments()
  }

  const pollDocuments = () => {
    if (!session) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/demo/documents/${session.workspace_id}`)
        const data = await res.json()
        setDocuments(data.documents || [])
        const allDone = (data.documents || []).every(d => d.status !== 'processing')
        if (allDone) clearInterval(interval)
      } catch {
        clearInterval(interval)
      }
    }, 2000)
    setTimeout(() => clearInterval(interval), 120000)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragover(false)
    handleUpload(e.dataTransfer.files)
  }

  // Chat / Ask
  const handleAsk = async (e) => {
    e.preventDefault()
    if (!query.trim() || loading || rateLimited || !session) return

    if (readyDocs.length === 0) {
      setError('Upload at least one file before asking questions.')
      return
    }

    // Save prompt if dirty before asking
    if (promptDirty) {
      await savePrompt(systemPrompt)
    }

    const q = query.trim()
    setQuery('')
    setLoading(true)
    setStreamText('')
    setError(null)
    setMsgCount(prev => prev + 1)

    try {
      const res = await fetch(`${API_BASE}/v1/ask`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.api_key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: q,
          workspace_id: session.workspace_id,
          history: history.map(h => [
            { role: 'user', content: h.q },
            { role: 'assistant', content: h.a },
          ]).flat(),
        }),
      })

      const data = await res.json()
      const answer = data.answer || data.error || 'No response.'
      const sources = data.sources || []

      setHistory(prev => [...prev, { q, a: answer, sources }])
    } catch {
      setHistory(prev => [...prev, { q, a: 'Connection error. Please try again.', sources: [] }])
    } finally {
      setLoading(false)
      setStreamText('')
    }
  }

  // Widget embed code
  const getEmbedCode = () => {
    if (!session) return ''
    return `<script
  src="${window.location.origin}/widget.js"
  data-api-key="${session.api_key}"
  data-agent-name="${agentName}"
  data-workspace-id="${session.workspace_id}"
  data-color="${widgetColor}"
  data-greeting="${widgetGreeting}"
  data-position="${widgetPosition}"
  data-subtitle="${widgetSubtitle}"
  data-placeholder="Type a message..."
  data-border-radius="16"
></script>`
  }

  const handleCopyEmbed = () => {
    navigator.clipboard.writeText(getEmbedCode()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (sessionLoading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="fade-in" style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px 60px' }}>
      {/* Nav */}
      <div style={{ paddingTop: 16, marginBottom: 24 }}>
        <Link to="/" style={{
          color: 'var(--text-muted)', fontSize: '0.8125rem',
          display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12, textDecoration: 'none',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back to home
        </Link>

        {/* Agent header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: 'rgba(255,255,255,0.08)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem',
            flexShrink: 0,
          }}>
            {(agentName || 'MY').slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <input
              value={agentName}
              onChange={e => setAgentName(e.target.value)}
              placeholder="Agent name"
              style={{
                fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--font-display)',
                border: 'none', background: 'transparent', color: 'var(--text)',
                width: '100%', padding: 0, outline: 'none',
                borderBottom: '1px solid transparent',
              }}
              onFocus={e => e.target.style.borderBottomColor = 'var(--rule)'}
              onBlur={e => e.target.style.borderBottomColor = 'transparent'}
            />
            <input
              value={agentDesc}
              onChange={e => setAgentDesc(e.target.value)}
              placeholder="Add a description..."
              style={{
                color: 'var(--text-muted)', fontSize: '0.875rem',
                border: 'none', background: 'transparent',
                width: '100%', padding: 0, marginTop: 2, outline: 'none',
                borderBottom: '1px solid transparent',
              }}
              onFocus={e => e.target.style.borderBottomColor = 'var(--rule)'}
              onBlur={e => e.target.style.borderBottomColor = 'transparent'}
            />
          </div>
          <div style={{
            fontSize: '0.65rem', fontWeight: 600, color: 'rgba(255,255,255,0.3)',
            padding: '3px 8px', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 4, whiteSpace: 'nowrap', flexShrink: 0, marginTop: 6,
          }}>
            DEMO
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="workspace-tabs" style={{ marginBottom: 24 }}>
        {[
          { id: 'configure', label: 'Configure' },
          { id: 'knowledge', label: 'Knowledge' },
          { id: 'tools', label: 'Tools' },
          { id: 'behavior', label: 'Behavior' },
          { id: 'deploy', label: 'Deploy' },
        ].map(t => (
          <button
            key={t.id}
            className={`workspace-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ Knowledge Tab ═══ */}
      {tab === 'knowledge' && (<>

      {/* Files card */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>Files</h3>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {documents.length}/{MAX_FILES} files · PDF, DOCX, TXT, CSV · 5MB max
          </span>
        </div>

        {documents.length < MAX_FILES && (
          <div
            style={{
              border: `2px dashed ${dragover ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--radius)',
              padding: 24,
              textAlign: 'center',
              marginBottom: 16,
              cursor: 'pointer',
              transition: 'all 0.15s',
              background: dragover ? 'rgba(255,255,255,0.04)' : 'transparent',
            }}
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragover(true) }}
            onDragLeave={() => setDragover(false)}
            onDrop={handleDrop}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 8 }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <div style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: 4 }}>
              {uploading ? uploadStatus : 'Drop files here or click to upload'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Upload your own documents to ask questions about
            </div>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.csv"
              style={{ display: 'none' }}
              onChange={e => { handleUpload(e.target.files); e.target.value = '' }}
            />
          </div>
        )}

        {/* Processing docs */}
        {processingDocs.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {processingDocs.map(d => (
              <div key={d.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 0', fontSize: '0.8125rem', color: 'var(--text-muted)',
              }}>
                <div className="spinner" style={{ width: 14, height: 14 }} />
                Processing: {d.filename}
              </div>
            ))}
          </div>
        )}

        {/* Ready docs */}
        {readyDocs.length > 0 ? (
          <div>
            {readyDocs.map((d, i) => (
              <div key={d.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 0',
                borderBottom: i < readyDocs.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                  <span style={{ fontSize: '0.875rem' }}>{d.filename}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {d.chunk_count} chunks
                  </span>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            ))}
          </div>
        ) : processingDocs.length === 0 && (
          <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            No files yet. Upload documents to start asking questions.
          </div>
        )}
      </div>

      {/* Google Drive teaser */}
      <div className="card" style={{ marginBottom: 24, opacity: 0.5 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L4.5 7.5V16.5L12 22L19.5 16.5V7.5L12 2Z" />
            </svg>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>Google Drive</div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                Live sync folders from Drive. Auto-updates when files change
              </div>
            </div>
          </div>
          <Link to="/register" className="btn btn-outline" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
            Requires account
          </Link>
        </div>
      </div>

      </>)}

      {/* ═══ Configure Tab ═══ */}
      {tab === 'configure' && (<>

      {/* System Prompt card */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            System Prompt
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {promptSaving && (
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Saving...</span>
            )}
            {!promptSaving && promptDirty && (
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Unsaved</span>
            )}
            {!promptSaving && !promptDirty && systemPrompt && (
              <span style={{ fontSize: '0.72rem', color: 'var(--success)' }}>Saved</span>
            )}
          </div>
        </div>

        <textarea
          value={systemPrompt}
          onChange={e => handlePromptChange(e.target.value)}
          placeholder="Tell the AI how to behave when answering questions about your files. For example: &quot;You are a helpful HR assistant. Answer questions about company policies using only the uploaded documents. Be concise and cite specific sections.&quot;"
          style={{
            width: '100%',
            minHeight: 140,
            padding: 12,
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--rule)',
            background: 'var(--paper)',
            color: 'var(--text)',
            fontFamily: 'var(--font-body)',
            fontSize: '0.8125rem',
            lineHeight: 1.5,
            resize: 'vertical',
            outline: 'none',
          }}
        />
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>
          This prompt tells the AI how to interpret and answer questions about your uploaded files. Optional, but recommended.
        </div>
      </div>

      </>)}

      {/* ═══ Tools Tab ═══ */}
      {tab === 'tools' && (<>

      {/* Webhook Tools teaser */}
      <div className="card" style={{ marginBottom: 24, opacity: 0.5 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>Webhook Tools</div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                Connect HTTP actions. Fire-and-forget notifications or wait-for-response data lookups
              </div>
            </div>
          </div>
          <Link to="/register" className="btn btn-outline" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
            Requires account
          </Link>
        </div>
      </div>

      {/* MCP Connections teaser */}
      <div className="card" style={{ marginBottom: 24, opacity: 0.5 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>MCP Connections</div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                Connect to Slack, Google Calendar, HubSpot, and more via Model Context Protocol
              </div>
            </div>
          </div>
          <Link to="/register" className="btn btn-outline" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
            Requires account
          </Link>
        </div>
      </div>

      {/* Sub-Agent Orchestration teaser */}
      <div className="card" style={{ marginBottom: 24, opacity: 0.5 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>Sub-Agent Orchestration</div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                Link specialist agents as tools. A supervisor delegates questions to the right expert automatically
              </div>
            </div>
          </div>
          <Link to="/register" className="btn btn-outline" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
            Requires account
          </Link>
        </div>
      </div>

      </>)}

      {/* ═══ Behavior Tab ═══ */}
      {tab === 'behavior' && (<>

      {/* Agent Memory teaser */}
      <div className="card" style={{ marginBottom: 24, opacity: 0.5 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a8 8 0 0 0-8 8c0 3.4 2.1 6.3 5 7.4V20h6v-2.6c2.9-1.1 5-4 5-7.4a8 8 0 0 0-8-8z" />
              <line x1="10" y1="22" x2="14" y2="22" />
            </svg>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>Agent Memory</div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                Agents learn from conversations automatically. Persistent facts, preferences, and instructions across sessions
              </div>
            </div>
          </div>
          <Link to="/register" className="btn btn-outline" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
            Requires account
          </Link>
        </div>
      </div>

      {/* Scheduled Runs teaser */}
      <div className="card" style={{ marginBottom: 24, opacity: 0.5 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>Scheduled Runs</div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                Run agents autonomously on intervals or daily triggers. Great for briefings, reports, and automated workflows
              </div>
            </div>
          </div>
          <Link to="/register" className="btn btn-outline" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
            Requires account
          </Link>
        </div>
      </div>

      </>)}

      {/* Ask section (always visible) */}
      {(tab === 'configure' || tab === 'knowledge') && (
      <div style={{ marginBottom: 24 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4, fontFamily: 'var(--font-display)' }}>
            Ask your documents
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            {readyDocs.length > 0
              ? `Searching across ${readyDocs.length} file${readyDocs.length !== 1 ? 's' : ''} · ${readyDocs.reduce((sum, d) => sum + d.chunk_count, 0)} chunks indexed`
              : 'Upload files above to start asking questions'}
          </p>
        </div>

        <div className="search-container">
          <form onSubmit={handleAsk}>
            <div className="search-input-wrapper">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="search-icon">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                className="search-input"
                placeholder={history.length > 0 ? "Ask a follow-up..." : "Ask anything about your files..."}
                value={query}
                onChange={e => setQuery(e.target.value)}
                disabled={readyDocs.length === 0 || rateLimited}
                autoFocus
              />
            </div>
          </form>

          <div className="search-modes">
            {msgCount > 0 && !rateLimited && (
              <span className="search-mode-btn" style={{ cursor: 'default', opacity: 0.5 }}>
                {MAX_MESSAGES - msgCount} questions remaining
              </span>
            )}
          </div>
        </div>

        {error && (
          <div style={{
            marginTop: 12, padding: '10px 14px', borderRadius: 'var(--radius-sm)',
            background: 'rgba(248,113,113,0.08)', color: 'var(--error)',
            fontSize: '0.8125rem',
          }}>
            {error}
          </div>
        )}
      </div>
      )}

      {/* Conversation history (always visible when there are messages) */}
      {(tab === 'configure' || tab === 'knowledge') && history.map((turn, i) => (
        <div key={i} className="ai-summary fade-in" style={{ marginBottom: 16, opacity: i < history.length - 1 ? 0.7 : 1 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {turn.q}
          </div>
          <div className="summary-text"><ReactMarkdown>{turn.a}</ReactMarkdown></div>
          {turn.sources?.length > 0 && (
            <div className="summary-sources">Sources: {turn.sources.join(' · ')}</div>
          )}
        </div>
      ))}

      {/* Loading state */}
      {(tab === 'configure' || tab === 'knowledge') && loading && (
        <div className="ai-summary fade-in">
          <div className="loading-center"><div className="spinner" /></div>
        </div>
      )}

      {(tab === 'configure' || tab === 'knowledge') && <div ref={bottomRef} />}

      {/* ═══ Deploy Tab ═══ */}
      {tab === 'deploy' && (<>

      {/* Widget Customizer */}
      {readyDocs.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Widget Customizer
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text-muted)' }}>Color</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="color"
                  value={widgetColor}
                  onChange={e => setWidgetColor(e.target.value)}
                  style={{ width: 32, height: 32, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'transparent' }}
                />
                <input
                  type="text"
                  value={widgetColor}
                  onChange={e => setWidgetColor(e.target.value)}
                  style={{
                    flex: 1, padding: '6px 10px', background: 'var(--paper)',
                    border: '1px solid var(--rule)', borderRadius: 6, color: 'var(--text)',
                    fontSize: '0.8125rem', fontFamily: "'SF Mono', Consolas, monospace",
                  }}
                />
              </div>
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text-muted)' }}>Position</label>
              <div style={{ display: 'flex', gap: 4 }}>
                {['left', 'right'].map(pos => (
                  <button
                    key={pos}
                    onClick={() => setWidgetPosition(pos)}
                    style={{
                      flex: 1, padding: '6px 12px', borderRadius: 6, fontSize: '0.8125rem',
                      border: '1px solid var(--rule)', cursor: 'pointer',
                      background: widgetPosition === pos ? 'rgba(255,255,255,0.1)' : 'var(--paper)',
                      color: widgetPosition === pos ? '#fff' : 'var(--text-muted)',
                      fontWeight: widgetPosition === pos ? 600 : 400,
                    }}
                  >
                    {pos.charAt(0).toUpperCase() + pos.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text-muted)' }}>Greeting</label>
              <input
                type="text"
                value={widgetGreeting}
                onChange={e => setWidgetGreeting(e.target.value)}
                placeholder="Hi! Ask me anything."
                style={{
                  width: '100%', padding: '6px 10px', background: 'var(--paper)',
                  border: '1px solid var(--rule)', borderRadius: 6, color: 'var(--text)',
                  fontSize: '0.8125rem',
                }}
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text-muted)' }}>Subtitle</label>
              <input
                type="text"
                value={widgetSubtitle}
                onChange={e => setWidgetSubtitle(e.target.value)}
                placeholder="Powered by Cane"
                style={{
                  width: '100%', padding: '6px 10px', background: 'var(--paper)',
                  border: '1px solid var(--rule)', borderRadius: 6, color: 'var(--text)',
                  fontSize: '0.8125rem',
                }}
              />
            </div>
          </div>

          {/* Live preview bubble */}
          <div style={{
            display: 'flex', justifyContent: widgetPosition === 'right' ? 'flex-end' : 'flex-start',
            marginTop: 8,
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: widgetColor, display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={widgetColor === '#ffffff' || widgetColor === '#fff' ? '#000' : '#fff'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* Deploy card */}
      {readyDocs.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              Deploy
            </h3>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Expires in 24 hours
            </div>
          </div>

          <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
            Copy this snippet into any HTML page to embed your agent as a chat widget. It will work for 24 hours with the files you uploaded in this session.
          </div>

          {/* Embed snippet */}
          <div style={{
            position: 'relative',
            background: '#1e1e2e', borderRadius: 'var(--radius-sm)',
            padding: '16px 18px', fontSize: '0.78rem',
            fontFamily: "'SF Mono', Consolas, 'Liberation Mono', monospace",
            color: '#cdd6f4', lineHeight: 1.6, overflow: 'auto',
          }}>
            <button
              onClick={handleCopyEmbed}
              style={{
                position: 'absolute', top: 8, right: 8,
                background: copied ? 'rgba(166,227,161,0.2)' : 'rgba(255,255,255,0.1)',
                border: 'none',
                color: copied ? '#a6e3a1' : '#cdd6f4',
                padding: '4px 10px', borderRadius: 6,
                fontSize: '0.7rem', cursor: 'pointer', fontFamily: 'var(--font-body)',
                transition: 'all 0.15s',
              }}
            >{copied ? 'Copied!' : 'Copy'}</button>
            <span style={{ color: '#89b4fa' }}>&lt;script</span><br />
            {'  '}<span style={{ color: '#a6e3a1' }}>src</span>=<span style={{ color: '#f9e2af' }}>"{window.location.origin}/widget.js"</span><br />
            {'  '}<span style={{ color: '#a6e3a1' }}>data-api-key</span>=<span style={{ color: '#f9e2af' }}>"{session?.api_key}"</span><br />
            {'  '}<span style={{ color: '#a6e3a1' }}>data-agent-name</span>=<span style={{ color: '#f9e2af' }}>"{agentName}"</span><br />
            {'  '}<span style={{ color: '#a6e3a1' }}>data-workspace-id</span>=<span style={{ color: '#f9e2af' }}>"{session?.workspace_id}"</span><br />
            {'  '}<span style={{ color: '#a6e3a1' }}>data-color</span>=<span style={{ color: '#f9e2af' }}>"{widgetColor}"</span><br />
            {'  '}<span style={{ color: '#a6e3a1' }}>data-greeting</span>=<span style={{ color: '#f9e2af' }}>"{widgetGreeting}"</span><br />
            {'  '}<span style={{ color: '#a6e3a1' }}>data-position</span>=<span style={{ color: '#f9e2af' }}>"{widgetPosition}"</span><br />
            {'  '}<span style={{ color: '#a6e3a1' }}>data-subtitle</span>=<span style={{ color: '#f9e2af' }}>"{widgetSubtitle}"</span><br />
            {'  '}<span style={{ color: '#a6e3a1' }}>data-placeholder</span>=<span style={{ color: '#f9e2af' }}>"Type a message..."</span><br />
            {'  '}<span style={{ color: '#a6e3a1' }}>data-border-radius</span>=<span style={{ color: '#f9e2af' }}>"16"</span><br />
            <span style={{ color: '#89b4fa' }}>&gt;&lt;/script&gt;</span>
          </div>

          <div style={{
            marginTop: 16, padding: '12px 16px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--rule)',
            fontSize: '0.78rem', color: 'var(--text-muted)',
            lineHeight: 1.6,
          }}>
            <strong style={{ color: 'var(--text-secondary)' }}>How it works:</strong> Paste this into any HTML file, open it in a browser, and you will see a chat bubble in the bottom-right corner. Your uploaded files and system prompt are baked in. With a full account you get permanent agents, Google Drive sync, tools, eval suites, and more.
          </div>
        </div>
      )}

      {/* Eval Engine teaser */}
      <div className="card" style={{ marginBottom: 24, opacity: 0.5 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>Evaluation Engine</div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                Write test cases, run automated LLM-as-Judge scoring, track accuracy over time
              </div>
            </div>
          </div>
          <Link to="/register" className="btn btn-outline" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
            Requires account
          </Link>
        </div>
      </div>

      {/* Analytics teaser */}
      <div className="card" style={{ marginBottom: 24, opacity: 0.5 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>Analytics Dashboard</div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                Per-agent conversation tracking, response times, tool usage, satisfaction scores
              </div>
            </div>
          </div>
          <Link to="/register" className="btn btn-outline" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
            Requires account
          </Link>
        </div>
      </div>

      </>)}

      {/* Rate limit CTA */}
      {rateLimited && (
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 16 }}>
            Demo limit reached. {MAX_MESSAGES} questions max per session.
          </div>
          <Link to="/register" className="btn btn-primary" style={{ fontSize: '0.9375rem', padding: '10px 24px', justifyContent: 'center' }}>
            Create a free account to continue
          </Link>
          <div style={{ marginTop: 12, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Free plan includes 3 documents, 50 searches/month, and 1 agent.
          </div>
        </div>
      )}

      {/* Bottom CTA */}
      {!rateLimited && (
        <div style={{ textAlign: 'center', padding: '24px 0', borderTop: '1px solid var(--rule)', marginTop: 24 }}>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.7 }}>
            Unlock everything: permanent agents, agent memory, scheduled runs, Google Drive sync,
            webhook tools, sub-agent orchestration, MCP connections, automated eval, analytics, and a public API.
          </div>
          <Link to="/register" className="btn btn-outline" style={{ fontSize: '0.82rem' }}>
            Create a free account
          </Link>
        </div>
      )}
    </div>
  )
}
