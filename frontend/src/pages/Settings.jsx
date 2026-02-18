import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { getTeam, inviteMember, getWorkspaces, createWorkspace, renameWorkspace, deleteWorkspace, changePassword, getApiKeys, createApiKey, deleteApiKey } from '../api/client'
import { UserPlus, FolderPlus, Users, Folders, Pencil, Trash2, Check, X, Lock, Key, Copy, Eye, EyeOff } from 'lucide-react'

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

      {/* Change Password */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3><Lock size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} /> Change Password</h3>
        </div>
        <ChangePasswordForm />
      </div>

      {/* API Keys */}
      {isOwner && tenant?.plan !== 'free' && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <h3><Key size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} /> API Keys</h3>
          </div>
          <ApiKeysSection workspaces={workspaces} />
        </div>
      )}
      {isOwner && tenant?.plan === 'free' && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <h3><Key size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} /> API Keys</h3>
          </div>
          <div style={{ padding: '20px 24px', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            API access is available on the Pro plan. <a href="mailto:hello@cane.fyi" style={{ color: 'var(--accent)' }}>Contact us</a> to upgrade.
          </div>
        </div>
      )}

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


function ChangePasswordForm() {
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (newPw !== confirmPw) {
      setError('New passwords do not match')
      return
    }
    if (newPw.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    try {
      await changePassword(currentPw, newPw)
      setSuccess('Password updated successfully')
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ padding: '16px 0' }}>
      {error && <div style={{ color: 'var(--error)', fontSize: '0.8125rem', marginBottom: 8 }}>{error}</div>}
      {success && <div style={{ color: 'var(--success)', fontSize: '0.8125rem', marginBottom: 8 }}>{success}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 360 }}>
        <div className="form-group">
          <label>Current password</label>
          <input className="form-input" type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} required />
        </div>
        <div className="form-group">
          <label>New password</label>
          <input className="form-input" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} required />
        </div>
        <div className="form-group">
          <label>Confirm new password</label>
          <input className="form-input" type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} required />
        </div>
      </div>
      <button type="submit" className="btn btn-primary btn-sm" disabled={loading} style={{ marginTop: 12 }}>
        {loading ? 'Updating...' : 'Update password'}
      </button>
    </form>
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


function ApiKeysSection({ workspaces }) {
  const [keys, setKeys] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyWs, setNewKeyWs] = useState('')
  const [creating, setCreating] = useState(false)
  const [revealedKey, setRevealedKey] = useState(null) // full key shown once after creation

  useEffect(() => {
    getApiKeys().then(res => setKeys(res.keys || [])).catch(() => {}).finally(() => setLoading(false))
  }, [])

  async function handleCreate(e) {
    e.preventDefault()
    if (!newKeyName.trim()) return
    setCreating(true)
    try {
      const res = await createApiKey(newKeyName.trim(), newKeyWs || null)
      setRevealedKey(res.key) // Show once
      setKeys(prev => [{ ...res, is_active: true, requests_today: 0 }, ...prev])
      setShowCreate(false)
      setNewKeyName('')
      setNewKeyWs('')
    } catch (err) {
      alert(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(keyId) {
    if (!confirm('Revoke this API key? Any integrations using it will stop working.')) return
    try {
      await deleteApiKey(keyId)
      setKeys(prev => prev.filter(k => k.id !== keyId))
      if (revealedKey) setRevealedKey(null)
    } catch (err) {
      alert(err.message)
    }
  }

  function copyKey(text) {
    navigator.clipboard.writeText(text)
  }

  if (loading) return <div style={{ padding: 16 }}><div className="spinner" style={{ width: 16, height: 16 }} /></div>

  return (
    <div style={{ padding: '16px 0' }}>
      <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 16 }}>
        API keys let external apps query your documents programmatically. Keys are scoped to your tenant and optionally to a specific workspace or agent.
      </p>

      {/* Revealed key banner */}
      {revealedKey && (
        <div style={{
          padding: 12, background: 'rgba(61, 140, 92, 0.08)', border: '1px solid var(--success)',
          borderRadius: 'var(--radius-sm)', marginBottom: 16,
        }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--success)', marginBottom: 6 }}>
            Copy your API key now — it won't be shown again
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <code style={{
              flex: 1, fontSize: '0.8125rem', background: 'var(--bg-card)', padding: '6px 10px',
              borderRadius: 4, wordBreak: 'break-all', border: '1px solid var(--border)',
            }}>
              {revealedKey}
            </code>
            <button className="btn btn-ghost btn-sm" onClick={() => copyKey(revealedKey)} title="Copy">
              <Copy size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Create form */}
      {showCreate ? (
        <form onSubmit={handleCreate} style={{ marginBottom: 16, padding: 12, background: 'var(--cane-50)', borderRadius: 'var(--radius-sm)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div className="form-group">
              <label>Key name</label>
              <input className="form-input" placeholder="e.g. Slack Bot, Production" value={newKeyName}
                onChange={e => setNewKeyName(e.target.value)} autoFocus required />
            </div>
            <div className="form-group">
              <label>Scope <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
              <select className="form-input" value={newKeyWs} onChange={e => setNewKeyWs(e.target.value)}>
                <option value="">All workspaces</option>
                {workspaces.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={creating}>
              {creating ? 'Generating...' : 'Generate key'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <button className="btn btn-secondary btn-sm" onClick={() => { setShowCreate(true); setRevealedKey(null) }} style={{ marginBottom: 16 }}>
          <Key size={14} /> Generate new key
        </button>
      )}

      {/* Key list */}
      {keys.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {keys.map(k => (
            <div key={k.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 14px', background: 'var(--cane-50)', borderRadius: 'var(--radius-sm)',
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong style={{ fontSize: '0.875rem' }}>{k.name}</strong>
                  <code style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{k.key_prefix}...</code>
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  {k.requests_today} requests today
                  {k.last_used_at ? ` · Last used ${new Date(k.last_used_at).toLocaleDateString()}` : ' · Never used'}
                  {k.workspace_id ? ' · Scoped' : ' · All workspaces'}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(k.id)}
                title="Revoke key" style={{ color: 'var(--error)' }}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', textAlign: 'center', padding: 16 }}>
          No API keys yet. Generate one to start integrating.
        </p>
      )}
    </div>
  )
}