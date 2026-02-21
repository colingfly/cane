import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Search, FileText, Settings, BarChart3, Shield, Bot, HelpCircle, FlaskConical, Store } from 'lucide-react'

export default function Layout({ children }) {
  const { user, tenant, handleLogout, isAdmin } = useAuth()

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h1>Cane</h1>
          <p style={{ fontSize: '0.56rem', color: 'var(--cane-700)', marginTop: 8, letterSpacing: '0.12em', fontWeight: 700, textTransform: 'uppercase' }}>
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
            <span>Environments</span>
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
          <NavLink to="/marketplace">
            <Store /> Marketplace
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