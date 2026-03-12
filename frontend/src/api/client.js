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
    throw new Error(data.detail || data.error || `Request failed: ${res.status}`)
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
          else if (data.type === 'tool_status') onMeta?.({ ...data, type: 'tool_status' })
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

export async function generateReplicaPrompt(agentId, personality) {
  return request(`/agents/${agentId}/generate-replica-prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(personality),
  })
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

// -- API Keys --

export async function getApiKeys() {
  return request('/api-keys')
}

export async function createApiKey(name, workspaceId = null) {
  return request('/api-keys', {
    method: 'POST',
    body: JSON.stringify({ name, workspace_id: workspaceId }),
  })
}

export async function deleteApiKey(keyId) {
  return request(`/api-keys/${keyId}`, { method: 'DELETE' })
}

// -- Marketplace --

export async function browseMarketplace(params = {}) {
  const qs = new URLSearchParams()
  if (params.category) qs.set('category', params.category)
  if (params.search) qs.set('search', params.search)
  if (params.sort) qs.set('sort', params.sort)
  return request(`/marketplace?${qs.toString()}`)
}

export async function getMarketplaceListing(listingId) {
  return request(`/marketplace/${listingId}`)
}

export async function publishToMarketplace(workspaceId, environmentId, runId, category, tags, packType) {
  const qs = new URLSearchParams({ workspace_id: workspaceId, category, tags: JSON.stringify(tags), pack_type: packType })
  if (environmentId) qs.set('environment_id', environmentId)
  if (runId) qs.set('run_id', runId)
  return request(`/marketplace/publish?${qs.toString()}`, { method: 'POST' })
}

export async function cloneFromMarketplace(listingId) {
  return request(`/marketplace/${listingId}/clone`, { method: 'POST' })
}

export async function delistFromMarketplace(listingId) {
  return request(`/marketplace/${listingId}`, { method: 'DELETE' })
}

// ─── Agent Tools ───

export async function getTools(workspaceId) {
  return request(`/tools?workspace_id=${workspaceId}`)
}

export async function createTool(workspaceId, config) {
  const qs = new URLSearchParams({
    workspace_id: workspaceId,
    name: config.name,
    description: config.description,
    tool_type: config.tool_type || 'webhook',
    url: config.url,
    method: config.method || 'POST',
    headers: JSON.stringify(config.headers || {}),
    payload_template: JSON.stringify(config.payload_template || {}),
    auth_type: config.auth_type || 'none',
    auth_value: config.auth_value || '',
    parameters: JSON.stringify(config.parameters || []),
    fire_and_forget: config.fire_and_forget !== false,
  })
  return request(`/tools?${qs.toString()}`, { method: 'POST' })
}

export async function updateTool(toolId, config) {
  const qs = new URLSearchParams()
  Object.entries(config).forEach(([k, v]) => {
    if (v !== undefined) {
      qs.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
    }
  })
  return request(`/tools/${toolId}?${qs.toString()}`, { method: 'PUT' })
}

export async function deleteTool(toolId) {
  return request(`/tools/${toolId}`, { method: 'DELETE' })
}

export async function testTool(toolId) {
  return request(`/tools/${toolId}/test`, { method: 'POST' })
}

export async function copyTools(sourceWorkspaceId, targetWorkspaceId) {
  const qs = new URLSearchParams({ source_workspace_id: sourceWorkspaceId, target_workspace_id: targetWorkspaceId })
  return request(`/tools/copy?${qs.toString()}`, { method: 'POST' })
}

// ─── Agent Links (Sub-Agent Orchestration) ───

export async function getAgentLinks(agentId) {
  return request(`/agents/${agentId}/links`)
}

export async function createAgentLink(agentId, data) {
  return request(`/agents/${agentId}/links`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateAgentLink(agentId, linkId, data) {
  return request(`/agents/${agentId}/links/${linkId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteAgentLink(agentId, linkId) {
  return request(`/agents/${agentId}/links/${linkId}`, { method: 'DELETE' })
}

// ─── Agent Schedules ───

export async function getSchedules(agentId) {
  return request(`/agents/${agentId}/schedules`)
}

export async function createSchedule(agentId, data) {
  return request(`/agents/${agentId}/schedules`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateSchedule(agentId, scheduleId, data) {
  return request(`/agents/${agentId}/schedules/${scheduleId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteSchedule(agentId, scheduleId) {
  return request(`/agents/${agentId}/schedules/${scheduleId}`, { method: 'DELETE' })
}

export async function getScheduleRuns(agentId, scheduleId) {
  return request(`/agents/${agentId}/schedules/${scheduleId}/runs`)
}

export async function triggerSchedule(agentId, scheduleId) {
  return request(`/agents/${agentId}/schedules/${scheduleId}/trigger`, { method: 'POST' })
}

// ─── Agent Memories ───

export async function getMemories(agentId, userId = '') {
  const params = userId ? `?user_id=${userId}` : ''
  return request(`/agents/${agentId}/memories${params}`)
}

export async function addMemory(agentId, data) {
  return request(`/agents/${agentId}/memories`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateMemory(agentId, memoryId, data) {
  return request(`/agents/${agentId}/memories/${memoryId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteMemory(agentId, memoryId) {
  return request(`/agents/${agentId}/memories/${memoryId}`, { method: 'DELETE' })
}

export async function clearMemories(agentId) {
  return request(`/agents/${agentId}/memories`, { method: 'DELETE' })
}

// ─── Conversations ───

export async function getConversations(agentId, limit = 50, offset = 0) {
  return request(`/agents/${agentId}/conversations?limit=${limit}&offset=${offset}`)
}

export async function getConversation(agentId, convId) {
  return request(`/agents/${agentId}/conversations/${convId}`)
}

export async function deleteConversation(agentId, convId) {
  return request(`/agents/${agentId}/conversations/${convId}`, { method: 'DELETE' })
}

export async function clearConversations(agentId) {
  return request(`/agents/${agentId}/conversations`, { method: 'DELETE' })
}

// ─── MCP Servers ───

export async function getMcpCatalog() {
  return request('/mcp/catalog')
}

export async function getMcpServers(workspaceId) {
  return request(`/mcp/servers?workspace_id=${workspaceId}`)
}

export async function connectMcpServer(workspaceId, config) {
  const qs = new URLSearchParams({
    workspace_id: workspaceId,
    name: config.name,
    server_url: config.server_url,
    server_type: config.server_type || 'custom',
    icon: config.icon || '🔌',
    auth_type: config.auth_type || 'none',
    auth_header: config.auth_header || 'Authorization',
    auth_value: config.auth_value || '',
  })
  return request(`/mcp/servers?${qs.toString()}`, { method: 'POST' })
}

export async function updateMcpServer(serverId, config) {
  const qs = new URLSearchParams()
  Object.entries(config).forEach(([k, v]) => {
    if (v !== undefined) qs.set(k, String(v))
  })
  return request(`/mcp/servers/${serverId}?${qs.toString()}`, { method: 'PUT' })
}

export async function deleteMcpServer(serverId) {
  return request(`/mcp/servers/${serverId}`, { method: 'DELETE' })
}

export async function syncMcpServer(serverId) {
  return request(`/mcp/servers/${serverId}/sync`, { method: 'POST' })
}

export async function testMcpTool(serverId, toolName, args = '{}') {
  const qs = new URLSearchParams({ tool_name: toolName, arguments: args })
  return request(`/mcp/servers/${serverId}/test?${qs.toString()}`, { method: 'POST' })
}

// ─── Agent Packs ───

export async function getPacks() {
  return request('/packs')
}

export async function getPackDetail(packId) {
  return request(`/packs/${packId}`)
}

export async function clonePack(packId) {
  return request(`/packs/${packId}/clone`, { method: 'POST' })
}

// ─── Analytics ───

export async function getAnalytics(workspaceId, days = 30) {
  return request(`/analytics/${workspaceId}?days=${days}`)
}

export async function submitFeedback(conversationId, vote) {
  return request(`/analytics/feedback?conversation_id=${conversationId}&vote=${vote}`, { method: 'POST' })
}

// ─── Widget Config ───

export async function getWidgetConfig(workspaceId) {
  return request(`/agents/${workspaceId}/widget-config`)
}

export async function updateWidgetConfig(workspaceId, config) {
  return request(`/agents/${workspaceId}/widget-config`, {
    method: 'PUT',
    body: JSON.stringify(config),
  })
}

// ─── Live Connectors (Google Drive) ───

export async function getGdriveAuthUrl(workspaceId) {
  return request(`/connectors/google-drive/auth-url?workspace_id=${workspaceId}`)
}

export async function getGdriveStatus() {
  return request('/connectors/google-drive/status')
}

export async function disconnectGdrive() {
  return request('/connectors/google-drive', { method: 'DELETE' })
}

export async function listDriveFolders(query = '') {
  const params = query ? `?q=${encodeURIComponent(query)}` : ''
  return request(`/connectors/google-drive/folders${params}`)
}

export async function listSyncs(workspaceId) {
  return request(`/connectors/syncs?workspace_id=${workspaceId}`)
}

export async function createSync(workspaceId, folderId, folderName) {
  const qs = new URLSearchParams({ workspace_id: workspaceId, folder_id: folderId, folder_name: folderName })
  return request(`/connectors/syncs?${qs.toString()}`, { method: 'POST' })
}

export async function getSync(syncId) {
  return request(`/connectors/syncs/${syncId}`)
}

export async function triggerSync(syncId) {
  return request(`/connectors/syncs/${syncId}/trigger`, { method: 'POST' })
}

export async function updateSyncStatus(syncId, status) {
  return request(`/connectors/syncs/${syncId}?status=${status}`, { method: 'PUT' })
}

export async function deleteSync(syncId) {
  return request(`/connectors/syncs/${syncId}`, { method: 'DELETE' })
}