import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { login } from '../api/client'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { handleLogin } = useAuth()
  const navigate = useNavigate()

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const data = await login(email, password)
      handleLogin(data)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 48, padding: '40px 20px' }}>
        <div className="login-card">
          <div className="login-brand">
            <h1>Cane</h1>
            <p>Operational Intelligence</p>
          </div>

          <form onSubmit={onSubmit}>
            {error && <div className="login-error">{error}</div>}

            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                className="form-input"
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <><span className="spinner" /> Signing in...</> : 'Sign in'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: 16, fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Don't have an account? <Link to="/register" style={{ color: 'var(--accent)' }}>Create one</Link>
          </div>
        </div>

        {/* Pricing */}
        <div style={{ width: '100%', maxWidth: 680 }}>
          <h2 style={{
            textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: '1.25rem',
            fontWeight: 700, color: 'var(--cane-100)', marginBottom: 8,
          }}>Plans</h2>
          <p style={{ textAlign: 'center', color: 'var(--cane-500)', fontSize: '0.8125rem', marginBottom: 24 }}>
            Start free. Upgrade when you need more.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Free */}
            <div style={{
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12, padding: 28,
            }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--cane-400)', marginBottom: 8 }}>Free</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 16 }}>
                <span style={{ fontSize: '2rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--cane-100)' }}>$0</span>
                <span style={{ color: 'var(--cane-500)', fontSize: '0.8125rem' }}>/month</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.8125rem', color: 'var(--cane-300)' }}>
                <div>3 documents</div>
                <div>1 agent</div>
                <div>50 searches / month</div>
                <div>Web UI access</div>
                <div style={{ color: 'var(--cane-600)' }}>No API access</div>
              </div>
            </div>

            {/* Pro */}
            <div style={{
              background: 'rgba(200,150,62,0.08)', border: '1px solid rgba(200,150,62,0.25)',
              borderRadius: 12, padding: 28, position: 'relative',
            }}>
              <div style={{
                position: 'absolute', top: -10, right: 16,
                background: 'var(--accent)', color: 'white', fontSize: '0.6rem',
                fontWeight: 700, padding: '3px 10px', borderRadius: 8,
                letterSpacing: '0.05em', textTransform: 'uppercase',
              }}>Coming Soon</div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent)', marginBottom: 8 }}>Pro</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 16 }}>
                <span style={{ fontSize: '2rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--cane-100)' }}>$49</span>
                <span style={{ color: 'var(--cane-500)', fontSize: '0.8125rem' }}>/month</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.8125rem', color: 'var(--cane-300)' }}>
                <div>Unlimited documents</div>
                <div>3 agents</div>
                <div>Unlimited searches</div>
                <div>Web UI access</div>
                <div>API access</div>
              </div>
            </div>
          </div>

          <p style={{ textAlign: 'center', color: 'var(--cane-600)', fontSize: '0.75rem', marginTop: 16 }}>
            Need a custom setup? <a href="mailto:hello@cane.fyi" style={{ color: 'var(--accent)' }}>Contact us</a>
          </p>
        </div>
      </div>
    </div>
  )
}