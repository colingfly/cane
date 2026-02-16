# 1. Add backend endpoint
with open('backend/app.py', 'r', encoding='utf-8') as f:
    c = f.read()

endpoint = '''

@app.put("/api/auth/password")
def change_password(
    current_password: str = Form(...),
    new_password: str = Form(...),
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    """Change the current user's password."""
    if not verify_password(current_password, user.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    pwd_err = validate_password(new_password)
    if pwd_err:
        raise HTTPException(400, pwd_err)
    user.password_hash = hash_password(new_password)
    db.commit()
    return {"status": "ok", "message": "Password updated"}
'''

# Insert before health check
c = c.replace(
    '# ── Health check',
    endpoint + '\n# ── Health check'
)

with open('backend/app.py', 'w', encoding='utf-8') as f:
    f.write(c)
print("Added password change endpoint")

# 2. Add client function
with open('frontend/src/api/client.js', 'r', encoding='utf-8') as f:
    c = f.read()

c += '''
export async function changePassword(currentPassword, newPassword) {
  const form = new FormData()
  form.append('current_password', currentPassword)
  form.append('new_password', newPassword)
  return request('/api/auth/password', { method: 'PUT', body: form })
}
'''

with open('frontend/src/api/client.js', 'w', encoding='utf-8') as f:
    f.write(c)
print("Added changePassword to client.js")

# 3. Add password form to Settings
with open('frontend/src/pages/Settings.jsx', 'r', encoding='utf-8') as f:
    c = f.read()

# Add import
c = c.replace(
    "import { getTeam, inviteMember, getWorkspaces, createWorkspace, renameWorkspace, deleteWorkspace } from '../api/client'",
    "import { getTeam, inviteMember, getWorkspaces, createWorkspace, renameWorkspace, deleteWorkspace, changePassword } from '../api/client'"
)

c = c.replace(
    "import { UserPlus, FolderPlus, Users, Folders, Pencil, Trash2, Check, X } from 'lucide-react'",
    "import { UserPlus, FolderPlus, Users, Folders, Pencil, Trash2, Check, X, Lock } from 'lucide-react'"
)

# Add password section before closing </div> of the page
old = '''      {/* Team */}
      {isOwner && ('''
new = '''      {/* Change Password */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3><Lock size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} /> Change Password</h3>
        </div>
        <ChangePasswordForm />
      </div>

      {/* Team */}
      {isOwner && ('''
c = c.replace(old, new)

# Add ChangePasswordForm component before the InviteForm
old = '''function InviteForm({ onInvited }) {'''
new = '''function ChangePasswordForm() {
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


function InviteForm({ onInvited }) {'''
c = c.replace(old, new)

with open('frontend/src/pages/Settings.jsx', 'w', encoding='utf-8') as f:
    f.write(c)
print("Added password change form to Settings")
