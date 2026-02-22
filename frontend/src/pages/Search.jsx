import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useSearchParams } from 'react-router-dom'
import { askStream, getToken, resetSession, getAgents } from '../api/client'
import { Search as SearchIcon, X, RotateCcw } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

export default function SearchPage() {
  const { workspaces } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [workspaceId, setWorkspaceId] = useState(searchParams.get('workspace') || '')
  const [streamText, setStreamText] = useState('')
  const [meta, setMeta] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lightbox, setLightbox] = useState(null)
  const [history, setHistory] = useState([])
  const [agents, setAgents] = useState([])

  // Load agents for dropdown
  useEffect(() => {
    getAgents().then(res => setAgents(res.agents || [])).catch(() => {})
  }, [])

  // Handle workspace param from agent "Ask this agent" button
  useEffect(() => {
    const wsParam = searchParams.get('workspace')
    if (wsParam) {
      setWorkspaceId(wsParam)
      setSearchParams({}, { replace: true })
    }
  }, [])

  // Regular workspaces (non-agent)
  const regularWorkspaces = workspaces.filter(w => !w.agent_type)

  const authImg = (url) => url ? `${url}${url.includes('?') ? '&' : '?'}token=${getToken()}` : ''

  async function handleSearch(e) {
    e.preventDefault()
    if (!query.trim() || loading) return

    const currentQuery = query.trim()
    setLoading(true)
    setStreamText('')
    setMeta(null)
    setError(null)

    let fullText = ''
    let metaRef = null

    await askStream(
      currentQuery, 5, workspaceId,
      (text) => { fullText += text; setStreamText(fullText) },
      (metaData) => {
        if (metaData.type === 'tool_status') {
          setStreamText(prev => prev || '⚡ ' + metaData.message + '\n\n')
        } else {
          metaRef = metaData; setMeta(metaData)
        }
      },
      () => {
        setLoading(false)
        if (fullText) {
          setHistory(prev => [...prev, { q: currentQuery, a: fullText, meta: metaRef }])
          setStreamText('')
          setMeta(null)
        }
        setQuery('')
      },
      (errMsg) => { setError(errMsg); setLoading(false) }
    )
  }

  function handleNewChat() {
    resetSession()
    setHistory([])
    setStreamText('')
    setMeta(null)
    setError(null)
    setQuery('')
  }

  const showDropdown = regularWorkspaces.length > 1 || agents.length > 0

  return (
    <div className="fade-in">
      <div style={{ textAlign: 'center', paddingTop: 40, marginBottom: 40 }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4, fontFamily: 'var(--font-display)' }}>
          What are you looking for?
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          Search across all your files
        </p>
      </div>

      <div className="search-container">
        <form onSubmit={handleSearch}>
          <div className="search-input-wrapper">
            <SearchIcon size={20} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder={history.length > 0 ? "Ask a follow-up..." : "Ask anything about your files..."}
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
            />
          </div>
        </form>

        <div className="search-modes">
          {showDropdown && (
            <select
              className="search-mode-btn"
              value={workspaceId}
              onChange={e => setWorkspaceId(e.target.value)}
              style={{ cursor: 'pointer' }}
            >
              <option value="">All workspaces</option>
              {regularWorkspaces.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
              {agents.length > 0 && (
                <optgroup label="Agents">
                  {agents.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          )}
          {history.length > 0 && (
            <button
              className="search-mode-btn"
              onClick={handleNewChat}
              title="Start new conversation"
              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <RotateCcw size={14} /> New chat
            </button>
          )}
        </div>
      </div>

      {/* Conversation history */}
      {history.map((turn, i) => (
        <div key={i} className="ai-summary fade-in" style={{ marginBottom: 16, opacity: 0.85 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {turn.q}
          </div>
          <div className="summary-text"><ReactMarkdown>{turn.a}</ReactMarkdown></div>
          {turn.meta?.images?.length > 0 && (
            <div className="summary-images">
              <div className="image-grid">
                {turn.meta.images.map((img, j) => (
                  <div key={j} className="image-result-thumb" onClick={() => setLightbox(img)}>
                    <img src={authImg(img.url)} alt={img.source_file} loading="lazy" />
                    <span className="image-label">
                      {img.source_file}
                      {img.page > 0 ? ` · p.${img.page}` : img.timestamp_sec > 0 ? ` · ${fmtTime(img.timestamp_sec)}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {turn.meta?.sources?.length > 0 && (
            <div className="summary-sources">Sources: {turn.meta.sources.join(' · ')}</div>
          )}
        </div>
      ))}

      {/* Current streaming answer */}
      {(streamText || loading) && (
        <div className="ai-summary fade-in">
          {error ? (
            <p style={{ color: 'var(--text-muted)' }}>{error}</p>
          ) : (
            <>
              {loading && !streamText && (
                <div className="loading-center"><div className="spinner" /></div>
              )}
              {streamText && (
                <div className="summary-text">
                  <ReactMarkdown>{streamText}</ReactMarkdown>
                  {loading && <span className="typing-cursor">▊</span>}
                </div>
              )}
              {meta?.images?.length > 0 && (
                <div className="summary-images">
                  <div className="image-grid">
                    {meta.images.map((img, i) => (
                      <div key={i} className="image-result-thumb" onClick={() => setLightbox(img)}>
                        <img src={authImg(img.url)} alt={img.source_file} loading="lazy" />
                        <span className="image-label">
                          {img.source_file}
                          {img.page > 0 ? ` · p.${img.page}` : img.timestamp_sec > 0 ? ` · ${fmtTime(img.timestamp_sec)}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {meta?.sources?.length > 0 && !loading && (
                <div className="summary-sources">Sources: {meta.sources.join(' · ')}</div>
              )}
            </>
          )}
        </div>
      )}

      {error && !streamText && !loading && (
        <div className="ai-summary fade-in">
          <p style={{ color: 'var(--text-muted)' }}>{error}</p>
        </div>
      )}

      {lightbox && (
        <div className="lightbox-overlay" onClick={() => setLightbox(null)}>
          <div className="lightbox-content" onClick={e => e.stopPropagation()}>
            <button className="lightbox-close" onClick={() => setLightbox(null)}><X size={20} /></button>
            <img src={authImg(lightbox.url)} alt={lightbox.source_file} />
            <div className="lightbox-caption">
              {lightbox.source_file}
              {lightbox.page > 0 ? ` · Page ${lightbox.page}` : lightbox.timestamp_sec > 0 ? ` · ${fmtTime(lightbox.timestamp_sec)}` : ''}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}