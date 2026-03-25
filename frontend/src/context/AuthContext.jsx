import { createContext, useContext, useState, useEffect } from 'react'
import { getMe, setToken, getGuestSession, clearGuestSession, getGuestAgentId } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [tenant, setTenant] = useState(null)
  const [workspaces, setWorkspaces] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('cane_token')
    if (token) {
      getMe()
        .then(data => {
          setUser(data.user)
          setTenant(data.tenant)
          setWorkspaces(data.workspaces || [])
        })
        .catch(() => {
          setToken(null)
        })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  function handleLogin(data) {
    setToken(data.token)
    setUser(data.user)
    setTenant(data.tenant)
  }

  function handleLogout() {
    setToken(null)
    setUser(null)
    setTenant(null)
    setWorkspaces([])
  }

  function updateWorkspaces(ws) {
    setWorkspaces(ws)
  }

  return (
    <AuthContext.Provider value={{
      user, tenant, workspaces, loading,
      handleLogin, handleLogout, updateWorkspaces,
      isAdmin: user?.role === 'admin',
      isOwner: user?.role === 'owner' || user?.role === 'admin',
      isGuest: !user,
      guestSessionId: !user ? getGuestSession() : null,
      guestAgentId: !user ? getGuestAgentId() : null,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
