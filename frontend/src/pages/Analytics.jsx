import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, MessageSquare, Clock, ThumbsUp, ThumbsDown, Wrench, TrendingUp, Globe, Zap } from 'lucide-react'
import { getAgent, getAnalytics } from '../api/client'

function StatCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div style={{
      padding: '18px 20px', background: 'white',
      border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      flex: 1, minWidth: 160,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Icon size={14} style={{ color: color || 'var(--text-muted)' }} />
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {label}
        </span>
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.5rem', color: 'var(--text)' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function MiniBar({ data, maxDays = 30 }) {
  if (!data || data.length === 0) return <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No data yet</div>
  const max = Math.max(...data.map(d => d.count), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 60 }}>
      {data.slice(-maxDays).map((d, i) => (
        <div key={i} style={{ position: 'relative', flex: 1 }} title={`${d.date}: ${d.count}`}>
          <div style={{
            height: Math.max(2, (d.count / max) * 56),
            background: 'var(--accent)', borderRadius: 2, opacity: 0.8,
          }} />
        </div>
      ))}
    </div>
  )
}

export default function Analytics() {
  const { agentId } = useParams()
  const [agent, setAgent] = useState(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getAgent(agentId),
      getAnalytics(agentId, days),
    ]).then(([a, d]) => {
      setAgent(a)
      setData(d)
    }).catch(console.error).finally(() => setLoading(false))
  }, [agentId, days])

  if (loading) return <div className="loading-center"><div className="spinner" /></div>
  if (!agent) return <div className="fade-in"><p>Agent not found.</p></div>

  const d = data || {}
  const positive = d.feedback?.positive || 0
  const negative = d.feedback?.negative || 0
  const total = d.total_conversations || 0
  const satisfactionPct = (positive + negative) > 0 ? Math.round((positive / (positive + negative)) * 100) : null

  return (
    <div className="fade-in" style={{ maxWidth: 880, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Link to={`/agents/${agentId}`} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: '0.8rem', color: 'var(--text-muted)', textDecoration: 'none', marginBottom: 12,
        }}>
          <ArrowLeft size={14} /> Back to {agent.name}
        </Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>
            Analytics — {agent.name}
          </h2>
          <select
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            style={{
              padding: '7px 12px', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)', fontSize: '0.8rem',
              fontFamily: 'var(--font-body)', background: 'white', cursor: 'pointer',
            }}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard icon={MessageSquare} label="Conversations" value={total} color="var(--accent)" />
        <StatCard icon={Clock} label="Avg Response" value={d.avg_response_ms ? `${(d.avg_response_ms / 1000).toFixed(1)}s` : '--'} color="var(--cane-600)" />
        <StatCard
          icon={ThumbsUp} label="Satisfaction"
          value={satisfactionPct !== null ? `${satisfactionPct}%` : '--'}
          sub={satisfactionPct !== null ? `${positive} positive / ${negative} negative` : 'No feedback yet'}
          color="var(--success)"
        />
      </div>

      {/* Volume chart */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <TrendingUp size={16} /> Conversation Volume
        </h3>
        <MiniBar data={d.by_day || []} maxDays={days} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          <span>{d.by_day?.[0]?.date || ''}</span>
          <span>{d.by_day?.[d.by_day.length - 1]?.date || ''}</span>
        </div>
      </div>

      {/* Channel + Tools row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
        {/* By channel */}
        <div className="card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Globe size={16} /> By Channel
          </h3>
          {Object.keys(d.by_channel || {}).length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(d.by_channel).map(([ch, count]) => (
                <div key={ch} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{
                    fontSize: '0.8rem', fontWeight: 600, textTransform: 'capitalize',
                    padding: '2px 10px', borderRadius: 4, background: 'var(--cane-100)',
                  }}>{ch}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 700 }}>{count}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No data yet</div>
          )}
        </div>

        {/* Tools used */}
        <div className="card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Zap size={16} /> Tools Used
          </h3>
          {Object.keys(d.tools_used || {}).length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(d.tools_used).sort((a, b) => b[1] - a[1]).map(([name, count]) => (
                <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.76rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{name}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 700 }}>{count}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No tools called yet</div>
          )}
        </div>
      </div>

      {/* Recent conversations */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <MessageSquare size={16} /> Recent Conversations
        </h3>
        {(d.top_queries || []).length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {d.top_queries.slice(0, 20).map(q => (
              <div key={q.id} style={{
                padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)', background: 'var(--bg)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>{q.query}</div>
                    {q.answer_preview && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                        {q.answer_preview.length > 150 ? q.answer_preview.slice(0, 150) + '...' : q.answer_preview}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                    <span style={{
                      fontSize: '0.6rem', fontWeight: 600, padding: '1px 6px', borderRadius: 4,
                      background: q.channel === 'widget' ? 'rgba(59,120,66,0.1)' : q.channel === 'api' ? 'rgba(91,123,180,0.1)' : 'var(--cane-100)',
                      color: q.channel === 'widget' ? 'var(--success)' : q.channel === 'api' ? '#5b7bb4' : 'var(--cane-700)',
                      textTransform: 'uppercase',
                    }}>{q.channel}</span>
                    {q.response_time_ms && (
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{(q.response_time_ms / 1000).toFixed(1)}s</span>
                    )}
                  </div>
                </div>
                {q.tools_called.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                    {q.tools_called.map(t => (
                      <span key={t} style={{
                        fontSize: '0.6rem', padding: '1px 5px', borderRadius: 3,
                        background: 'var(--accent-muted)', color: 'var(--accent)',
                        fontFamily: 'var(--font-mono)',
                      }}>{t}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
            No conversations yet. Embed the widget or use the API to start seeing data.
          </div>
        )}
      </div>
    </div>
  )
}
