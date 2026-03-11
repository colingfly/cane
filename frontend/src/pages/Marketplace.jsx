import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Download, FlaskConical, FileText, Star, Zap, Wrench, Globe, ArrowRight, Shield } from 'lucide-react'
import { browseMarketplace } from '../api/client'

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'legal', label: 'Legal' },
  { id: 'healthcare', label: 'Healthcare' },
  { id: 'finance', label: 'Finance' },
  { id: 'engineering', label: 'Engineering' },
  { id: 'education', label: 'Education' },
  { id: 'operations', label: 'Operations' },
  { id: 'general', label: 'General' },
]

const PACK_LABELS = {
  byod: 'Bring Your Data',
  open: 'Open',
  licensed: 'Licensed',
}

function ScoreBadge({ score, size = 'md' }) {
  if (score == null) return null
  const color = score >= 80 ? 'var(--status-pass)' : score >= 60 ? 'var(--status-warn)' : 'var(--status-fail)'
  const lg = size === 'lg'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: lg ? 8 : 6,
      padding: lg ? '6px 14px' : '4px 10px', borderRadius: 8,
      background: 'rgba(255,255,255,0.1)', minWidth: 52, justifyContent: 'center',
    }}>
      <div style={{ width: lg ? 8 : 6, height: lg ? 8 : 6, borderRadius: 99, background: color }} />
      <span style={{
        fontFamily: 'var(--font-display)', fontWeight: 800,
        fontSize: lg ? '1.1rem' : '0.88rem', color: 'var(--cane-100)',
      }}>
        {Math.round(score)}
      </span>
    </div>
  )
}

function FeaturedCard({ listing, onClick }) {
  const [hovered, setHovered] = useState(false)
  const tags = listing.tags || []

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '28px 30px',
        background: 'var(--bg-card)',
        border: `1.5px solid ${hovered ? 'var(--cane-500)' : 'var(--cane-200)'}`,
        borderRadius: 'var(--radius)',
        cursor: 'pointer',
        transition: 'all 0.2s',
        boxShadow: hovered ? '0 4px 20px rgba(0,0,0,0.06)' : '0 1px 4px rgba(0,0,0,0.02)',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div style={{
          width: 52, height: 52, borderRadius: 13,
          background: 'rgba(255,255,255,0.1)', color: 'var(--accent-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-display)', fontWeight: 700,
          fontSize: '1rem', flexShrink: 0,
        }}>
          {(listing.icon || listing.name?.charAt(0) || '?').slice(0, 2).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 700, fontSize: '1.15rem', color: 'var(--text)',
            fontFamily: 'var(--font-display)', letterSpacing: '-0.01em',
            marginBottom: 2,
          }}>
            {listing.name}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            by {listing.publisher_name}
          </div>
        </div>
        <ScoreBadge score={listing.overall_score} size="lg" />
      </div>

      <div style={{
        fontSize: '0.84rem', color: 'var(--text-secondary)',
        lineHeight: 1.65, flex: 1,
      }}>
        {listing.description || 'No description'}
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        fontSize: '0.72rem', color: 'var(--text-muted)',
        fontFamily: 'var(--font-mono)',
      }}>
        {listing.test_case_count > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <FlaskConical size={12} /> {listing.test_case_count} tests
          </span>
        )}
        {listing.document_count > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <FileText size={12} /> {listing.document_count} docs
          </span>
        )}
        {listing.verify_count > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Shield size={12} /> {listing.verify_count} verified
          </span>
        )}
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Download size={12} /> {listing.clone_count || 0} clones
        </span>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        borderTop: '1px solid var(--rule-light)', paddingTop: 14,
      }}>
        <span style={{
          padding: '3px 10px', borderRadius: 5,
          background: listing.pack_type === 'open' ? 'rgba(74,222,128,0.08)' : 'var(--cane-50)',
          color: listing.pack_type === 'open' ? 'var(--status-pass)' : 'var(--text-muted)',
          fontWeight: 600, fontSize: '0.65rem', textTransform: 'uppercase',
          letterSpacing: '0.04em', fontFamily: 'var(--font-mono)',
        }}>
          {PACK_LABELS[listing.pack_type] || listing.pack_type}
        </span>
        <span style={{
          padding: '3px 10px', borderRadius: 5,
          background: 'var(--accent-muted)', color: 'var(--accent)',
          fontWeight: 600, fontSize: '0.65rem', textTransform: 'uppercase',
          letterSpacing: '0.04em', fontFamily: 'var(--font-mono)',
        }}>
          {listing.category}
        </span>
        {tags.slice(0, 3).map(t => (
          <span key={t} style={{
            padding: '3px 8px', borderRadius: 5,
            background: 'var(--cane-100)', color: 'var(--cane-600)',
            fontSize: '0.62rem', fontWeight: 600, fontFamily: 'var(--font-mono)',
          }}>{t}</span>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{
          display: 'flex', alignItems: 'center', gap: 4,
          fontSize: '0.78rem', fontWeight: 600,
          color: hovered ? 'var(--cane-700)' : 'var(--text-muted)',
          transition: 'color 0.15s',
        }}>
          View <ArrowRight size={14} />
        </span>
      </div>
    </div>
  )
}

function ListingCard({ listing, onClick }) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '20px 22px',
        background: 'var(--bg-card)',
        border: `1px solid ${hovered ? 'var(--cane-500)' : 'var(--rule)'}`,
        borderRadius: 'var(--radius)',
        cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        boxShadow: hovered ? '0 2px 12px rgba(255,255,255,0.04)' : 'none',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 10,
          background: 'rgba(255,255,255,0.1)', color: 'var(--cane-400)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-display)', fontWeight: 700,
          fontSize: '0.85rem', flexShrink: 0,
        }}>
          {(listing.icon || listing.name?.charAt(0) || '?').slice(0, 2).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)',
            fontFamily: 'var(--font-display)', letterSpacing: '-0.01em',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {listing.name}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
            by {listing.publisher_name}
          </div>
        </div>
        <ScoreBadge score={listing.overall_score} />
      </div>

      <div style={{
        fontSize: '0.8rem', color: 'var(--text-secondary)',
        lineHeight: 1.6, flex: 1,
        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}>
        {listing.description || 'No description'}
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        fontSize: '0.7rem', color: 'var(--text-muted)',
        fontFamily: 'var(--font-mono)',
        borderTop: '1px solid var(--rule-light)',
        paddingTop: 10,
      }}>
        <span style={{
          padding: '2px 8px', borderRadius: 4,
          background: 'var(--accent-muted)', color: 'var(--accent)',
          fontWeight: 600, fontSize: '0.6rem', textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}>
          {listing.category}
        </span>
        <span style={{
          padding: '2px 8px', borderRadius: 4,
          background: listing.pack_type === 'open' ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.04)',
          color: listing.pack_type === 'open' ? 'var(--status-pass)' : 'var(--text-muted)',
          fontWeight: 600, fontSize: '0.6rem', textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}>
          {PACK_LABELS[listing.pack_type] || listing.pack_type}
        </span>
        <div style={{ flex: 1 }} />
        {listing.tool_count > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <Wrench size={10} /> {listing.tool_count}
          </span>
        )}
        {listing.test_case_count > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <FlaskConical size={10} /> {listing.test_case_count}
          </span>
        )}
        {listing.document_count > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <FileText size={10} /> {listing.document_count}
          </span>
        )}
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <Download size={10} /> {listing.clone_count || 0}
        </span>
      </div>
    </div>
  )
}

export default function Marketplace() {
  const navigate = useNavigate()
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState('score')

  const load = async () => {
    setLoading(true)
    try {
      const res = await browseMarketplace({ category, search, sort })
      setListings(res.listings || [])
    } catch (e) {
      console.error('Failed to load marketplace:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [category, sort])

  const handleSearch = (e) => {
    e.preventDefault()
    load()
  }

  return (
    <div className="fade-in" style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{
          fontSize: '1.6rem', fontWeight: 700, marginBottom: 6,
          fontFamily: 'var(--font-display)',
        }}>
          Agent Marketplace
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: 1.5 }}>
          Clone verified AI agents. Run evals to independently verify performance before you deploy.
        </p>
      </div>

      {/* Search + filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <form onSubmit={handleSearch} style={{
          display: 'flex', flex: 1, minWidth: 240,
          border: '1px solid var(--rule)', borderRadius: 'var(--radius-sm)',
          overflow: 'hidden', background: 'var(--bg-card)',
        }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search agents..."
            style={{
              flex: 1, padding: '10px 14px', border: 'none',
              fontSize: '0.84rem', outline: 'none',
              fontFamily: 'var(--font-body)', background: 'transparent',
            }}
          />
          <button type="submit" style={{
            padding: '10px 14px', background: 'none', border: 'none',
            cursor: 'pointer', color: 'var(--text-muted)',
          }}>
            <Search size={15} />
          </button>
        </form>

        <select
          value={sort}
          onChange={e => setSort(e.target.value)}
          style={{
            padding: '10px 14px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--rule)', fontSize: '0.8rem',
            fontFamily: 'var(--font-body)', background: 'var(--bg-card)',
            color: 'var(--text)', cursor: 'pointer', outline: 'none',
          }}
        >
          <option value="score">Highest Score</option>
          <option value="clones">Most Cloned</option>
          <option value="newest">Newest</option>
        </select>
      </div>

      {/* Category tabs */}
      <div style={{
        display: 'flex', gap: 0,
        borderBottom: '1px solid var(--rule)',
        marginBottom: 22, overflowX: 'auto',
      }}>
        {CATEGORIES.map(c => {
          const active = category === c.id
          return (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              style={{
                padding: '8px 14px',
                fontSize: '0.75rem',
                fontWeight: active ? 700 : 500,
                color: active ? 'var(--text)' : 'var(--text-muted)',
                background: 'none', border: 'none',
                borderBottom: active ? '2px solid var(--cane-900)' : '2px solid transparent',
                marginBottom: -1, cursor: 'pointer',
                fontFamily: 'var(--font-body)',
                whiteSpace: 'nowrap',
              }}
            >
              {c.label}
            </button>
          )
        })}
      </div>

      {/* Listings grid */}
      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : listings.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '56px 20px',
          color: 'var(--text-muted)', fontSize: '0.88rem',
        }}>
          <div style={{
            width: 60, height: 60, borderRadius: 15,
            background: 'var(--paper)', border: '1px solid var(--rule)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <Star size={26} style={{ color: 'var(--text-faint)' }} />
          </div>
          <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)', fontSize: '1rem' }}>
            No agents found
          </div>
          <div style={{ maxWidth: 320, margin: '0 auto' }}>
            {search || category !== 'all'
              ? 'Try a different search or category.'
              : 'Publish your first agent from the Agent Builder to see it here.'}
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 14,
        }}>
          {listings.map(l => (
            <ListingCard
              key={l.id}
              listing={l}
              onClick={() => navigate(`/marketplace/${l.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}