import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
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
import Environments from './pages/Environments'

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
        <ProtectedRoute>
          <Layout><AgentBuilder /></Layout>
        </ProtectedRoute>
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

      <Route path="/agents/:agentId" element={
        <ProtectedRoute>
          <Layout><AgentDetail /></Layout>
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

      <Route path="/guide" element={
        <ProtectedRoute>
          <Layout><Guide /></Layout>
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
    </Routes>
  )
}