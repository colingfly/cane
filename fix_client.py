"""Fix client.js - restore template literals that PowerShell destroyed"""

p = 'frontend/src/api/client.js'
c = open(p, encoding='utf-8').read()

# Remove the broken functions
cut_marker = 'export async function adminUpdateTenant'
idx = c.find(cut_marker)
if idx > 0:
    c = c[:idx].rstrip() + '\n'

# Also fix any other broken template literals
# The adminGetTenantDetail function is also broken
c = c.replace(
    "return request`/admin/tenants/${tenantId}`)",
    "return request(`/admin/tenants/${tenantId}`)"
)

# Add clean functions with proper backtick template literals
new_code = """
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
"""

c = c.rstrip() + '\n' + new_code
open(p, 'w', encoding='utf-8').write(c)
print('Fixed client.js')
