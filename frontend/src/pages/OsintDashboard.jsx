import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getOsintBriefings, getOsintStats, generateOsintBriefing, getOsintBriefing } from '../api/client'
import { Shield, AlertTriangle, Info, ChevronDown, ChevronUp, RefreshCw, ArrowLeft, ExternalLink, Tag } from 'lucide-react'

const SEVERITY_CONFIG = {
  critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', label: 'CRITICAL' },
  high: { color: '#f97316', bg: 'rgba(249,115,22,0.12)', label: 'HIGH' },
  medium: { color: '#eab308', bg: 'rgba(234,179,8,0.12)', label: 'MEDIUM' },
  low: { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', label: 'LOW' },
  info: { color: '#6b7280', bg: 'rgba(107,114,128,0.12)', label: 'INFO' },
}

const TYPE_LABELS = { news: 'News', threat: 'Threat Intel', social: 'Social', combined: 'Combined' }

export default function OsintDashboard() {
  const { agentId } = useParams()
  const [briefings, setBriefings] = useState([])
  const [stats, setStats] = useState(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const [expandedData, setExpandedData] = useState({})
  const [filterSeverity, setFilterSeverity] = useState(null)
  const [filterType, setFilterType] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const params = {}
      if (filterSeverity) params.severity = filterSeverity
      if (filterType) params.briefing_type = filterType
      const qs = new URLSearchParams(params).toString()
      const [bData, sData] = await Promise.all([
        getOsintBriefings(agentId, qs),
        getOsintStats(agentId),
      ])
      setBriefings(bData.briefings || [])
      setTotal(bData.total || 0)
      setStats(sData)
    } catch (e) {
      console.error('Failed to load OSINT data:', e)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [agentId, filterSeverity, filterType])

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      await generateOsintBriefing(agentId)
      setTimeout(load, 3000)
    } catch (e) {
      console.error('Failed to trigger:', e)
    }
    setGenerating(false)
  }

  const toggleExpand = async (id) => {
    if (expanded === id) {
      setExpanded(null)
      return
    }
    setExpanded(id)
    if (!expandedData[id]) {
      try {
        const full = await getOsintBriefing(agentId, id)
        setExpandedData(prev => ({ ...prev, [id]: full }))
      } catch (e) {
        console.error('Failed to load briefing detail:', e)
      }
    }
  }

  const formatTime = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    const now = new Date()
    const diff = now - d
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to={`/agents/${agentId}`} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>Intelligence Feed</h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
              {total} briefing{total !== 1 ? 's' : ''} total
            </p>
          </div>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 8,
            background: 'var(--accent)', color: '#fff', border: 'none',
            fontSize: '0.8125rem', fontWeight: 500, cursor: 'pointer',
            opacity: generating ? 0.6 : 1,
          }}
        >
          <RefreshCw size={14} className={generating ? 'spin' : ''} />
          {generating ? 'Running...' : 'Run Now'}
        </button>
      </div>

      {/* Stats bar */}
      {stats && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: 12, marginBottom: 20,
        }}>
          {Object.entries(SEVERITY_CONFIG).map(([sev, cfg]) => (
            <div key={sev} style={{
              padding: '10px 14px', borderRadius: 8,
              background: 'var(--bg-secondary)', border: '1px solid var(--border)',
              cursor: 'pointer',
              outline: filterSeverity === sev ? `2px solid ${cfg.color}` : 'none',
            }} onClick={() => setFilterSeverity(filterSeverity === sev ? null : sev)}>
              <div style={{ fontSize: '0.6875rem', color: cfg.color, fontWeight: 600, textTransform: 'uppercase' }}>{cfg.label}</div>
              <div style={{ fontSize: '1.125rem', fontWeight: 600, marginTop: 2 }}>{stats.severity_counts?.[sev] || 0}</div>
            </div>
          ))}
        </div>
      )}

      {/* Type filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {Object.entries(TYPE_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilterType(filterType === key ? null : key)}
            style={{
              padding: '4px 12px', borderRadius: 20,
              border: '1px solid var(--border)',
              background: filterType === key ? 'var(--accent)' : 'var(--bg-secondary)',
              color: filterType === key ? '#fff' : 'var(--text-muted)',
              fontSize: '0.75rem', cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
        {(filterSeverity || filterType) && (
          <button
            onClick={() => { setFilterSeverity(null); setFilterType(null) }}
            style={{
              padding: '4px 12px', borderRadius: 20,
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--text-muted)', fontSize: '0.75rem', cursor: 'pointer',
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Briefings timeline */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
          <div className="spinner" style={{ margin: '0 auto 12px' }} />
          Loading briefings...
        </div>
      ) : briefings.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 48,
          background: 'var(--bg-secondary)', borderRadius: 12,
          border: '1px solid var(--border)',
        }}>
          <Shield size={32} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            No briefings yet. Click "Run Now" to generate your first intelligence briefing.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {briefings.map(b => {
            const sev = SEVERITY_CONFIG[b.severity] || SEVERITY_CONFIG.info
            const isExpanded = expanded === b.id
            const fullData = expandedData[b.id]

            return (
              <div
                key={b.id}
                style={{
                  background: 'var(--bg-secondary)',
                  border: `1px solid ${isExpanded ? sev.color + '40' : 'var(--border)'}`,
                  borderRadius: 12,
                  overflow: 'hidden',
                  borderLeft: `3px solid ${sev.color}`,
                }}
              >
                {/* Card header */}
                <div
                  onClick={() => toggleExpand(b.id)}
                  style={{
                    padding: '14px 16px',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 4,
                        background: sev.bg, color: sev.color,
                        fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase',
                      }}>
                        {sev.label}
                      </span>
                      <span style={{
                        padding: '2px 8px', borderRadius: 4,
                        background: 'rgba(99,102,241,0.1)', color: '#6366f1',
                        fontSize: '0.625rem', fontWeight: 600,
                      }}>
                        {TYPE_LABELS[b.briefing_type] || b.briefing_type}
                      </span>
                      {b.alert_sent && (
                        <span style={{
                          padding: '2px 8px', borderRadius: 4,
                          background: 'rgba(16,185,129,0.1)', color: '#10b981',
                          fontSize: '0.625rem', fontWeight: 600,
                        }}>
                          Alert sent
                        </span>
                      )}
                      <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                        {formatTime(b.created_at)}
                      </span>
                    </div>
                    <h3 style={{ fontSize: '0.875rem', fontWeight: 600, margin: 0, lineHeight: 1.4 }}>
                      {b.title}
                    </h3>
                    {!isExpanded && b.content && (
                      <p style={{
                        fontSize: '0.75rem', color: 'var(--text-muted)',
                        margin: '6px 0 0', lineHeight: 1.5,
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      }}>
                        {b.content.replace(/[#*]/g, '').substring(0, 200)}
                      </p>
                    )}
                    {!isExpanded && b.entities && b.entities.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                        {b.entities.slice(0, 5).map((e, i) => (
                          <span key={i} style={{
                            padding: '1px 6px', borderRadius: 3,
                            background: 'var(--bg)', border: '1px solid var(--border)',
                            fontSize: '0.625rem', color: 'var(--text-muted)', fontFamily: 'monospace',
                          }}>
                            {e}
                          </span>
                        ))}
                        {b.entities.length > 5 && (
                          <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)' }}>
                            +{b.entities.length - 5} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: 4 }}>
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div style={{
                    padding: '0 16px 16px',
                    borderTop: '1px solid var(--border)',
                    paddingTop: 16,
                  }}>
                    {fullData ? (
                      <>
                        {/* Full content as formatted text */}
                        <div style={{
                          fontSize: '0.8125rem', lineHeight: 1.7,
                          whiteSpace: 'pre-wrap', color: 'var(--text)',
                        }}>
                          {fullData.content}
                        </div>

                        {/* Entities */}
                        {fullData.entities && fullData.entities.length > 0 && (
                          <div style={{ marginTop: 16 }}>
                            <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Tag size={12} /> Entities
                            </div>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {fullData.entities.map((e, i) => (
                                <span key={i} style={{
                                  padding: '2px 8px', borderRadius: 4,
                                  background: 'var(--bg)', border: '1px solid var(--border)',
                                  fontSize: '0.6875rem', fontFamily: 'monospace',
                                }}>
                                  {e}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Sources */}
                        {fullData.sources && fullData.sources.length > 0 && (
                          <div style={{ marginTop: 16 }}>
                            <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <ExternalLink size={12} /> Sources
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {fullData.sources.slice(0, 10).map((s, i) => (
                                <a
                                  key={i}
                                  href={s}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    fontSize: '0.6875rem', color: 'var(--accent)',
                                    textDecoration: 'none', overflow: 'hidden',
                                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  }}
                                >
                                  {s}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
                        <div className="spinner" style={{ margin: '0 auto' }} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
