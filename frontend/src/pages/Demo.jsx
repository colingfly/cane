import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'

const API_KEY = 'cane_d26764c44d6887c7b0820033388c6810b6c9fed3bdf91989'
const WORKSPACE_ID = '826e009f-ddb9-42a0-9c4e-89e88f6ed8e2'
const API_BASE = window.location.origin
const MAX_MESSAGES = 10

const SUGGESTIONS = [
  'What is Cane?',
  'How does the RAG pipeline work?',
  'What integrations are supported?',
  'How does evaluation scoring work?',
]

export default function Demo() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "This is a live AI agent running on Cane. It has access to all platform documentation. Ask it anything." },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [msgCount, setMsgCount] = useState(0)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => { inputRef.current?.focus() }, [])

  const rateLimited = msgCount >= MAX_MESSAGES

  const send = async (text) => {
    if (rateLimited) return
    const q = (text || input).trim()
    if (!q || loading) return
    setInput('')

    const history = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }))
    setMessages(prev => [...prev, { role: 'user', content: q }])
    setMsgCount(prev => prev + 1)
    setLoading(true)

    try {
      const res = await fetch(`${API_BASE}/v1/ask`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, workspace_id: WORKSPACE_ID, history }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.answer || data.error || 'No response.',
        sources: data.sources || [],
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

  return (
    <div className="demo-page">
      <style>{demoStyles}</style>

      <div className="demo-nav">
        <Link to="/" className="demo-back">Cane</Link>
        <span className="demo-nav-label">Live demo</span>
      </div>

      {/* Connector tiles */}
      <div className="demo-tiles">
        <div className="demo-tiles-inner">
          <Link to="/register" className="demo-tile">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
            <div className="demo-tile-text">
              <span className="demo-tile-title">Upload Files</span>
              <span className="demo-tile-sub">PDF, DOCX, CSV, TXT</span>
            </div>
            <span className="demo-tile-badge">Create account</span>
          </Link>

          <Link to="/register" className="demo-tile">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
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
      </div>

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

          {messages.length === 1 && !loading && (
            <div className="demo-suggestions">
              {SUGGESTIONS.map((s, i) => (
                <button key={i} onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      <div className="demo-input-area">
        {rateLimited ? (
          <div className="demo-rate-limit">
            <span>You've reached the demo limit.</span>
            <Link to="/register" className="demo-cta-btn">Create a free account to continue</Link>
          </div>
        ) : (
          <div className="demo-input-wrap">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask anything..."
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
            <span style={{ marginRight: 8 }}>{MAX_MESSAGES - msgCount} messages remaining</span>
          )}
          Powered by <Link to="/">Cane</Link>
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

/* Connector tiles */
.demo-tiles {
  padding: 24px 24px 0;
  flex-shrink: 0;
}

.demo-tiles-inner {
  max-width: 640px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.demo-tile {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  text-decoration: none;
  color: rgba(255,255,255,0.4);
  transition: all 0.15s;
  position: relative;
}

.demo-tile:hover {
  border-color: rgba(255,255,255,0.15);
  color: rgba(255,255,255,0.6);
}

.demo-tile svg {
  flex-shrink: 0;
  opacity: 0.5;
}

.demo-tile-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.demo-tile-title {
  font-size: 0.84rem;
  font-weight: 600;
  color: rgba(255,255,255,0.7);
}

.demo-tile-sub {
  font-size: 0.7rem;
  color: rgba(255,255,255,0.25);
}

.demo-tile-badge {
  font-size: 0.6rem;
  color: rgba(255,255,255,0.2);
  padding: 2px 8px;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 4px;
  white-space: nowrap;
}

.demo-chat {
  flex: 1;
  overflow-y: auto;
  padding: 24px 24px;
}

.demo-chat-inner { max-width: 640px; margin: 0 auto; }

.demo-msg { margin-bottom: 24px; }

.demo-msg-user { display: flex; justify-content: flex-end; }

.demo-msg-user .demo-msg-content {
  background: rgba(255,255,255,0.06);
  border-radius: 16px 16px 4px 16px;
  padding: 12px 16px;
  max-width: 80%;
  color: rgba(255,255,255,0.8);
}

.demo-msg-assistant .demo-msg-content {
  max-width: 80%;
  padding: 4px 0;
  color: rgba(255,255,255,0.55);
}

.demo-msg-text {
  font-size: 0.88rem;
  line-height: 1.7;
  white-space: pre-wrap;
}

.demo-sources {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.demo-sources span {
  font-size: 0.68rem;
  color: rgba(255,255,255,0.25);
  padding: 2px 8px;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 4px;
}

.demo-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.demo-suggestions button {
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 0.8rem;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.4);
  cursor: pointer;
  font-family: 'DM Sans', sans-serif;
  transition: all 0.15s;
}

.demo-suggestions button:hover {
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.6);
}

.demo-input-area {
  padding: 16px 24px 20px;
  border-top: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
}

.demo-input-wrap {
  max-width: 640px;
  margin: 0 auto;
  display: flex;
  gap: 8px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  padding: 4px 4px 4px 16px;
  align-items: center;
}

.demo-input-wrap input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: rgba(255,255,255,0.8);
  font-size: 0.88rem;
  font-family: 'DM Sans', sans-serif;
  padding: 10px 0;
}

.demo-input-wrap input::placeholder { color: rgba(255,255,255,0.2); }

.demo-send {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  background: #fff;
  color: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.15s;
  flex-shrink: 0;
}

.demo-send:hover { opacity: 0.8; }
.demo-send:disabled { opacity: 0.3; cursor: default; }

.demo-rate-limit {
  max-width: 640px;
  margin: 0 auto;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.demo-rate-limit span {
  font-size: 0.8rem;
  color: rgba(255,255,255,0.3);
}

.demo-cta-btn {
  display: inline-block;
  padding: 10px 24px;
  background: #fff;
  color: #000;
  border-radius: 8px;
  font-size: 0.84rem;
  font-weight: 600;
  text-decoration: none;
  transition: opacity 0.15s;
}

.demo-cta-btn:hover { opacity: 0.85; color: #000; }

.demo-footer {
  text-align: center;
  margin-top: 10px;
  font-size: 0.7rem;
  color: rgba(255,255,255,0.15);
}

.demo-footer a {
  color: rgba(255,255,255,0.3);
  text-decoration: none;
}

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

@media (max-width: 520px) {
  .demo-tiles-inner { grid-template-columns: 1fr; }
}
`
