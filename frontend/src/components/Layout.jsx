import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Search, FileText, Settings, BarChart3, Shield, Bot, HelpCircle, FlaskConical } from 'lucide-react'

export default function Layout({ children }) {
  const { user, tenant, handleLogout, isAdmin } = useAuth()

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h1>Cane</h1>
          <p style={{ fontSize: '0.7rem', color: 'var(--cane-300, #b8a99a)', marginTop: 2, letterSpacing: '0.05em' }}>
            Operational Intelligence
          </p>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/" end>
            <Bot />
            Agent Builder
          </NavLink>
          <NavLink to="/environments">
            <FlaskConical />
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Environments
              <span style={{
                fontSize: '0.5rem', fontWeight: 700, background: 'var(--accent)', color: 'white',
                padding: '1px 5px', borderRadius: 6, letterSpacing: '0.04em', lineHeight: 1.4,
              }}>BETA</span>
            </span>
          </NavLink>
          <NavLink to="/search">
            <Search /> Search
          </NavLink>
          <NavLink to="/documents">
            <FileText /> Files
          </NavLink>
          <NavLink to="/dashboard">
            <BarChart3 /> Dashboard
          </NavLink>
          <NavLink to="/guide">
            <HelpCircle /> Guide
          </NavLink>
          <NavLink to="/settings">
            <Settings /> Settings
          </NavLink>

          {isAdmin && (
            <>
              <div style={{ height: 16 }} />
              <NavLink to="/admin">
                <Shield /> Admin
              </NavLink>
            </>
          )}
        </nav>

        <div className="sidebar-spacer" />

        <div className="sidebar-footer">
          <div className="user-name">{user?.name || user?.email}</div>
          <div className="user-email">{user?.email}</div>
          <button className="sidebar-logout" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="main-content">
        {children}
      </main>
    </div>
  )
}