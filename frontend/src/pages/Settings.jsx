import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { getTeam, inviteMember, getWorkspaces, createWorkspace } from '../api/client'
import { UserPlus, FolderPlus, Users, Folders } from 'lucide-react'

export default function SettingsPage() {
  const { isOwner, tenant, updateWorkspaces } = useAuth()
  const [team, setTeam] = useState([])
  const [workspaces, setWorkspaces] = useState([])
  const [showInvite, setShowInvite] = useState(false)
  const [showNewWs, setShowNewWs] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      isOwner ? getTeam().catch(() => ({ members: [] })) : Promise.resolve({ members: [] }),
      getWorkspaces(),
    ]).then(([teamData, wsData]) => {
      setTeam(teamData.members || [])
      setWorkspaces(wsData.workspaces || [])
    }).finally(() => setLoading(false))
  }, [isOwner])

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
          const data = await getWorkspaces()
          setWorkspaces(data.workspaces || [])
          updateWorkspaces(data.workspaces || [])
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
              <div>
                <strong style={{ fontSize: '0.875rem' }}>{w.name}</strong>
                {w.is_default && (
                  <span className="badge badge-ready" style={{ marginLeft: 8 }}>default</span>
                )}
                {w.description && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{w.description}</p>
                )}
              </div>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                {w.document_count} docs
              </span>
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
