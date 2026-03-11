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

      {/* Ask section — mirrors Search.jsx */}
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

      {/* Conversation history */}
      {history.map((turn, i) => (
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
      {loading && (
        <div className="ai-summary fade-in">
          <div className="loading-center"><div className="spinner" /></div>
        </div>
      )}

      <div ref={bottomRef} />

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
    </div>
  )
}
