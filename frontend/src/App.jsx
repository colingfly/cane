import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import SearchPage from './pages/Search'
import Documents from './pages/Documents'
import Dashboard from './pages/Dashboard'
import SettingsPage from './pages/Settings'
import Admin from './pages/Admin'
import AgentBuilder from './pages/AgentBuilder'
import AgentDetail from './pages/AgentDetail'
import Guide from './pages/Guide'
import ApiDocs from './pages/ApiDocs'
import Demo from './pages/Demo'
import Marketplace from './pages/Marketplace'
import MarketplaceDetail from './pages/MarketplaceDetail'
import Environments from './pages/Environments'
import EnvironmentDetail from './pages/EnvironmentDetail'
import Analytics from './pages/Analytics'
import Architecture from './pages/Architecture'
import ConversationHistory from './pages/ConversationHistory'
import AgentNetwork from './pages/AgentNetwork'
import OsintDashboard from './pages/OsintDashboard'
import OsintSetup from './pages/OsintSetup'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading-center"><div className="spinner" /></div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

function AdminRoute({ children }) {
  const { isAdmin, loading } = useAuth()
  if (loading) return <div className="loading-center"><div className="spinner" /></div>
  if (!isAdmin) return <Navigate to="/" replace />
  return children
}

export default function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="loading-center"><div className="spinner" /></div>
  }

  return (
    <Routes>
      <Route path="/login" element={
        user ? <Navigate to="/" replace /> : <Login />
      } />

      <Route path="/register" element={
        user ? <Navigate to="/" replace /> : <Register />
      } />

      <Route path="/" element={
        user ? (
          <Layout><AgentBuilder /></Layout>
        ) : (
          <Landing />
        )
      } />

      <Route path="/search" element={
        <ProtectedRoute>
          <Layout><SearchPage /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/documents" element={
        <ProtectedRoute>
          <Layout><Documents /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/agents/network" element={
        <ProtectedRoute>
          <Layout><AgentNetwork /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/agents/:agentId" element={
        <ProtectedRoute>
          <Layout><AgentDetail /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/agents/:agentId/conversations" element={
        <ProtectedRoute>
          <Layout><ConversationHistory /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/agents/:agentId/analytics" element={
        <ProtectedRoute>
          <Layout><Analytics /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/agents/:agentId/osint" element={
        <ProtectedRoute>
          <Layout><OsintDashboard /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/osint/setup" element={
        <ProtectedRoute>
          <Layout><OsintSetup /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/dashboard" element={
        <ProtectedRoute>
          <Layout><Dashboard /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/environments" element={
        <ProtectedRoute>
          <Layout><Environments /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/environments/:envId" element={
        <ProtectedRoute>
          <Layout><EnvironmentDetail /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/demo" element={<Demo />} />
      <Route path="/architecture" element={<Architecture />} />

      <Route path="/guide" element={
        user ? (
          <Layout><Guide /></Layout>
        ) : (
          <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: '28px 36px' }}>
            <a href="/" style={{
              color: 'var(--text-muted)', fontSize: '0.8125rem',
              textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4,
              marginBottom: 16,
            }}>
              ← Back to home
            </a>
            <Guide />
          </div>
        )
      } />

      <Route path="/api-docs" element={
        user ? (
          <Layout><ApiDocs /></Layout>
        ) : (
          <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: '28px 36px' }}>
            <a href="/" style={{
              color: 'var(--text-muted)', fontSize: '0.8125rem',
              textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4,
              marginBottom: 16,
            }}>
              ← Back to home
            </a>
            <ApiDocs />
          </div>
        )
      } />

      <Route path="/marketplace" element={
        user ? (
          <Layout><Marketplace /></Layout>
        ) : (
          <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: '28px 36px' }}>
            <a href="/" style={{
              color: 'var(--text-muted)', fontSize: '0.8125rem',
              textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4,
              marginBottom: 16,
            }}>
              ← Back to home
            </a>
            <Marketplace />
          </div>
        )
      } />

      <Route path="/marketplace/:listingId" element={
        user ? (
          <Layout><MarketplaceDetail /></Layout>
        ) : (
          <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: '28px 36px' }}>
            <a href="/" style={{
              color: 'var(--text-muted)', fontSize: '0.8125rem',
              textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4,
              marginBottom: 16,
            }}>
              ← Back to home
            </a>
            <MarketplaceDetail />
          </div>
        )
      } />

      <Route path="/settings" element={
        <ProtectedRoute>
          <Layout><SettingsPage /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/admin" element={
        <AdminRoute>
          <Layout><Admin /></Layout>
        </AdminRoute>
      } />
    </Routes>
  )
}