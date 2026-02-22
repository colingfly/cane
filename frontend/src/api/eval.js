/**
 * api/eval.js — API client for Environments system.
 */
import { getToken } from './client'

const API_BASE = '/api'

async function request(path, options = {}) {
  const token = getToken()
  const headers = { ...options.headers }

  if (token) headers['Authorization'] = `Bearer ${token}`
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })

  if (res.status === 401) {
    localStorage.removeItem('cane_token')
    window.location.href = '/login'
    throw new Error('Session expired')
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail || data.error || `Request failed: ${res.status}`)
  }

  return res.json()
}

// -- Environments --
export const getEnvironments = () => request('/environments')

export const getEnvironment = (id) => request(`/environments/${id}`)

export const createEnvironment = (name, workspaceId, description = '') => {
  const params = new URLSearchParams({ name, workspace_id: workspaceId, description })
  return request(`/environments?${params}`, { method: 'POST' })
}

export const updateEnvironment = (id, data) => {
  const params = new URLSearchParams()
  Object.entries(data).forEach(([k, v]) => { if (v !== undefined) params.set(k, v) })
  return request(`/environments/${id}?${params}`, { method: 'PUT' })
}

export const deleteEnvironment = (id) => request(`/environments/${id}`, { method: 'DELETE' })

// -- Test Cases --
export const addTestCase = (envId, question, expectedAnswer = '', tags = '[]') => {
  const params = new URLSearchParams({ question, expected_answer: expectedAnswer, tags })
  return request(`/environments/${envId}/cases?${params}`, { method: 'POST' })
}

export const updateTestCase = (envId, caseId, data) => {
  const params = new URLSearchParams()
  Object.entries(data).forEach(([k, v]) => { if (v !== undefined) params.set(k, v) })
  return request(`/environments/${envId}/cases/${caseId}?${params}`, { method: 'PUT' })
}

export const deleteTestCase = (envId, caseId) =>
  request(`/environments/${envId}/cases/${caseId}`, { method: 'DELETE' })

export const bulkAddTestCases = (envId, cases) => {
  const params = new URLSearchParams({ cases: JSON.stringify(cases) })
  return request(`/environments/${envId}/cases/bulk?${params}`, { method: 'POST' })
}

export const generateTestCases = (envId, count = 10, difficulty = 'mixed') => {
  const params = new URLSearchParams({ count: count.toString(), difficulty })
  return request(`/environments/${envId}/cases/generate?${params}`, { method: 'POST' })
}

// -- Judge Criteria --
export const getCriteria = (envId) => request(`/environments/${envId}/criteria`)

export const updateCriteria = (envId, criteria) => {
  const params = new URLSearchParams({ criteria: JSON.stringify(criteria) })
  return request(`/environments/${envId}/criteria?${params}`, { method: 'PUT' })
}

// -- Custom Rules --
export const addCustomRule = (envId, ruleText) => {
  const params = new URLSearchParams({ rule_text: ruleText })
  return request(`/environments/${envId}/rules?${params}`, { method: 'POST' })
}

export const deleteCustomRule = (envId, ruleId) =>
  request(`/environments/${envId}/rules/${ruleId}`, { method: 'DELETE' })

// -- Eval Runs --
export const getRuns = (envId) => request(`/environments/${envId}/runs`)

export const triggerRun = (envId) => request(`/environments/${envId}/run`, { method: 'POST' })

export const getRunDetail = (envId, runId) => request(`/environments/${envId}/runs/${runId}`)

export const deleteRun = (envId, runId) => request(`/environments/${envId}/runs/${runId}`, { method: 'DELETE' })