import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'

const API_KEY = 'cane_d26764c44d6887c7b0820033388c6810b6c9fed3bdf91989'
const WORKSPACE_ID = '826e009f-ddb9-42a0-9c4e-89e88f6ed8e2'
const API_BASE = window.location.origin

const SUGGESTIONS = [
  'What is Cane and what can it do?',
  'How does the evaluation engine work?',
  'What integrations does Cane support?',
  'Tell me about the agent marketplace',
]

export default function Demo() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hey — I'm an AI agent built on Cane. I know everything about the platform. Ask me anything, or try one of the suggestions below." },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

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
    <div style={styles.page}>
      <style>{demoStyles}</style>

      {/* Top bar */}
      <div style={styles.topBar}>
        <Link to="/" style={styles.brand}>
          <span style={styles.brandText}>CANE</span>
          <span style={styles.brandSub}>live demo</span>
        </Link>
        <div style={styles.topRight}>
          <span style={styles.statusDot} />
          <span style={styles.statusText}>Agent online</span>
          <Link to="/" style={styles.backLink}>Back to home</Link>
        </div>
      </div>

      {/* Chat area */}
      <div style={styles.chatArea}>
        <div style={styles.chatInner}>
          {messages.map((m, i) => (
            <div key={i} style={{ ...styles.msgRow, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              {m.role === 'assistant' && <div style={styles.avatar}>C</div>}
              <div style={m.role === 'user' ? styles.userBubble : styles.agentBubble}>
                <div style={styles.msgText}>{m.content}</div>
                {m.sources?.length > 0 && (
                  <div style={styles.sources}>
                    {m.sources.map((s, j) => <span key={j} style={styles.sourceTag}>{s}</span>)}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div style={styles.msgRow}>
              <div style={styles.avatar}>C</div>
              <div style={styles.agentBubble}>
                <div className="demo-typing">
                  <span /><span /><span />
                </div>
              </div>
            </div>
          )}

          {/* Suggestions — only show at start */}
          {messages.length === 1 && !loading && (
            <div style={styles.suggestions}>
              {SUGGESTIONS.map((s, i) => (
                <button key={i} onClick={() => send(s)} style={styles.suggestionBtn}>{s}</button>
              ))}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div style={styles.inputArea}>
        <div style={styles.inputWrap}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask anything about Cane..."
            style={styles.input}
            disabled={loading}
          />
          <button onClick={() => send()} disabled={loading || !input.trim()} style={styles.sendBtn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
        <div style={styles.inputFooter}>
          Built with <Link to="/" style={styles.footerLink}>Cane</Link> — AI agent platform by Colin
        </div>
      </div>
    </div>
  )
}

const styles = {
  page: {
    height: '100vh', display: 'flex', flexDirection: 'column',
    background: '#06080f', color: '#c8d6e5', fontFamily: "'DM Sans', sans-serif",
  },
  topBar: {
    padding: '14px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    borderBottom: '1px solid rgba(0, 180, 255, 0.08)', background: 'rgba(6, 8, 15, 0.95)',
    backdropFilter: 'blur(20px)', flexShrink: 0,
  },
  brand: { display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' },
  brandText: {
    fontFamily: "'Space Grotesk', 'Outfit', sans-serif", fontWeight: 800, fontSize: '1.3rem',
    color: '#00d4ff', letterSpacing: '0.08em',
  },
  brandSub: {
    fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
    color: '#3d6b8a', padding: '3px 8px', borderRadius: 4,
    border: '1px solid rgba(0, 180, 255, 0.15)', background: 'rgba(0, 180, 255, 0.05)',
  },
  topRight: { display: 'flex', alignItems: 'center', gap: 14 },
  statusDot: {
    width: 7, height: 7, borderRadius: '50%', background: '#00ff88',
    boxShadow: '0 0 8px rgba(0, 255, 136, 0.4)',
  },
  statusText: { fontSize: '0.75rem', color: '#4a7a6a', fontWeight: 500 },
  backLink: {
    fontSize: '0.78rem', color: '#3d6b8a', textDecoration: 'none', fontWeight: 500,
    padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(0, 180, 255, 0.12)',
    transition: 'all 0.2s',
  },

  chatArea: {
    flex: 1, overflowY: 'auto', padding: '32px 24px',
  },
  chatInner: { maxWidth: 720, margin: '0 auto' },

  msgRow: { display: 'flex', gap: 12, marginBottom: 20, alignItems: 'flex-start' },
  avatar: {
    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
    background: 'rgba(0, 180, 255, 0.1)', color: '#00d4ff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: '0.75rem',
    border: '1px solid rgba(0, 180, 255, 0.15)',
  },
  userBubble: {
    maxWidth: '75%', padding: '12px 16px', borderRadius: '14px 14px 4px 14px',
    background: 'rgba(0, 140, 255, 0.12)', border: '1px solid rgba(0, 180, 255, 0.15)',
    color: '#d0e4f5',
  },
  agentBubble: {
    maxWidth: '75%', padding: '12px 16px', borderRadius: '14px 14px 14px 4px',
    background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)',
    color: '#c8d6e5',
  },
  msgText: { fontSize: '0.88rem', lineHeight: 1.7, whiteSpace: 'pre-wrap' },
  sources: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  sourceTag: {
    padding: '2px 8px', borderRadius: 4, fontSize: '0.65rem',
    fontFamily: "'JetBrains Mono', monospace",
    background: 'rgba(0, 180, 255, 0.08)', color: '#00b4ff',
    border: '1px solid rgba(0, 180, 255, 0.12)',
  },

  suggestions: {
    display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, marginLeft: 44,
  },
  suggestionBtn: {
    padding: '8px 14px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 500,
    background: 'rgba(0, 180, 255, 0.06)', border: '1px solid rgba(0, 180, 255, 0.12)',
    color: '#6ab4d4', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
    transition: 'all 0.2s',
  },

  inputArea: {
    padding: '16px 24px 20px', borderTop: '1px solid rgba(0, 180, 255, 0.08)',
    background: 'rgba(6, 8, 15, 0.95)', backdropFilter: 'blur(20px)', flexShrink: 0,
  },
  inputWrap: {
    maxWidth: 720, margin: '0 auto', display: 'flex', gap: 10,
    background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(0, 180, 255, 0.12)',
    borderRadius: 12, padding: '4px 4px 4px 16px', alignItems: 'center',
  },
  input: {
    flex: 1, background: 'none', border: 'none', outline: 'none',
    color: '#d0e4f5', fontSize: '0.9rem', fontFamily: "'DM Sans', sans-serif",
    padding: '10px 0',
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 8, border: 'none', cursor: 'pointer',
    background: '#00b4ff', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.2s', flexShrink: 0,
  },
  inputFooter: {
    textAlign: 'center', marginTop: 10, fontSize: '0.7rem', color: '#2a3f52',
  },
  footerLink: { color: '#00b4ff', textDecoration: 'none', fontWeight: 600 },
}

const demoStyles = `
  .demo-typing { display: flex; gap: 5px; padding: 4px 0; }
  .demo-typing span {
    width: 7px; height: 7px; border-radius: 50%;
    background: rgba(0, 180, 255, 0.4);
    animation: demoBounce 1.2s infinite;
  }
  .demo-typing span:nth-child(2) { animation-delay: 0.15s; }
  .demo-typing span:nth-child(3) { animation-delay: 0.3s; }
  @keyframes demoBounce {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
    30% { transform: translateY(-6px); opacity: 1; }
  }
  .demo-typing span:hover, button:hover { opacity: 0.85; }
`
