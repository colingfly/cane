import { useState, useEffect } from 'react'
import { getStats } from '../api/client'
import { FileText, Database, Search, Image } from 'lucide-react'

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getStats()
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading-center"><div className="spinner" /></div>
  if (!stats) return null

  return (
    <div className="fade-in">
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>Overview of your knowledge base</p>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.documents}</div>
          <div className="stat-label"><FileText size={13} style={{ verticalAlign: 'middle' }} /> Files</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.chunks.toLocaleString()}</div>
          <div className="stat-label"><Database size={13} style={{ verticalAlign: 'middle' }} /> Indexed chunks</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.images}</div>
          <div className="stat-label"><Image size={13} style={{ verticalAlign: 'middle' }} /> Images</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.recent_searches?.length || 0}</div>
          <div className="stat-label"><Search size={13} style={{ verticalAlign: 'middle' }} /> Recent searches</div>
        </div>
      </div>

      {/* Workspaces breakdown */}
      {stats.workspaces?.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <h3>Workspaces</h3>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {stats.workspaces.map(w => (
              <div key={w.id} style={{
                padding: '12px 16px',
                background: 'var(--cane-50)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.875rem',
              }}>
                <strong>{w.name}</strong>
                <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
                  {w.document_count} docs
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent searches */}
      {stats.recent_searches?.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3>Recent Searches</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stats.recent_searches.map((s, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 0',
                borderBottom: i < stats.recent_searches.length - 1 ? '1px solid var(--cane-100)' : 'none',
              }}>
                <div>
                  <span style={{ fontSize: '0.875rem' }}>{s.query}</span>
                  <span className={`badge badge-${s.results > 0 ? 'ready' : 'error'}`} style={{ marginLeft: 8 }}>
                    {s.results} results
                  </span>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {new Date(s.time).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
