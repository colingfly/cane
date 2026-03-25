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

      {/* Open routes: accessible to everyone (with Layout) */}
      <Route path="/" element={
        <Layout><AgentBuilder /></Layout>
      } />

      <Route path="/search" element={
        <Layout><SearchPage /></Layout>
      } />

      <Route path="/agents/network" element={
        <Layout><AgentNetwork /></Layout>
      } />

      <Route path="/agents/:agentId" element={
        <Layout><AgentDetail /></Layout>
      } />

      <Route path="/environments" element={
        <Layout><Environments /></Layout>
      } />

      <Route path="/environments/:envId" element={
        <Layout><EnvironmentDetail /></Layout>
      } />

      <Route path="/marketplace" element={
        <Layout><Marketplace /></Layout>
      } />

      <Route path="/marketplace/:listingId" element={
        <Layout><MarketplaceDetail /></Layout>
      } />

      <Route path="/guide" element={
        <Layout><Guide /></Layout>
      } />

      <Route path="/api-docs" element={
        <Layout><ApiDocs /></Layout>
      } />

      {/* Protected routes: require account */}
      <Route path="/documents" element={
        <ProtectedRoute>
          <Layout><Documents /></Layout>
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

      <Route path="/demo" element={<Demo />} />
      <Route path="/architecture" element={<Architecture />} />
    </Routes>
  )
}
