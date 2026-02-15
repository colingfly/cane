import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { getTeam, inviteMember, getWorkspaces, createWorkspace, renameWorkspace, deleteWorkspace } from '../api/client'
import { UserPlus, FolderPlus, Users, Folders, Pencil, Trash2, Check, X } from 'lucide-react'

export default function SettingsPage() {
  const { isOwner, tenant, updateWorkspaces } = useAuth()
  const [team, setTeam] = useState([])
  const [workspaces, setWorkspaces] = useState([])
  const [showInvite, setShowInvite] = useState(false)
  const [showNewWs, setShowNewWs] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editingWs, setEditingWs] = useState(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [wsError, setWsError] = useState('')

  useEffect(() => {
    Promise.all([
      isOwner ? getTeam().catch(() => ({ members: [] })) : Promise.resolve({ members: [] }),
      getWorkspaces(),
    ]).then(([teamData, wsData]) => {
      setTeam(teamData.members || [])
      setWorkspaces(wsData.workspaces || [])
    }).finally(() => setLoading(false))
  }, [isOwner])

  async function refreshWorkspaces() {
    const data = await getWorkspaces()
    setWorkspaces(data.workspaces || [])
    updateWorkspaces(data.workspaces || [])
  }

  function startEditing(ws) {
    setEditingWs(ws.id)
    setEditName(ws.name)
    setEditDesc(ws.description || '')
    setWsError('')
  }

  function cancelEditing() {
    setEditingWs(null)
    setEditName('')
    setEditDesc('')
    setWsError('')
  }

  async function saveRename(wsId) {
    if (!editName.trim()) return
    setWsError('')
    try {
      await renameWorkspace(wsId, editName.trim(), editDesc.trim())
      await refreshWorkspaces()
      setEditingWs(null)
    } catch (err) {
      setWsError(err.message)
    }
  }

  async function handleDeleteWs(ws) {
    if (!confirm(`Delete workspace "${ws.name}"? This cannot be undone.`)) return
    try {
      await deleteWorkspace(ws.id)
      await refreshWorkspaces()
    } catch (err) {
      alert(err.message)
    }
  }

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  return (
    <div className="fade-in">
      <div className="page-header">
        <h2>Settings</h2>
        <p>{tenant?.name}</p>
      </div>

      {/* Workspaces */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3><Folders size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} /> Workspaces</h3>
          {isOwner && (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowNewWs(!showNewWs)}>
              <FolderPlus size={14} /> New
            </button>
          )}
        </div>

        {showNewWs && <NewWorkspaceForm onCreated={async () => {
          await refreshWorkspaces()
          setShowNewWs(false)
        }} />}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {workspaces.map(w => (
            <div key={w.id} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 14px',
              background: 'var(--cane-50)',
              borderRadius: 'var(--radius-sm)',
            }}>
              {editingWs === w.id ? (
                /* Editing mode */
                <div style={{ flex: 1, marginRight: 12 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      className="form-input"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveRename(w.id)
                        if (e.key === 'Escape') cancelEditing()
                      }}
                      autoFocus
                      style={{ fontSize: '0.875rem', padding: '6px 10px', flex: 1 }}
                      placeholder="Workspace name"
                    />
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => saveRename(w.id)}
                      title="Save"
                      style={{ color: 'var(--success)' }}
                    >
                      <Check size={14} />
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={cancelEditing}
                      title="Cancel"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <input
                    className="form-input"
                    value={editDesc}
                    onChange={e => setEditDesc(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveRename(w.id)
                      if (e.key === 'Escape') cancelEditing()
                    }}
                    style={{ fontSize: '0.75rem', padding: '4px 10px', marginTop: 6, width: '100%' }}
                    placeholder="Description (optional)"
                  />
                  {wsError && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--error)', marginTop: 4 }}>{wsError}</p>
                  )}
                </div>
              ) : (
                /* Display mode */
                <div>
                  <strong style={{ fontSize: '0.875rem' }}>{w.name}</strong>
                  {w.is_default && (
                    <span className="badge badge-ready" style={{ marginLeft: 8 }}>default</span>
                  )}
                  {w.description && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{w.description}</p>
                  )}
                </div>
              )}

              {editingWs !== w.id && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                    {w.document_count} docs
                  </span>
                  {isOwner && (
                    <>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => startEditing(w)}
                        title="Rename"
                      >
                        <Pencil size={13} />
                      </button>
                      {!w.is_default && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleDeleteWs(w)}
                          title="Delete workspace"
                          style={{ color: 'var(--error)' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Team */}
      {isOwner && (
        <div className="card">
          <div className="card-header">
            <h3><Users size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} /> Team</h3>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowInvite(!showInvite)}>
              <UserPlus size={14} /> Invite
            </button>
          </div>

          {showInvite && <InviteForm onInvited={async () => {
            const data = await getTeam()
            setTeam(data.members || [])
            setShowInvite(false)
          }} />}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {team.map(m => (
              <div key={m.id} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 14px',
                background: 'var(--cane-50)',
                borderRadius: 'var(--radius-sm)',
              }}>
                <div>
                  <strong style={{ fontSize: '0.875rem' }}>{m.name || m.email}</strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 8 }}>{m.email}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="badge badge-ready">{m.role}</span>
                  {m.last_login && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      Last login: {new Date(m.last_login).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}


function InviteForm({ onInvited }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('member')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await inviteMember(email, name, password, role)
      onInvited()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ padding: '16px 0', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
      {error && <div style={{ color: 'var(--error)', fontSize: '0.8125rem', marginBottom: 8 }}>{error}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="form-group"><label>Email</label><input className="form-input" value={email} onChange={e => setEmail(e.target.value)} required /></div>
        <div className="form-group"><label>Name</label><input className="form-input" value={name} onChange={e => setName(e.target.value)} /></div>
        <div className="form-group"><label>Temporary password</label><input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
        <div className="form-group">
          <label>Role</label>
          <select className="form-input" value={role} onChange={e => setRole(e.target.value)}>
            <option value="member">Member</option>
            <option value="owner">Owner</option>
          </select>
        </div>
      </div>
      <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
        {loading ? 'Inviting...' : 'Send invite'}
      </button>
    </form>
  )
}


function NewWorkspaceForm({ onCreated }) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    try {
      await createWorkspace(name, desc)
      onCreated()
    } catch (err) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ padding: '16px 0', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="form-group"><label>Name</label><input className="form-input" placeholder="e.g. HR Policies" value={name} onChange={e => setName(e.target.value)} required /></div>
        <div className="form-group"><label>Description (optional)</label><input className="form-input" value={desc} onChange={e => setDesc(e.target.value)} /></div>
      </div>
      <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
        {loading ? 'Creating...' : 'Create workspace'}
      </button>
    </form>
  )
}
