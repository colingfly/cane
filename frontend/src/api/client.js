/**
 * api/client.js - Fetch wrapper with JWT auth.
 */

const API_BASE = '/api'

export function getToken() {
  return localStorage.getItem('cane_token')
}

export function setToken(token) {
  if (token) {
    localStorage.setItem('cane_token', token)
  } else {
    localStorage.removeItem('cane_token')
  }
}

async function request(path, options = {}) {
  const token = getToken()
  const headers = { ...options.headers }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })

  if (res.status === 401) {
    setToken(null)
    window.location.href = '/login'
    throw new Error('Session expired')
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail || `Request failed: ${res.status}`)
  }

  return res.json()
}

// -- Auth --
export async function login(email, password) {
  const form = new FormData()
  form.append('email', email)
  form.append('password', password)
  return request('/auth/login', { method: 'POST', body: form })
}

export async function register(email, password, name = '', companyName = '') {
  const form = new FormData()
  form.append('email', email)
  form.append('password', password)
  form.append('name', name)
  form.append('company_name', companyName)
  return request('/auth/register', { method: 'POST', body: form })
}

export async function getMe() {
  return request('/auth/me')
}

// -- Workspaces --
export async function getWorkspaces() {
  return request('/workspaces')
}

export async function createWorkspace(name, description = '') {
  const form = new FormData()
  form.append('name', name)
  form.append('description', description)
  return request('/workspaces', { method: 'POST', body: form })
}

export async function renameWorkspace(workspaceId, name, description = '') {
  const form = new FormData()
  form.append('name', name)
  form.append('description', description)
  return request(`/workspaces/${workspaceId}`, { method: 'PUT', body: form })
}

export async function deleteWorkspace(workspaceId) {
  return request(`/workspaces/${workspaceId}`, { method: 'DELETE' })
}

// -- Documents --
export async function getDocuments(workspaceId = '') {
  const params = workspaceId ? `?workspace_id=${workspaceId}` : ''
  return request(`/documents${params}`)
}

export async function uploadDocument(file, workspaceId) {
  const form = new FormData()
  form.append('file', file)
  form.append('workspace_id', workspaceId)
  return request('/documents/upload', { method: 'POST', body: form })
}

export async function deleteDocument(documentId) {
  return request(`/documents/${documentId}`, { method: 'DELETE' })
}

export async function getDocumentStatus(documentId) {
  return request(`/documents/${documentId}/status`)
}

// -- Search --
export async function search(query, mode = 'text', n = 10, workspaceId = '') {
  const params = new URLSearchParams({ q: query, mode, n, workspace_id: workspaceId })
  return request(`/search?${params}`)
}

export async function ask(query, n = 5, workspaceId = '') {
  const params = new URLSearchParams({ q: query, n, workspace_id: workspaceId })
  return request(`/ask?${params}`)
}

// Generate a session ID for conversation memory
let _sessionId = null
export function getSessionId() {
  if (!_sessionId) {
    _sessionId = 'sess_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
  }
  return _sessionId
}

export function resetSession() {
  _sessionId = null
}

export async function askStream(query, n = 5, workspaceId = '', onText, onMeta, onDone, onError) {
  const token = getToken()
  const sessionId = getSessionId()
  const params = new URLSearchParams({ q: query, n, workspace_id: workspaceId, session_id: sessionId })

  try {
    const res = await fetch(`${API_BASE}/ask/stream?${params}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })

    if (res.status === 401) {
      setToken(null)
      window.location.href = '/login'
      return
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      onError?.(data.error || data.detail || `Request failed: ${res.status}`)
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() // keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        try {
          const data = JSON.parse(trimmed.slice(6))
          if (data.type === 'text') onText?.(data.text)
          else if (data.type === 'meta') onMeta?.(data)
          else if (data.type === 'done') onDone?.()
          else if (data.type === 'error') onError?.(data.error)
        } catch {
          // ignore malformed events
        }
      }
    }
  } catch (err) {
    onError?.(err.message || 'Stream failed')
  }
}

// -- Stats --
export async function getStats() {
  return request('/stats')
}

// -- Agents --
export async function getAgentTemplates() {
  return request('/agents/templates')
}

export async function getAgents() {
  return request('/agents')
}

export async function getAgent(agentId) {
  return request(`/agents/${agentId}`)
}

export async function createAgent(data) {
  const form = new FormData()
  Object.entries(data).forEach(([k, v]) => { if (v !== undefined && v !== null) form.append(k, v) })
  return request('/agents', { method: 'POST', body: form })
}

export async function updateAgent(agentId, data) {
  const form = new FormData()
  Object.entries(data).forEach(([k, v]) => { if (v !== undefined && v !== null) form.append(k, String(v)) })
  return request(`/agents/${agentId}`, { method: 'PUT', body: form })
}

export async function deleteAgent(agentId) {
  return request(`/agents/${agentId}`, { method: 'DELETE' })
}

export async function generateAgentPrompt(agentId) {
  return request(`/agents/${agentId}/generate-prompt`, { method: 'POST' })
}

// -- Team --
export async function getTeam() {
  return request('/team')
}

export async function inviteMember(email, name, password, role = 'member') {
  const form = new FormData()
  form.append('email', email)
  form.append('name', name)
  form.append('password', password)
  form.append('role', role)
  return request('/team/invite', { method: 'POST', body: form })
}

// -- Admin --
export async function adminGetTenants() {
  return request('/admin/tenants')
}

export async function adminGetTenantDetail(tenantId) {
  return request(`/admin/tenants/${tenantId}`)
}

export async function adminCreateTenant(data) {
  const form = new FormData()
  Object.entries(data).forEach(([k, v]) => form.append(k, v))
  return request('/admin/tenants', { method: 'POST', body: form })
}

export async function adminUpdateTenant(tenantId, name, slug = '') {
  const form = new FormData()
  form.append('name', name)
  if (slug) form.append('slug', slug)
  return request(`/admin/tenants/${tenantId}`, { method: 'PUT', body: form })
}

export async function adminDeleteTenant(tenantId) {
  return request(`/admin/tenants/${tenantId}`, { method: 'DELETE' })
}

export async function adminUpdateUser(tenantId, userId, email, name = '') {
  const form = new FormData()
  form.append('email', email)
  form.append('name', name)
  return request(`/admin/tenants/${tenantId}/users/${userId}`, { method: 'PUT', body: form })
}

export async function adminDeleteUser(tenantId, userId) {
  return request(`/admin/tenants/${tenantId}/users/${userId}`, { method: 'DELETE' })
}

export async function changePassword(currentPassword, newPassword) {
  const form = new FormData()
  form.append('current_password', currentPassword)
  form.append('new_password', newPassword)
  return request('/auth/password', { method: 'POST', body: form })
}