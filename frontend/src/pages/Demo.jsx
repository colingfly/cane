import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'

const API_BASE = window.location.origin
const MAX_MESSAGES = 10

export default function Demo() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Upload your documents and ask questions — everything stays isolated to this session." },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [msgCount, setMsgCount] = useState(0)
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [session, setSession] = useState(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const fileInputRef = useRef(null)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const MAX_FILES = 3
  const MAX_SIZE = 5 * 1024 * 1024

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Initialize demo session on mount
  useEffect(() => {
    const initSession = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/demo/session`, { method: 'POST' })
        if (!res.ok) throw new Error('Failed to start demo session')
        const data = await res.json()
        setSession({ workspace_id: data.workspace_id, api_key: data.api_key })
      } catch (e) {
        console.error('Demo session error:', e)
        setMessages([{ role: 'assistant', content: 'Failed to initialize demo session. Please refresh.' }])
      } finally {
        setSessionLoading(false)
      }
    }
    initSession()
  }, [])

  useEffect(() => { if (!sessionLoading) inputRef.current?.focus() }, [sessionLoading])

  const rateLimited = msgCount >= MAX_MESSAGES

  const handleFiles = async (files) => {
    if (uploading || !session) return
    const allowed = ['application/pdf', 'text/plain', 'text/csv',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    const valid = Array.from(files).filter(f => {
      if (uploadedFiles.length + 1 > MAX_FILES) return false
      if (f.size > MAX_SIZE) return false
      if (!allowed.includes(f.type) && !f.name.match(/\.(pdf|txt|csv|docx)$/i)) return false
      return true
    }).slice(0, MAX_FILES - uploadedFiles.length)
    if (valid.length === 0) return

    setUploading(true)
    const newFiles = []
    for (const f of valid) {
      try {
        const form = new FormData()
        form.append('file', f)
        form.append('workspace_id', session.workspace_id)
        const res = await fetch(`${API_BASE}/api/demo/upload`, {
          method: 'POST',
          body: form,
        })
        const data = await res.json()
        newFiles.push({
          name: f.name,
          status: res.ok ? 'processing' : 'error',
          docId: data.document_id,
        })
      } catch {
        newFiles.push({ name: f.name, status: 'error' })
      }
    }
    setUploadedFiles(prev => [...prev, ...newFiles])
    setUploading(false)
    pollDocuments()
  }

  const pollDocuments = () => {
    if (!session) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/demo/documents/${session.workspace_id}`)
        const data = await res.json()
        const allDone = data.documents.every(d => d.status !== 'processing')
        setUploadedFiles(prev => prev.map(f => {
          const match = data.documents.find(d => d.filename === f.name)
          if (match) return { ...f, status: match.status, chunks: match.chunk_count }
          return f
        }))
        if (allDone) clearInterval(interval)
      } catch {
        clearInterval(interval)
      }
    }, 2000)
    setTimeout(() => clearInterval(interval), 60000)
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  const send = async (text) => {
    if (rateLimited || !session) return
    const q = (text || input).trim()
    if (!q || loading) return
    setInput('')

    const readyDocs = uploadedFiles.filter(f => f.status === 'ready')
    if (readyDocs.length === 0 && uploadedFiles.length === 0) {
      setMessages(prev => [...prev,
        { role: 'user', content: q },
        { role: 'assistant', content: 'Upload some documents first so I have something to search through. Drag and drop files onto the Upload Files tile above.' },
      ])
      return
    }

    const history = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }))
    setMessages(prev => [...prev, { role: 'user', content: q }])
    setMsgCount(prev => prev + 1)
    setLoading(true)

    try {
      const headers = { 'Authorization': `Bearer ${session.api_key}`, 'Content-Type': 'application/json' }

      const askRes = await fetch(`${API_BASE}/v1/ask`, {
        method: 'POST', headers,
        body: JSON.stringify({ query: q, workspace_id: session.workspace_id, history }),
      })

      const askData = await askRes.json()

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: askData.answer || askData.error || 'No response.',
        sources: askData.sources || [],
      }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error. Try again.' }])
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  if (sessionLoading) {
    return (
      <div className="demo-page">
        <style>{demoStyles}</style>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '0.84rem' }}>
          Starting demo session...
        </div>
      </div>
    )
  }

  return (
    <div className="demo-page">
      <style>{demoStyles}</style>

      <div className="demo-nav">
        <Link to="/" className="demo-back">Cane</Link>
        <span className="demo-nav-label">Live demo</span>
      </div>

      <div className="demo-body">
        <div className="demo-main">
          {/* Connector tiles */}
          <div className="demo-tiles">
            <div
              className={`demo-tile demo-tile-upload${dragOver ? ' drag-over' : ''}`}
              onClick={() => uploadedFiles.length < MAX_FILES && fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              style={{ cursor: uploadedFiles.length >= MAX_FILES ? 'default' : 'pointer' }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt,.csv"
                multiple
                style={{ display: 'none' }}
                onChange={e => { handleFiles(e.target.files); e.target.value = '' }}
              />
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
              <div className="demo-tile-text">
                <span className="demo-tile-title">Upload Files</span>
                <span className="demo-tile-sub">
                  {uploading ? 'Uploading...' : uploadedFiles.length > 0
                    ? uploadedFiles.map(f => {
                        const icon = f.status === 'ready' ? '\u2713' : f.status === 'processing' ? '\u23F3' : f.status === 'error' ? '\u2717' : ''
                        return `${icon} ${f.name}`
                      }).join(', ')
                    : 'PDF, DOCX, CSV, TXT — drag & drop or click'}
                </span>
              </div>
              {uploadedFiles.length > 0 ? (
                <span className="demo-tile-badge" style={{
                  color: uploadedFiles.some(f => f.status === 'processing') ? 'rgba(251,191,36,0.7)' : 'rgba(74,222,128,0.7)',
                  borderColor: uploadedFiles.some(f => f.status === 'processing') ? 'rgba(251,191,36,0.15)' : 'rgba(74,222,128,0.15)',
                }}>
                  {uploadedFiles.filter(f => f.status === 'ready').length}/{uploadedFiles.length} ready
                </span>
              ) : (
                <span className="demo-tile-badge">{uploading ? '...' : `Up to ${MAX_FILES}`}</span>
              )}
            </div>

            <Link to="/register" className="demo-tile">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L4.5 7.5V16.5L12 22L19.5 16.5V7.5L12 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M12 8V16M8 12H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <div className="demo-tile-text">
                <span className="demo-tile-title">Google Drive</span>
                <span className="demo-tile-sub">Live sync folders</span>
              </div>
              <span className="demo-tile-badge">Requires account</span>
            </Link>
          </div>

          {/* Chat */}
          <div className="demo-chat">
            <div className="demo-chat-inner">
              {messages.map((m, i) => (
                <div key={i} className={`demo-msg demo-msg-${m.role}`}>
                  <div className="demo-msg-content">
                    <div className="demo-msg-text">{m.content}</div>
                    {m.sources?.length > 0 && (
                      <div className="demo-sources">
                        {m.sources.map((s, j) => <span key={j}>{s}</span>)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="demo-msg demo-msg-assistant">
                  <div className="demo-msg-content">
                    <div className="demo-typing"><span /><span /><span /></div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </div>

          {/* Input */}
          <div className="demo-input-area">
            {rateLimited ? (
              <div className="demo-rate-limit">
                <span>Demo limit reached</span>
                <Link to="/register" className="demo-cta-btn">Create a free account to continue</Link>
              </div>
            ) : (
              <div className="demo-input-wrap">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Ask anything about your documents..."
                  disabled={loading}
                />
                <button onClick={() => send()} disabled={loading || !input.trim()} className="demo-send">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            )}
            <div className="demo-footer">
              {!rateLimited && msgCount > 0 && (
                <span style={{ marginRight: 8 }}>{MAX_MESSAGES - msgCount} remaining</span>
              )}
              Powered by <Link to="/">Cane</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const demoStyles = `
.demo-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #000;
  color: rgba(255,255,255,0.5);
  font-family: 'DM Sans', -apple-system, sans-serif;
}

.demo-nav {
  padding: 0 32px;
  height: 48px;
  display: flex;
  align-items: center;
  gap: 16px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
}

.demo-back {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 700;
  font-size: 0.92rem;
  color: #fff;
  text-decoration: none;
}

.demo-nav-label {
  font-size: 0.75rem;
  color: rgba(255,255,255,0.2);
}

.demo-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  justify-content: center;
}

.demo-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  max-width: 720px;
  min-width: 0;
}

/* Connector tiles */
.demo-tiles {
  padding: 20px 24px 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  flex-shrink: 0;
}

.demo-tile {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 8px;
  text-decoration: none;
  color: rgba(255,255,255,0.4);
  transition: all 0.15s;
}

.demo-tile:hover {
  border-color: rgba(255,255,255,0.12);
  color: rgba(255,255,255,0.6);
}

.demo-tile-upload.drag-over {
  border-color: rgba(255,255,255,0.3);
  background: rgba(255,255,255,0.04);
}

.demo-tile svg { flex-shrink: 0; opacity: 0.4; }

.demo-tile-text { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
.demo-tile-title { font-size: 0.78rem; font-weight: 600; color: rgba(255,255,255,0.6); }
.demo-tile-sub { font-size: 0.65rem; color: rgba(255,255,255,0.2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.demo-tile-badge {
  font-size: 0.55rem; color: rgba(255,255,255,0.2);
  padding: 2px 6px; border: 1px solid rgba(255,255,255,0.06);
  border-radius: 3px; white-space: nowrap;
}

/* Chat */
.demo-chat {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

.demo-chat-inner { }

.demo-msg { margin-bottom: 20px; }
.demo-msg-user { display: flex; justify-content: flex-end; }

.demo-msg-user .demo-msg-content {
  background: rgba(255,255,255,0.06);
  border-radius: 14px 14px 4px 14px;
  padding: 10px 14px;
  max-width: 80%;
  color: rgba(255,255,255,0.8);
}

.demo-msg-assistant .demo-msg-content {
  max-width: 85%;
  padding: 4px 0;
  color: rgba(255,255,255,0.55);
}

.demo-msg-text {
  font-size: 0.84rem;
  line-height: 1.7;
  white-space: pre-wrap;
}

.demo-sources {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}

.demo-sources span {
  font-size: 0.62rem;
  color: rgba(255,255,255,0.2);
  padding: 1px 6px;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 3px;
}

/* Input */
.demo-input-area {
  padding: 12px 24px 16px;
  border-top: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
}

.demo-input-wrap {
  display: flex;
  gap: 8px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  padding: 4px 4px 4px 14px;
  align-items: center;
}

.demo-input-wrap input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: rgba(255,255,255,0.8);
  font-size: 0.84rem;
  font-family: 'DM Sans', sans-serif;
  padding: 8px 0;
}

.demo-input-wrap input::placeholder { color: rgba(255,255,255,0.2); }

.demo-send {
  width: 32px; height: 32px; border-radius: 6px;
  border: none; cursor: pointer;
  background: #fff; color: #000;
  display: flex; align-items: center; justify-content: center;
  transition: opacity 0.15s; flex-shrink: 0;
}

.demo-send:hover { opacity: 0.8; }
.demo-send:disabled { opacity: 0.3; cursor: default; }

.demo-rate-limit {
  text-align: center;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
}

.demo-rate-limit span { font-size: 0.78rem; color: rgba(255,255,255,0.25); }

.demo-cta-btn {
  display: inline-block; padding: 8px 20px;
  background: #fff; color: #000; border-radius: 6px;
  font-size: 0.8rem; font-weight: 600; text-decoration: none;
  transition: opacity 0.15s;
}

.demo-cta-btn:hover { opacity: 0.85; color: #000; }

.demo-footer {
  text-align: center; margin-top: 8px;
  font-size: 0.65rem; color: rgba(255,255,255,0.12);
}

.demo-footer a { color: rgba(255,255,255,0.25); text-decoration: none; }

/* Typing indicator */
.demo-typing { display: flex; gap: 4px; padding: 8px 0; }
.demo-typing span {
  width: 5px; height: 5px; border-radius: 50%;
  background: rgba(255,255,255,0.2);
  animation: demoPulse 1.2s infinite;
}
.demo-typing span:nth-child(2) { animation-delay: 0.15s; }
.demo-typing span:nth-child(3) { animation-delay: 0.3s; }
@keyframes demoPulse {
  0%, 60%, 100% { opacity: 0.3; }
  30% { opacity: 0.8; }
}

/* Responsive */
@media (max-width: 768px) {
  .demo-tiles { grid-template-columns: 1fr; }
  .demo-nav { padding: 0 16px; }
  .demo-chat { padding: 16px; }
  .demo-input-area { padding: 12px 16px 16px; }
}
`
