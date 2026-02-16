import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { search, ask } from '../api/client'
import { Search as SearchIcon, Sparkles, FileText, Clock } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

export default function SearchPage() {
  const { workspaces } = useAuth()
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState('text')
  const [workspaceId, setWorkspaceId] = useState('')
  const [results, setResults] = useState(null)
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)

  async function runSearch(searchMode) {
    if (!query.trim()) return

    setLoading(true)
    setResults(null)
    setSummary(null)

    try {
      if (searchMode === 'ask') {
        const data = await ask(query, 5, workspaceId)
        if (data.status === 'ok') {
          setSummary(data)
        } else {
          setSummary({ error: data.error || 'No results found' })
        }
      } else {
        const data = await search(query, searchMode, 10, workspaceId)
        setResults(data.results || [])
      }
    } catch (err) {
      console.error('Search failed:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleSearch(e) {
    e.preventDefault()
    runSearch(mode)
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
              placeholder="Search your documents..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
            />
          </div>
        </form>

        <div className="search-modes">
          {[
            { id: 'text', label: 'Search' },
            { id: 'fusion', label: 'Deep Search' },
            { id: 'ask', label: 'Ask AI' },
          ].map(m => (
            <button
              key={m.id}
              className={`search-mode-btn ${mode === m.id ? 'active' : ''}`}
              onClick={() => { setMode(m.id); if (query.trim()) runSearch(m.id) }}
            >
              {m.id === 'ask' && <Sparkles size={12} style={{ marginRight: 4 }} />}
              {m.label}
            </button>
          ))}

          {workspaces.length > 1 && (
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
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="loading-center">
          <div className="spinner" />
        </div>
      )}

      {/* AI Summary */}
      {summary && !loading && (
        <div className="ai-summary fade-in">
          {summary.error ? (
            <p style={{ color: 'var(--text-muted)' }}>{summary.error}</p>
          ) : (
            <>
              <h4><Sparkles size={14} /> AI Answer</h4>
              <div className="summary-text"><ReactMarkdown>{summary.summary}</ReactMarkdown></div>
              {summary.sources?.length > 0 && (
                <div className="summary-sources">
                  Sources: {summary.sources.join(' · ')}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Results */}
      {results && !loading && (
        <div className="results-list">
          {results.length === 0 ? (
            <div className="empty-state">
              <h3>No results found</h3>
              <p>Try different keywords or broaden your search</p>
            </div>
          ) : (
            results.map((r, i) => (
              <div key={i} className="result-card">
                <div className="result-source">
                  <span className="result-rank">{r.rank}</span>
                  <FileText size={14} style={{ color: 'var(--accent)' }} />
                  <span className="filename">{r.source_file}</span>
                  {r.page > 0 && <span className="location">p.{r.page}</span>}
                  {r.start_sec > 0 && (
                    <span className="location">
                      <Clock size={10} /> {fmtTime(r.start_sec)}
                    </span>
                  )}
                </div>
                <div className="result-text">{r.text}</div>
                <div className="result-score">
                  {(r.score * 100).toFixed(0)}% match
                </div>
              </div>
            ))
          )}
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
