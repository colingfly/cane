import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { register } from '../api/client'

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { handleLogin } = useAuth()
  const navigate = useNavigate()

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const data = await register(email, password, name, companyName)
      handleLogin(data)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32, padding: '40px 20px' }}>
        <div className="login-card" style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 16, padding: 40,
        }}>
          <div className="login-brand">
            <h1>Cane</h1>
            <p>Create your account</p>
            <Link to="/guide" style={{
              color: 'var(--cane-500)', fontSize: '0.78rem', fontWeight: 500,
              textDecoration: 'underline', textDecorationColor: 'rgba(255,255,255,0.1)',
              textUnderlineOffset: 3,
            }}>
              What is Cane? →
            </Link>
          </div>

          <form onSubmit={onSubmit}>
            {error && <div className="login-error">{error}</div>}

            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="Your name"
                value={name}
                onChange={e => setName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                className="form-input"
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Company / Organization <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
              <input
                type="text"
                className="form-input"
                placeholder="Acme Corp"
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                className="form-input"
                placeholder="8+ characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <><span className="spinner" /> Creating account...</> : 'Create free account'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: 16, fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Already have an account? <Link to="/login" style={{ color: 'var(--accent)' }}>Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
