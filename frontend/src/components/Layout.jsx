import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Search, Settings, Shield, Bot, HelpCircle, FlaskConical, Store, Share2 } from 'lucide-react'

export default function Layout({ children }) {
  const { user, tenant, handleLogout, isAdmin } = useAuth()

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h1>Cane</h1>
          <p style={{ fontSize: '0.56rem', color: 'rgba(255,255,255,0.3)', marginTop: 8, letterSpacing: '0.12em', fontWeight: 700, textTransform: 'uppercase' }}>
            Agentic AI Platform
          </p>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/" end>
            <Bot />
            Agent Builder
          </NavLink>
          <NavLink to="/agents/network">
            <Share2 />
            Network
          </NavLink>
          <NavLink to="/environments">
            <FlaskConical />
            <span>Evaluations</span>
          </NavLink>
          <NavLink to="/search">
            <Search /> Search
          </NavLink>

          <div style={{ height: 1, background: 'var(--rule)', margin: '8px 12px', opacity: 0.4 }} />

          <NavLink to="/marketplace">
            <Store /> Marketplace <span style={{ fontSize: '0.5rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '1px 5px', borderRadius: 3, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)', marginLeft: 4 }}>Beta</span>
          </NavLink>
          <NavLink to="/guide">
            <HelpCircle /> Docs
          </NavLink>
          <NavLink to="/settings">
            <Settings /> Settings
          </NavLink>

          {isAdmin && (
            <>
              <div style={{ height: 1, background: 'var(--rule)', margin: '8px 12px', opacity: 0.4 }} />
              <NavLink to="/admin">
                <Shield /> Admin
              </NavLink>
            </>
          )}
        </nav>

        <div className="sidebar-spacer" />

        <div className="sidebar-footer">
          {user ? (
            <>
              <div className="user-name">{user.name || user.email}</div>
              <div className="user-email">{user.email}</div>
              <button className="sidebar-logout" onClick={handleLogout}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <div className="user-name" style={{ color: 'rgba(255,255,255,0.5)' }}>Guest session</div>
              <NavLink to="/register" style={{ fontSize: '0.75rem', color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
                Sign up to save your work
              </NavLink>
              <NavLink to="/login" className="sidebar-logout" style={{ textAlign: 'center', display: 'block', marginTop: 4 }}>
                Sign in
              </NavLink>
            </>
          )}
        </div>
      </aside>

      <main className="main-content">
        {children}
      </main>
    </div>
  )
}