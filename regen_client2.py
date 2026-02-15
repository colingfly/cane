"""Regenerate client.js - using chr(96) for backticks to avoid any corruption"""

BT = chr(96)  # backtick character

def tpl(s):
    """Convert 'xxx' to `xxx` template literal"""
    return BT + s + BT

code = f"""/**
 * api/client.js - Fetch wrapper with JWT auth.
 */

const API_BASE = '/api'

function getToken() {{
  return localStorage.getItem('cane_token')
}}

export function setToken(token) {{
  if (token) {{
    localStorage.setItem('cane_token', token)
  }} else {{
    localStorage.removeItem('cane_token')
  }}
}}

async function request(path, options = {{}}) {{
  const token = getToken()
  const headers = {{ ...options.headers }}

  if (token) {{
    headers['Authorization'] = {tpl('Bearer ${token}')}
  }}

  if (!(options.body instanceof FormData) && !headers['Content-Type']) {{
    headers['Content-Type'] = 'application/json'
  }}

  const res = await fetch({tpl('${{API_BASE}}${{path}}')}, {{ ...options, headers }})

  if (res.status === 401) {{
    setToken(null)
    window.location.href = '/login'
    throw new Error('Session expired')
  }}

  if (!res.ok) {{
    const data = await res.json().catch(() => ({{}}))
    throw new Error(data.detail || {tpl('Request failed: ${{res.status}}')})
  }}

  return res.json()
}}

// -- Auth --
export async function login(email, password) {{
  const form = new FormData()
  form.append('email', email)
  form.append('password', password)
  return request('/auth/login', {{ method: 'POST', body: form }})
}}

export async function getMe() {{
  return request('/auth/me')
}}

// -- Workspaces --
export async function getWorkspaces() {{
  return request('/workspaces')
}}

export async function createWorkspace(name, description = '') {{
  const form = new FormData()
  form.append('name', name)
  form.append('description', description)
  return request('/workspaces', {{ method: 'POST', body: form }})
}}

export async function renameWorkspace(workspaceId, name, description = '') {{
  const form = new FormData()
  form.append('name', name)
  form.append('description', description)
  return request({tpl('/workspaces/${{workspaceId}}')}, {{ method: 'PUT', body: form }})
}}

export async function deleteWorkspace(workspaceId) {{
  return request({tpl('/workspaces/${{workspaceId}}')}, {{ method: 'DELETE' }})
}}

// -- Documents --
export async function getDocuments(workspaceId = '') {{
  const params = workspaceId ? {tpl('?workspace_id=${{workspaceId}}')} : ''
  return request({tpl('/documents${{params}}')})
}}

export async function uploadDocument(file, workspaceId) {{
  const form = new FormData()
  form.append('file', file)
  form.append('workspace_id', workspaceId)
  return request('/documents/upload', {{ method: 'POST', body: form }})
}}

export async function deleteDocument(documentId) {{
  return request({tpl('/documents/${{documentId}}')}, {{ method: 'DELETE' }})
}}

// -- Search --
export async function search(query, mode = 'text', n = 10, workspaceId = '') {{
  const params = new URLSearchParams({{ q: query, mode, n, workspace_id: workspaceId }})
  return request({tpl('/search?${{params}}')})
}}

export async function ask(query, n = 5, workspaceId = '') {{
  const params = new URLSearchParams({{ q: query, n, workspace_id: workspaceId }})
  return request({tpl('/ask?${{params}}')})
}}

// -- Stats --
export async function getStats() {{
  return request('/stats')
}}

// -- Team --
export async function getTeam() {{
  return request('/team')
}}

export async function inviteMember(email, name, password, role = 'member') {{
  const form = new FormData()
  form.append('email', email)
  form.append('name', name)
  form.append('password', password)
  form.append('role', role)
  return request('/team/invite', {{ method: 'POST', body: form }})
}}

// -- Admin --
export async function adminGetTenants() {{
  return request('/admin/tenants')
}}

export async function adminGetTenantDetail(tenantId) {{
  return request({tpl('/admin/tenants/${{tenantId}}')})
}}

export async function adminCreateTenant(data) {{
  const form = new FormData()
  Object.entries(data).forEach(([k, v]) => form.append(k, v))
  return request('/admin/tenants', {{ method: 'POST', body: form }})
}}

export async function adminUpdateTenant(tenantId, name, slug = '') {{
  const form = new FormData()
  form.append('name', name)
  if (slug) form.append('slug', slug)
  return request({tpl('/admin/tenants/${{tenantId}}')}, {{ method: 'PUT', body: form }})
}}

export async function adminDeleteTenant(tenantId) {{
  return request({tpl('/admin/tenants/${{tenantId}}')}, {{ method: 'DELETE' }})
}}

export async function adminUpdateUser(tenantId, userId, email, name = '') {{
  const form = new FormData()
  form.append('email', email)
  form.append('name', name)
  return request({tpl('/admin/tenants/${{tenantId}}/users/${{userId}}')}, {{ method: 'PUT', body: form }})
}}

export async function adminDeleteUser(tenantId, userId) {{
  return request({tpl('/admin/tenants/${{tenantId}}/users/${{userId}}')}, {{ method: 'DELETE' }})
}}
"""

with open('frontend/src/api/client.js', 'w', encoding='utf-8') as f:
    f.write(code)

# Verify backticks survived
content = open('frontend/src/api/client.js', encoding='utf-8').read()
bt_count = content.count(chr(96))
paren_bt = content.count('(' + chr(96))
print(f'client.js written: {{bt_count}} backticks, {{paren_bt}} template literal calls')
if paren_bt >= 10:
    print('OK - template literals intact')
else:
    print('WARNING - backticks may be missing')
