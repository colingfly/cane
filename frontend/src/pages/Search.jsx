import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { ask, getToken } from '../api/client'
import { Search as SearchIcon, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

export default function SearchPage() {
  const { workspaces } = useAuth()
  const [query, setQuery] = useState('')
  const [workspaceId, setWorkspaceId] = useState('')
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [lightbox, setLightbox] = useState(null)

  const authImg = (url) => url ? `${url}${url.includes('?') ? '&' : '?'}token=${getToken()}` : ''

  async function handleSearch(e) {
    e.preventDefault()
    if (!query.trim()) return

    setLoading(true)
    setSummary(null)

    try {
      const data = await ask(query, 5, workspaceId)
      if (data.status === 'ok') {
        setSummary(data)
      } else {
        setSummary({ error: data.error || 'No results found' })
      }
    } catch (err) {
      console.error('Search failed:', err)
      setSummary({ error: 'Something went wrong. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fade-in">
      <div style={{ textAlign: 'center', paddingTop: 40, marginBottom: 40 }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4, fontFamily: 'var(--font-display)' }}>
          What are you looking for?
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          Search across all your documents
        </p>
      </div>

      <div className="search-container">
        <form onSubmit={handleSearch}>
          <div className="search-input-wrapper">
            <SearchIcon size={20} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Ask anything about your documents..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
            />
          </div>
        </form>

        {workspaces.length > 1 && (
          <div className="search-modes">
            <select
              className="search-mode-btn"
              value={workspaceId}
              onChange={e => setWorkspaceId(e.target.value)}
              style={{ cursor: 'pointer' }}
            >
              <option value="">All workspaces</option>
              {workspaces.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="loading-center">
          <div className="spinner" />
        </div>
      )}

      {/* Answer */}
      {summary && !loading && (
        <div className="ai-summary fade-in">
          {summary.error ? (
            <p style={{ color: 'var(--text-muted)' }}>{summary.error}</p>
          ) : (
            <>
              <div className="summary-text"><ReactMarkdown>{summary.summary}</ReactMarkdown></div>

              {summary.images?.length > 0 && (
                <div className="summary-images">
                  <div className="image-grid">
                    {summary.images.map((img, i) => (
                      <div
                        key={i}
                        className="image-result-thumb"
                        onClick={() => setLightbox(img)}
                      >
                        <img
                          src={authImg(img.url)}
                          alt={`${img.source_file} ${img.page ? `p.${img.page}` : fmtTime(img.timestamp_sec)}`}
                          loading="lazy"
                        />
                        <span className="image-label">
                          {img.source_file}
                          {img.page > 0 ? ` · p.${img.page}` : img.timestamp_sec > 0 ? ` · ${fmtTime(img.timestamp_sec)}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {summary.sources?.length > 0 && (
                <div className="summary-sources">
                  Sources: {summary.sources.join(' · ')}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="lightbox-overlay" onClick={() => setLightbox(null)}>
          <div className="lightbox-content" onClick={e => e.stopPropagation()}>
            <button className="lightbox-close" onClick={() => setLightbox(null)}>
              <X size={20} />
            </button>
            <img
              src={authImg(lightbox.url)}
              alt={lightbox.source_file}
            />
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