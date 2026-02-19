import { useState, useEffect } from 'react'
import { adminGetTenants, adminGetTenantDetail, adminCreateTenant, adminUpdateTenant, adminDeleteTenant, adminUpdateUser, adminDeleteUser } from '../api/client'
import { Building2, Users, FileText, Search, AlertTriangle, Plus, ArrowLeft, TrendingUp, Pencil, Trash2, Check, X } from 'lucide-react'

export default function Admin() {
  const [tenants, setTenants] = useState([])
  const [selectedTenant, setSelectedTenant] = useState(null)
  const [detail, setDetail] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editingTenant, setEditingTenant] = useState(false)
  const [tenantName, setTenantName] = useState('')
  const [tenantSlug, setTenantSlug] = useState('')

  useEffect(() => {
    loadTenants()
  }, [])

  async function loadTenants() {
    try {
      const data = await adminGetTenants()
      setTenants(data.tenants || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function viewTenant(tenant) {
    setSelectedTenant(tenant)
    try {
      const data = await adminGetTenantDetail(tenant.id)
      setDetail(data)
    } catch (err) {
      console.error(err)
    }
  }

  async function handleRenameTenant() {
    if (!tenantName.trim()) return
    try {
      await adminUpdateTenant(selectedTenant.id, tenantName.trim(), tenantSlug.trim())
      setEditingTenant(false)
      const data = await adminGetTenantDetail(selectedTenant.id)
      setDetail(data)
      setSelectedTenant({ ...selectedTenant, name: tenantName.trim() })
      loadTenants()
    } catch (err) {
      alert(err.message)
    }
  }

  async function handleDeleteTenant() {
    if (!confirm(`Delete "${detail.tenant.name}" and ALL its data? This cannot be undone.`)) return
    if (!confirm(`Are you absolutely sure? This will delete all users, files, and search history for this tenant.`)) return
    try {
      await adminDeleteTenant(selectedTenant.id)
      setSelectedTenant(null)
      setDetail(null)
      loadTenants()
    } catch (err) {
      alert(err.message)
    }
  }

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  if (selectedTenant && detail) {
    return (
      <TenantDetail
        detail={detail}
        selectedTenant={selectedTenant}
        editingTenant={editingTenant}
        tenantName={tenantName}
        tenantSlug={tenantSlug}
        setEditingTenant={setEditingTenant}
        setTenantName={setTenantName}
        setTenantSlug={setTenantSlug}
        handleRenameTenant={handleRenameTenant}
        handleDeleteTenant={handleDeleteTenant}
        onBack={() => { setSelectedTenant(null); setDetail(null) }}
        onRefresh={async () => {
          const data = await adminGetTenantDetail(selectedTenant.id)
          setDetail(data)
        }}
      />
    )
  }

  return (
    <div className="fade-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2>Client Management</h2>
          <p>Your SMB clients — click to view intelligence</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>
          <Plus size={16} /> Onboard Client
        </button>
      </div>

      {showCreate && <CreateTenantForm onCreated={() => { setShowCreate(false); loadTenants() }} />}

      {tenants.length === 0 ? (
        <div className="empty-state">
          <Building2 size={32} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
          <h3>No clients yet</h3>
          <p>Click "Onboard Client" to add your first SMB partner</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {tenants.map(t => (
            <div
              key={t.id}
              className="card"
              style={{ cursor: 'pointer', transition: 'all 0.15s' }}
              onClick={() => viewTenant(t)}
              onMouseOver={e => e.currentTarget.style.borderColor = 'var(--accent)'}
              onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <h3 style={{ marginBottom: 12 }}>{t.name}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>{t.users}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Users</div>
                </div>
                <div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>{t.documents}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Docs</div>
                </div>
                <div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>{t.searches}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Searches</div>
                </div>
              </div>
              <div style={{ marginTop: 12, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                Since {new Date(t.created_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


function TenantDetail({ detail, selectedTenant, editingTenant, tenantName, tenantSlug, setEditingTenant, setTenantName, setTenantSlug, handleRenameTenant, handleDeleteTenant, onBack, onRefresh }) {
  const [editingUser, setEditingUser] = useState(null)
  const [editEmail, setEditEmail] = useState('')
  const [editName, setEditName] = useState('')
  const [userError, setUserError] = useState('')

  function startEditUser(u) {
    setEditingUser(u.id)
    setEditEmail(u.email)
    setEditName(u.name || '')
    setUserError('')
  }

  async function saveUser(userId) {
    if (!editEmail.trim()) return
    setUserError('')
    try {
      await adminUpdateUser(selectedTenant.id, userId, editEmail.trim(), editName.trim())
      setEditingUser(null)
      await onRefresh()
    } catch (err) {
      setUserError(err.message)
    }
  }

  async function handleDeleteUser(u) {
    if (u.role === 'owner') {
      alert('Cannot delete the owner. Transfer ownership first.')
      return
    }
    if (!confirm(`Delete user "${u.name || u.email}"?`)) return
    try {
      await adminDeleteUser(selectedTenant.id, u.id)
      await onRefresh()
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <div className="fade-in">
      <div className="page-header">
        <button className="btn btn-ghost" onClick={onBack} style={{ marginBottom: 8 }}>
          <ArrowLeft size={16} /> Back to clients
        </button>

        {editingTenant ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <input
              className="form-input"
              value={tenantName}
              onChange={e => setTenantName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleRenameTenant(); if (e.key === 'Escape') setEditingTenant(false) }}
              autoFocus
              style={{ fontSize: '1.25rem', fontWeight: 700, padding: '6px 12px', maxWidth: 300 }}
              placeholder="Company name"
            />
            <button className="btn btn-ghost btn-sm" onClick={handleRenameTenant} style={{ color: 'var(--success)' }}>
              <Check size={16} />
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditingTenant(false)} style={{ color: 'var(--text-muted)' }}>
              <X size={16} />
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2>{detail.tenant.name}</h2>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { setTenantName(detail.tenant.name); setTenantSlug(detail.tenant.slug); setEditingTenant(true) }}
              title="Rename"
            >
              <Pencil size={14} />
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleDeleteTenant}
              title="Delete tenant"
              style={{ color: 'var(--error)' }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value">{detail.users?.length || 0}</div>
          <div className="stat-label"><Users size={13} style={{ verticalAlign: 'middle' }} /> Users</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{detail.documents?.length || 0}</div>
          <div className="stat-label"><FileText size={13} style={{ verticalAlign: 'middle' }} /> Files</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{detail.search_volume || 0}</div>
          <div className="stat-label"><Search size={13} style={{ verticalAlign: 'middle' }} /> Total searches</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: detail.zero_result_queries?.length > 0 ? 'var(--error)' : 'var(--success)' }}>
            {detail.zero_result_queries?.length || 0}
          </div>
          <div className="stat-label"><AlertTriangle size={13} style={{ verticalAlign: 'middle' }} /> Failed searches</div>
        </div>
      </div>

      {detail.zero_result_queries?.length > 0 && (
        <div className="card" style={{ marginBottom: 24, borderColor: 'rgba(196, 78, 63, 0.2)' }}>
          <div className="card-header">
            <h3 style={{ color: 'var(--error)' }}>
              <AlertTriangle size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              Failed Searches
            </h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {detail.zero_result_queries.map((s, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 12px',
                background: 'rgba(196, 78, 63, 0.04)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.875rem',
              }}>
                <span>"{s.query}"</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {new Date(s.time).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {detail.top_queries?.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <h3><TrendingUp size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} /> Top Queries</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {detail.top_queries.map((q, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 12px',
                background: 'var(--cane-50)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.875rem',
              }}>
                <span>{q.query}</span>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.8rem',
                  color: 'var(--accent)',
                  fontWeight: 600,
                }}>
                  {q.count}×
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header"><h3>Users</h3></div>
        {detail.users?.map((u, i) => (
          <div key={u.id || i} style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 0',
            borderBottom: i < detail.users.length - 1 ? '1px solid var(--cane-100)' : 'none',
            fontSize: '0.875rem',
          }}>
            {editingUser === u.id ? (
              <div style={{ flex: 1, marginRight: 12 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    className="form-input"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveUser(u.id); if (e.key === 'Escape') setEditingUser(null) }}
                    placeholder="Name"
                    style={{ fontSize: '0.875rem', padding: '5px 10px', flex: 1 }}
                  />
                  <input
                    className="form-input"
                    value={editEmail}
                    onChange={e => setEditEmail(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveUser(u.id); if (e.key === 'Escape') setEditingUser(null) }}
                    placeholder="Email"
                    autoFocus
                    style={{ fontSize: '0.875rem', padding: '5px 10px', flex: 1.5 }}
                  />
                  <button className="btn btn-ghost btn-sm" onClick={() => saveUser(u.id)} style={{ color: 'var(--success)' }}>
                    <Check size={14} />
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditingUser(null)} style={{ color: 'var(--text-muted)' }}>
                    <X size={14} />
                  </button>
                </div>
                {userError && <p style={{ fontSize: '0.75rem', color: 'var(--error)', marginTop: 4 }}>{userError}</p>}
              </div>
            ) : (
              <>
                <div>
                  <strong>{u.name || u.email}</strong>
                  <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{u.email}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="badge badge-ready">{u.role}</span>
                  {u.last_login && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      Last: {new Date(u.last_login).toLocaleDateString()}
                    </span>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => startEditUser(u)} title="Edit user">
                    <Pencil size={13} />
                  </button>
                  {u.role !== 'owner' && (
                    <button className="btn btn-ghost btn-sm" onClick={() => handleDeleteUser(u)} title="Delete user" style={{ color: 'var(--error)' }}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header"><h3>Files</h3></div>
        {detail.documents?.length > 0 ? detail.documents.map((d, i) => (
          <div key={i} style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '8px 0',
            borderBottom: i < detail.documents.length - 1 ? '1px solid var(--cane-100)' : 'none',
            fontSize: '0.875rem',
          }}>
            <span className="filename">{d.filename}</span>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{d.chunks} chunks</span>
              <span className={`badge badge-${d.status}`}>{d.status}</span>
            </div>
          </div>
        )) : (
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', padding: '12px 0' }}>No files uploaded yet</p>
        )}
      </div>
    </div>
  )
}


function CreateTenantForm({ onCreated }) {
  const [form, setForm] = useState({
    name: '', slug: '', owner_email: '', owner_password: '', owner_name: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function update(key, value) {
    setForm(f => {
      const updated = { ...f, [key]: value }
      if (key === 'name') {
        updated.slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      }
      return updated
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await adminCreateTenant(form)
      onCreated()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <h3 style={{ marginBottom: 16 }}>Onboard New Client</h3>
      {error && <div style={{ color: 'var(--error)', fontSize: '0.8125rem', marginBottom: 12 }}>{error}</div>}
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group"><label>Company name</label><input className="form-input" value={form.name} onChange={e => update('name', e.target.value)} required /></div>
          <div className="form-group"><label>Slug</label><input className="form-input" value={form.slug} onChange={e => update('slug', e.target.value)} required style={{ fontFamily: 'var(--font-mono)' }} /></div>
          <div className="form-group"><label>Owner email</label><input className="form-input" type="email" value={form.owner_email} onChange={e => update('owner_email', e.target.value)} required /></div>
          <div className="form-group"><label>Owner name</label><input className="form-input" value={form.owner_name} onChange={e => update('owner_name', e.target.value)} /></div>
          <div className="form-group"><label>Owner password</label><input className="form-input" type="password" value={form.owner_password} onChange={e => update('owner_password', e.target.value)} required /></div>
        </div>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Creating...' : 'Create tenant'}
        </button>
      </form>
    </div>
  )
}
