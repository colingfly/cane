import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Download, FlaskConical, FileText, Copy, Check, Shield, RefreshCw, Bot, Trash2, Wrench, Zap } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getMarketplaceListing, cloneFromMarketplace, delistFromMarketplace } from '../api/client'

function ScoreRing({ score, size = 80 }) {
  const color = score >= 80 ? 'var(--status-pass)' : score >= 60 ? 'var(--status-warn)' : 'var(--status-fail)'
  const radius = (size - 8) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={radius}
          fill="none" stroke="var(--rule)" strokeWidth={4} />
        <circle cx={size/2} cy={size/2} r={radius}
          fill="none" stroke={color} strokeWidth={4}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-display)', fontWeight: 800,
        fontSize: size * 0.3, color: 'var(--text)',
      }}>
        {Math.round(score)}
      </div>
    </div>
  )
}

function CriteriaBar({ label, score, weight }) {
  const color = score >= 80 ? 'var(--status-pass)' : score >= 60 ? 'var(--status-warn)' : 'var(--status-fail)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <span style={{
        width: 100, fontSize: '0.75rem', color: 'var(--text-secondary)',
        fontFamily: 'var(--font-mono)',
      }}>
        {label}
      </span>
      <div style={{
        flex: 1, height: 6, borderRadius: 3,
        background: 'var(--rule-light)', overflow: 'hidden',
      }}>
        <div style={{
          width: `${score}%`, height: '100%', borderRadius: 3,
          background: color, transition: 'width 0.5s ease',
        }} />
      </div>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.78rem',
        fontWeight: 700, color, minWidth: 28, textAlign: 'right',
      }}>
        {Math.round(score)}
      </span>
      <span style={{
        fontSize: '0.6rem', color: 'var(--text-faint)',
        fontFamily: 'var(--font-mono)', minWidth: 28,
      }}>
        {weight}%
      </span>
    </div>
  )
}

export default function MarketplaceDetail() {
  const { listingId } = useParams()
  const navigate = useNavigate()
  const { user, tenant } = useAuth()
  const [listing, setListing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [cloning, setCloning] = useState(false)
  const [cloned, setCloned] = useState(null)
  const [promptExpanded, setPromptExpanded] = useState(false)
  const [delisting, setDelisting] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const res = await getMarketplaceListing(listingId)
        setListing(res)
      } catch (e) {
        console.error('Failed to load listing:', e)
      } finally {
        setLoading(false)
      }
    })()
  }, [listingId])

  const handleClone = async () => {
    if (!user) {
      navigate('/login')
      return
    }
    setCloning(true)
    try {
      const res = await cloneFromMarketplace(listingId)
      setCloned(res)
    } catch (e) {
      alert(e.message || 'Failed to clone')
    } finally {
      setCloning(false)
    }
  }

  const handleDelist = async () => {
    if (!confirm('Remove this agent from the marketplace? This cannot be undone.')) return
    setDelisting(true)
    try {
      await delistFromMarketplace(listingId)
      navigate('/marketplace')
    } catch (e) {
      alert(e.message || 'Failed to delist')
    } finally {
      setDelisting(false)
    }
  }

  if (loading) return <div className="loading-center"><div className="spinner" /></div>
  if (!listing) return <div className="fade-in"><p>Listing not found.</p></div>

  const evalData = listing.eval_snapshot || {}
  const criteria = evalData.criteria_breakdown || []
  const testPreviews = evalData.test_cases_preview || []
  const avgTime = evalData.response_time_avg_ms

  const PACK_DESCRIPTIONS = {
    byod: 'Bring Your Own Docs — clone the blueprint and eval spec, upload your own files.',
    open: 'Open Pack — documents included. Clone and start using immediately.',
    licensed: 'Licensed Pack — curated documents included with the agent.',
  }

  return (
    <div className="fade-in" style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* Back */}
      <Link to="/marketplace" style={{
        color: 'var(--text-muted)', fontSize: '0.8125rem',
        display: 'flex', alignItems: 'center', gap: 4,
        marginBottom: 16, textDecoration: 'none',
      }}>
        <ArrowLeft size={14} /> Back to Marketplace
      </Link>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 24,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          background: 'var(--cane-900)', color: 'var(--cane-400)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-display)', fontWeight: 700,
          fontSize: '1.1rem', flexShrink: 0,
        }}>
          {(listing.icon || listing.name?.charAt(0) || '?').slice(0, 2).toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{
            fontSize: '1.4rem', fontWeight: 700,
            fontFamily: 'var(--font-display)', margin: 0,
            letterSpacing: '-0.02em',
          }}>
            {listing.name}
          </h2>
          <div style={{
            fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span>by {listing.publisher_name}</span>
            <span style={{
              padding: '2px 8px', borderRadius: 4,
              background: 'var(--accent-muted)', color: 'var(--accent)',
              fontSize: '0.6rem', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.04em',
            }}>
              {listing.category}
            </span>
          </div>
          {listing.description && (
            <p style={{
              fontSize: '0.84rem', color: 'var(--text-secondary)',
              lineHeight: 1.7, marginTop: 10, maxWidth: 560,
            }}>
              {listing.description}
            </p>
          )}
        </div>

        {/* Clone button */}
        <div style={{ flexShrink: 0 }}>
          {cloned ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                padding: '10px 20px', borderRadius: 'var(--radius-sm)',
                background: 'rgba(59,120,66,0.08)', color: 'var(--status-pass)',
                fontWeight: 700, fontSize: '0.85rem',
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
              }}>
                <Check size={16} /> Cloned!
              </div>
              <button
                className="btn btn-outline"
                style={{ fontSize: '0.75rem', width: '100%' }}
                onClick={() => navigate(`/agents/${cloned.agent_id}`)}
              >
                Open Agent →
              </button>
              {cloned.environment_id && (
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: '0.72rem', width: '100%', marginTop: 4 }}
                  onClick={() => navigate(`/environments/${cloned.environment_id}`)}
                >
                  <RefreshCw size={12} /> Re-Verify
                </button>
              )}
            </div>
          ) : (
            <button
              className="btn btn-primary"
              onClick={handleClone}
              disabled={cloning}
              style={{ padding: '10px 24px', fontSize: '0.88rem' }}
            >
              <Download size={16} />
              {cloning ? 'Cloning...' : 'Clone Agent'}
            </button>
          )}
          {tenant && listing.publisher_tenant_id === tenant.id && (
            <button
              className="btn btn-ghost"
              onClick={handleDelist}
              disabled={delisting}
              style={{
                fontSize: '0.75rem', marginTop: 8, width: '100%',
                color: 'var(--status-fail)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: 6,
              }}
            >
              <Trash2 size={13} />
              {delisting ? 'Removing...' : 'Remove from Marketplace'}
            </button>
          )}
        </div>
      </div>

      {/* ─── Performance Card ─── */}
      {listing.overall_score != null && (
        <div style={{
          border: '1px solid var(--rule)', borderRadius: 'var(--radius)',
          overflow: 'hidden', marginBottom: 22, background: 'white',
        }}>
          <div style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--rule)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Shield size={15} style={{ color: 'var(--accent)' }} />
            <span style={{
              fontWeight: 700, fontSize: '0.82rem', color: 'var(--text)',
              fontFamily: 'var(--font-display)',
            }}>
              Performance Card
            </span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
              Verified by eval · {evalData.total_cases || 0} test cases
            </span>
          </div>

          <div style={{ display: 'flex', padding: '24px' }}>
            {/* Score ring */}
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              paddingRight: 28, borderRight: '1px solid var(--rule)',
              marginRight: 28, minWidth: 110,
            }}>
              <ScoreRing score={listing.overall_score} />
              <div style={{
                fontSize: '0.65rem', color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.06em',
                fontWeight: 700, marginTop: 8,
              }}>
                Overall
              </div>
              {/* Pass/Warn/Fail counts */}
              <div style={{
                display: 'flex', gap: 12, marginTop: 10,
                fontSize: '0.7rem', fontFamily: 'var(--font-mono)',
              }}>
                <span style={{ color: 'var(--status-pass)' }}>
                  {evalData.passed || 0}P
                </span>
                <span style={{ color: 'var(--status-warn)' }}>
                  {evalData.warned || 0}W
                </span>
                <span style={{ color: 'var(--status-fail)' }}>
                  {evalData.failed || 0}F
                </span>
              </div>
            </div>

            {/* Criteria breakdown */}
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: '0.65rem', color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.06em',
                fontWeight: 700, marginBottom: 12,
              }}>
                Criteria Breakdown
              </div>
              {criteria.map(c => (
                <CriteriaBar
                  key={c.key}
                  label={c.label}
                  score={c.avg_score}
                  weight={c.weight}
                />
              ))}
              {avgTime > 0 && (
                <div style={{
                  fontSize: '0.72rem', color: 'var(--text-muted)',
                  marginTop: 8, fontFamily: 'var(--font-mono)',
                }}>
                  avg response: {(avgTime / 1000).toFixed(1)}s
                </div>
              )}
            </div>
          </div>

          {/* Test case preview */}
          {testPreviews.length > 0 && (
            <div style={{
              borderTop: '1px solid var(--rule)',
              padding: '14px 24px',
              background: 'var(--paper)',
            }}>
              <div style={{
                fontSize: '0.65rem', color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.06em',
                fontWeight: 700, marginBottom: 10,
              }}>
                Test Cases Preview
              </div>
              {testPreviews.map((tc, i) => {
                const sc = tc.score >= 80 ? 'var(--status-pass)' : tc.score >= 60 ? 'var(--status-warn)' : 'var(--status-fail)'
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '6px 0',
                    borderBottom: i < testPreviews.length - 1 ? '1px solid var(--rule-light)' : 'none',
                  }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
                      fontWeight: 700, color: sc,
                      textTransform: 'uppercase', width: 32,
                    }}>
                      {tc.status}
                    </span>
                    <span style={{
                      flex: 1, fontSize: '0.78rem', color: 'var(--text-secondary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {tc.question}
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
                      fontWeight: 700, color: sc,
                    }}>
                      {Math.round(tc.score)}
                    </span>
                  </div>
                )
              })}
              {listing.test_case_count > 5 && (
                <div style={{
                  fontSize: '0.72rem', color: 'var(--text-muted)',
                  marginTop: 8, fontStyle: 'italic',
                }}>
                  + {listing.test_case_count - 5} more test cases
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── What's Included ─── */}
      <div style={{
        border: '1px solid var(--rule)', borderRadius: 'var(--radius)',
        overflow: 'hidden', marginBottom: 22, background: 'white',
      }}>
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--rule)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <FileText size={15} style={{ color: 'var(--text-muted)' }} />
          <span style={{
            fontWeight: 700, fontSize: '0.82rem', color: 'var(--text)',
            fontFamily: 'var(--font-display)',
          }}>
            What's Included
          </span>
        </div>

        <div style={{ padding: '18px 24px' }}>
          {/* Pack type description */}
          <div style={{
            padding: '12px 16px',
            background: 'var(--paper)', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--rule)',
            fontSize: '0.8rem', color: 'var(--text-secondary)',
            lineHeight: 1.6, marginBottom: 16,
          }}>
            {PACK_DESCRIPTIONS[listing.pack_type] || ''}
          </div>

          {/* Items grid */}
          <div style={{ display: 'grid', gridTemplateColumns: listing.tool_count > 0 ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr', gap: 12 }}>
            <div style={{ textAlign: 'center', padding: 12 }}>
              <Bot size={20} style={{ color: 'var(--accent)', marginBottom: 6 }} />
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)' }}>Blueprint</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                System prompt & config
              </div>
            </div>
            <div style={{ textAlign: 'center', padding: 12 }}>
              <FlaskConical size={20} style={{ color: 'var(--accent)', marginBottom: 6 }} />
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)' }}>Eval Spec</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                {listing.test_case_count} test cases + criteria
              </div>
            </div>
            <div style={{ textAlign: 'center', padding: 12 }}>
              <FileText size={20} style={{
                color: listing.pack_type === 'byod' ? 'var(--text-faint)' : 'var(--accent)',
                marginBottom: 6,
              }} />
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)' }}>
                {listing.pack_type === 'byod' ? 'BYOD' : `${listing.document_count} Documents`}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                {listing.pack_type === 'byod' ? 'Upload your own' : 'Included'}
              </div>
            </div>
            {listing.tool_count > 0 && (
              <div style={{ textAlign: 'center', padding: 12 }}>
                <Wrench size={20} style={{ color: 'var(--accent)', marginBottom: 6 }} />
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)' }}>
                  {listing.tool_count} Tools
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  Needs setup
                </div>
              </div>
            )}
          </div>

          {/* Tool list */}
          {listing.tools?.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: 8 }}>
                Tool Schemas Included
              </div>
              {listing.tools.map((t, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 0',
                  borderBottom: i < listing.tools.length - 1 ? '1px solid var(--rule-light)' : 'none',
                }}>
                  <Zap size={13} style={{ color: 'var(--cane-600)', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text)' }}>{t.name}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 1 }}>{t.description}</div>
                  </div>
                  <div style={{
                    fontSize: '0.62rem', fontFamily: 'var(--font-mono)',
                    color: 'var(--text-faint)', textTransform: 'uppercase',
                  }}>
                    {t.method} · {t.fire_and_forget ? 'Fire & Forget' : 'Wait'}
                  </div>
                </div>
              ))}
              <div style={{
                fontSize: '0.72rem', color: 'var(--text-muted)',
                marginTop: 10, padding: '8px 12px',
                background: 'var(--cane-50)', borderRadius: 'var(--radius-sm)',
                lineHeight: 1.5,
              }}>
                Tool schemas are cloned without credentials. You'll configure URLs and auth after cloning.
              </div>
            </div>
          )}

          {/* Document list for open/licensed */}
          {listing.pack_type !== 'byod' && listing.included_documents?.length > 0 && (
            <div style={{ marginTop: 14 }}>
              {listing.included_documents.map((d, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 0',
                  fontSize: '0.75rem', color: 'var(--text-secondary)',
                  borderBottom: i < listing.included_documents.length - 1 ? '1px solid var(--rule-light)' : 'none',
                }}>
                  <FileText size={12} style={{ color: 'var(--text-faint)' }} />
                  <span style={{ flex: 1 }}>{d.filename}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    {d.chunk_count} chunks
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── System Prompt Preview ─── */}
      <div style={{
        border: '1px solid var(--rule)', borderRadius: 'var(--radius)',
        overflow: 'hidden', marginBottom: 22, background: 'white',
      }}>
        <button
          onClick={() => setPromptExpanded(!promptExpanded)}
          style={{
            padding: '16px 24px', width: '100%',
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'none', border: 'none', cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <Copy size={15} style={{ color: 'var(--text-muted)' }} />
          <span style={{
            fontWeight: 700, fontSize: '0.82rem', color: 'var(--text)',
            fontFamily: 'var(--font-display)', flex: 1,
          }}>
            System Prompt
          </span>
          <span style={{
            fontSize: '0.75rem', color: 'var(--text-muted)',
          }}>
            {promptExpanded ? '▾ collapse' : '▸ expand'}
          </span>
        </button>

        {promptExpanded && (
          <div style={{
            padding: '0 24px 18px',
          }}>
            <pre style={{
              background: '#1a1210', color: '#d4c4b0',
              padding: 16, borderRadius: 'var(--radius-sm)',
              fontSize: '0.76rem', lineHeight: 1.6,
              fontFamily: 'var(--font-mono)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              maxHeight: 300, overflowY: 'auto',
              border: '1px solid var(--rule)',
              margin: 0,
            }}>
              {listing.system_prompt}
            </pre>
          </div>
        )}
      </div>

      {/* ─── Re-Verify CTA ─── */}
      {!cloned && listing.test_case_count > 0 && (
        <div style={{
          padding: '20px 24px',
          background: 'var(--paper)', border: '1px solid var(--rule)',
          borderRadius: 'var(--radius)',
          textAlign: 'center', marginBottom: 22,
        }}>
          <div style={{
            fontWeight: 700, fontSize: '0.88rem', color: 'var(--text)',
            fontFamily: 'var(--font-display)', marginBottom: 4,
          }}>
            Don't take their word for it.
          </div>
          <div style={{
            fontSize: '0.8rem', color: 'var(--text-secondary)',
            marginBottom: 14, lineHeight: 1.6,
          }}>
            Clone this agent and re-run the eval suite to independently verify the score.
          </div>
          <button
            className="btn btn-primary"
            onClick={handleClone}
            disabled={cloning}
          >
            <RefreshCw size={14} />
            {cloning ? 'Cloning...' : 'Clone & Verify'}
          </button>
        </div>
      )}

      {/* Tags */}
      {listing.tags?.length > 0 && (
        <div style={{
          display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 22,
        }}>
          {listing.tags.map((tag, i) => (
            <span key={i} style={{
              padding: '3px 10px', borderRadius: 4,
              background: 'var(--paper)', border: '1px solid var(--rule)',
              fontSize: '0.68rem', color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
            }}>
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}