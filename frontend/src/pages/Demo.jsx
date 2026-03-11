import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'

const API_KEY = 'cane_d26764c44d6887c7b0820033388c6810b6c9fed3bdf91989'
const WORKSPACE_ID = '826e009f-ddb9-42a0-9c4e-89e88f6ed8e2'
const API_BASE = window.location.origin

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
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => { inputRef.current?.focus() }, [])

  const send = async (text) => {
    const q = (text || input).trim()
    if (!q || loading) return
    setInput('')

    const history = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }))
    setMessages(prev => [...prev, { role: 'user', content: q }])
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
        <div className="demo-footer">
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

.demo-chat {
  flex: 1;
  overflow-y: auto;
  padding: 40px 24px;
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
`
