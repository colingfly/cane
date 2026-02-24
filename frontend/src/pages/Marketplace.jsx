import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Download, FlaskConical, FileText, Star, Filter, Zap, Wrench, Globe } from 'lucide-react'
import { browseMarketplace, getPacks, clonePack } from '../api/client'

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
  byod: 'BYOD',
  open: 'Open',
  licensed: 'Licensed',
}

function ScoreBadge({ score }) {
  if (score == null) return null
  const color = score >= 80 ? 'var(--status-pass)' : score >= 60 ? 'var(--status-warn)' : 'var(--status-fail)'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', borderRadius: 6,
      background: 'var(--cane-900)', minWidth: 52, justifyContent: 'center',
    }}>
      <div style={{
        width: 6, height: 6, borderRadius: 99,
        background: color,
      }} />
      <span style={{
        fontFamily: 'var(--font-display)', fontWeight: 800,
        fontSize: '0.88rem', color: 'var(--cane-100)',
      }}>
        {Math.round(score)}
      </span>
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
        background: 'white',
        border: `1px solid ${hovered ? 'var(--cane-500)' : 'var(--rule)'}`,
        borderRadius: 'var(--radius)',
        cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        boxShadow: hovered ? '0 2px 12px rgba(0,0,0,0.04)' : 'none',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}
    >
      {/* Top row: icon + name + score */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: 'var(--cane-900)', color: 'var(--cane-400)',
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
          <div style={{
            fontSize: '0.75rem', color: 'var(--text-muted)',
            marginTop: 2,
          }}>
            by {listing.publisher_name}
          </div>
        </div>
        <ScoreBadge score={listing.overall_score} />
      </div>

      {/* Description */}
      <div style={{
        fontSize: '0.8rem', color: 'var(--text-secondary)',
        lineHeight: 1.6, flex: 1,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}>
        {listing.description || 'No description'}
      </div>

      {/* Meta row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        fontSize: '0.7rem', color: 'var(--text-muted)',
        fontFamily: 'var(--font-mono)',
        borderTop: '1px solid var(--rule-light)',
        paddingTop: 10,
      }}>
        {/* Category */}
        <span style={{
          padding: '2px 8px', borderRadius: 4,
          background: 'var(--accent-muted)',
          color: 'var(--accent)', fontWeight: 600,
          fontSize: '0.6rem', textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}>
          {listing.category}
        </span>

        {/* Pack type */}
        <span style={{
          padding: '2px 8px', borderRadius: 4,
          background: listing.pack_type === 'open' ? 'rgba(59,120,66,0.08)' : 'rgba(0,0,0,0.04)',
          color: listing.pack_type === 'open' ? 'var(--status-pass)' : 'var(--text-muted)',
          fontWeight: 600, fontSize: '0.6rem', textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}>
          {PACK_LABELS[listing.pack_type] || listing.pack_type}
        </span>

        <div style={{ flex: 1 }} />

        {/* Stats */}
        {listing.test_case_count > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <FlaskConical size={10} /> {listing.test_case_count} tests
          </span>
        )}
        {listing.document_count > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <FileText size={10} /> {listing.document_count} docs
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
  const [packs, setPacks] = useState([])
  const [cloningPack, setCloningPack] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const [mktRes, packRes] = await Promise.all([
        browseMarketplace({ category, search, sort }),
        packs.length ? Promise.resolve(null) : getPacks().catch(() => null),
      ])
      setListings(mktRes.listings || [])
      if (packRes) setPacks(packRes.packs || [])
    } catch (e) {
      console.error('Failed to load marketplace:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleClonePack = async (packId) => {
    setCloningPack(packId)
    try {
      const res = await clonePack(packId)
      navigate(`/agents/${res.agent_id}`)
    } catch (err) {
      alert(err.message || 'Failed to clone pack')
    } finally {
      setCloningPack(null)
    }
  }

  useEffect(() => { load() }, [category, sort])

  const handleSearch = (e) => {
    e.preventDefault()
    load()
  }

  return (
    <div className="fade-in" style={{ maxWidth: 880, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{
          fontSize: '1.5rem', fontWeight: 700, marginBottom: 4,
          fontFamily: 'var(--font-display)',
        }}>
          Marketplace
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          Discover, clone, and verify community-built AI agents.
        </p>
      </div>

      {/* Featured Packs */}
      {packs.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{
            fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 12,
          }}>
            Ready-to-Deploy Packs
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
            {packs.map(p => (
              <div key={p.id} style={{
                padding: '20px 22px', background: 'white',
                border: '1px solid var(--cane-200)', borderRadius: 'var(--radius)',
                display: 'flex', flexDirection: 'column', gap: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 11,
                    background: 'var(--cane-900)', color: 'var(--accent-light)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--font-display)', fontWeight: 700,
                    fontSize: '0.9rem', flexShrink: 0,
                  }}>
                    {(p.icon || p.name?.charAt(0) || '?').slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontWeight: 700, fontSize: '1rem', fontFamily: 'var(--font-display)',
                      letterSpacing: '-0.01em', marginBottom: 4,
                    }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      {p.description}
                    </div>
                  </div>
                </div>

                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                  fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Wrench size={10} /> {p.tool_count} tools
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <FlaskConical size={10} /> {p.test_case_count} tests
                  </span>
                  {p.suggested_mcp?.length > 0 && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Globe size={10} /> {p.suggested_mcp.length} integrations
                    </span>
                  )}
                  <div style={{ flex: 1 }} />
                  <div style={{ display: 'flex', gap: 4 }}>
                    {(p.tags || []).slice(0, 3).map(t => (
                      <span key={t} style={{
                        padding: '2px 7px', borderRadius: 4,
                        background: 'var(--cane-100)', color: 'var(--cane-600)',
                        fontSize: '0.6rem', fontWeight: 600,
                      }}>{t}</span>
                    ))}
                  </div>
                </div>

                <button
                  className="btn btn-primary"
                  onClick={() => handleClonePack(p.id)}
                  disabled={cloningPack === p.id}
                  style={{ width: '100%', justifyContent: 'center', fontSize: '0.84rem', marginTop: 2 }}
                >
                  <Zap size={14} /> {cloningPack === p.id ? 'Setting up...' : 'Use This Pack'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search + filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <form onSubmit={handleSearch} style={{
          display: 'flex', flex: 1, minWidth: 240,
          border: '1px solid var(--rule)', borderRadius: 'var(--radius-sm)',
          overflow: 'hidden', background: 'white',
        }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search agents..."
            style={{
              flex: 1, padding: '9px 14px', border: 'none',
              fontSize: '0.84rem', outline: 'none',
              fontFamily: 'var(--font-body)', background: 'transparent',
            }}
          />
          <button type="submit" style={{
            padding: '9px 14px', background: 'none', border: 'none',
            cursor: 'pointer', color: 'var(--text-muted)',
          }}>
            <Search size={15} />
          </button>
        </form>

        <select
          value={sort}
          onChange={e => setSort(e.target.value)}
          style={{
            padding: '9px 14px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--rule)', fontSize: '0.8rem',
            fontFamily: 'var(--font-body)', background: 'white',
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
          textAlign: 'center', padding: '48px 20px',
          color: 'var(--text-muted)', fontSize: '0.88rem',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: 'var(--paper)', border: '1px solid var(--rule)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <Star size={24} style={{ color: 'var(--text-faint)' }} />
          </div>
          <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
            No agents published yet
          </div>
          <div>
            Be the first — publish an agent from Agent Builder.
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
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
