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

// -- Webhook --
export const testWebhook = (envId) => request(`/environments/${envId}/webhook/test`, { method: 'POST' })

// -- External Agent Target --
export const testTarget = (envId) => request(`/environments/${envId}/target/test`, { method: 'POST' })

// -- Dataset Export --
export const exportRun = async (envId, runId, format = 'sft', minScore = 0) => {
  const token = getToken()
  const params = new URLSearchParams({ format, min_score: minScore.toString() })
  const res = await fetch(`/api/environments/${envId}/runs/${runId}/export?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Export failed: ${res.status}`)
  }
  const text = await res.text()
  return text
}

export const exportCrossRunDpo = (envId, minChosen = 80, maxRejected = 60) => {
  const params = new URLSearchParams({ min_chosen_score: minChosen.toString(), max_rejected_score: maxRejected.toString() })
  return request(`/environments/${envId}/export/cross-run?${params}`)
}

export const getExportStats = (envId) => request(`/environments/${envId}/export/stats`)

// -- Fine-tuning --
export const generateDataset = (envId, format = 'openai', minScore = 80) => {
  const params = new URLSearchParams({ environment_id: envId, format, min_score: minScore.toString() })
  return request(`/finetune/generate-dataset?${params}`, { method: 'POST' })
}

export const submitFinetune = (envId, model = 'gpt-4o-mini-2024-07-18', minScore = 80, nEpochs = 3) => {
  const params = new URLSearchParams({
    environment_id: envId, model, min_score: minScore.toString(), n_epochs: nEpochs.toString(),
  })
  return request(`/finetune/submit?${params}`, { method: 'POST' })
}

export const getFinetuneStatus = (jobId) => request(`/finetune/jobs/${jobId}`)

export const listFinetuneJobs = () => request('/finetune/jobs')

export const cancelFinetune = (jobId) => request(`/finetune/jobs/${jobId}/cancel`, { method: 'POST' })

export const getFinetuneEvents = (jobId) => request(`/finetune/jobs/${jobId}/events`)

export const compareModels = (question, baseModel, ftModel, systemPrompt = '') => {
  const params = new URLSearchParams({ question, base_model: baseModel, fine_tuned_model: ftModel })
  if (systemPrompt) params.set('system_prompt', systemPrompt)
  return request(`/finetune/compare?${params}`, { method: 'POST' })
}

// -- Eval Analytics --
export const getAnalyticsDashboard = (envId) => request(`/environments/${envId}/analytics/dashboard`)

export const getScoreTrends = (envId) => request(`/environments/${envId}/analytics/trends`)

export const getRegressions = (envId, baseRunId, compareRunId, threshold = 10) => {
  const params = new URLSearchParams({ threshold: threshold.toString() })
  if (baseRunId) params.set('base_run_id', baseRunId)
  if (compareRunId) params.set('compare_run_id', compareRunId)
  return request(`/environments/${envId}/analytics/regressions?${params}`)
}

export const getCategoryBreakdown = (envId, runId) => {
  const params = runId ? `?run_id=${runId}` : ''
  return request(`/environments/${envId}/analytics/categories${params}`)
}

export const getLatencyAnalysis = (envId, runId) => {
  const params = runId ? `?run_id=${runId}` : ''
  return request(`/environments/${envId}/analytics/latency${params}`)
}

export const getFailurePatterns = (envId, runId) => {
  const params = runId ? `?run_id=${runId}` : ''
  return request(`/environments/${envId}/analytics/failure-patterns${params}`)
}

export const getConsistencyAnalysis = (envId) => request(`/environments/${envId}/analytics/consistency`)

export const getDriftAnalysis = (envId) => request(`/environments/${envId}/analytics/drift`)

export const getCriteriaBreakdown = (envId, runId) => {
  const params = runId ? `?run_id=${runId}` : ''
  return request(`/environments/${envId}/analytics/criteria-breakdown${params}`)
}

// -- Fine-tune Lineage --
export const getFinetuneLineage = (envId) => {
  const params = envId ? `?environment_id=${envId}` : ''
  return request(`/finetune/lineage${params}`)
}

// -- Agent Versioning --
export const createAgentVersion = (workspaceId, label = '') => {
  const params = label ? `?label=${encodeURIComponent(label)}` : ''
  return request(`/agents/${workspaceId}/versions${params}`, { method: 'POST' })
}

export const getAgentVersions = (workspaceId) => request(`/agents/${workspaceId}/versions`)

export const getAgentVersion = (workspaceId, versionId) =>
  request(`/agents/${workspaceId}/versions/${versionId}`)

export const rollbackAgentVersion = (workspaceId, versionId) =>
  request(`/agents/${workspaceId}/versions/${versionId}/rollback`, { method: 'POST' })

// -- Execution Tracing --
export const getAgentTraces = (workspaceId, limit = 50) =>
  request(`/agents/${workspaceId}/traces?limit=${limit}`)

export const getSessionTrace = (workspaceId, sessionId) =>
  request(`/agents/${workspaceId}/traces/session/${sessionId}`)

export const getTraceAnalytics = (workspaceId, days = 30) =>
  request(`/agents/${workspaceId}/traces/analytics?days=${days}`)

// -- Failure Mining --
export const triggerMining = (envId, maxScore = 60, maxExamples = 100) => {
  const params = new URLSearchParams({ max_score: maxScore.toString(), max_examples: maxExamples.toString() })
  return request(`/environments/${envId}/mine?${params}`, { method: 'POST' })
}

export const getMiningJobs = (envId) => request(`/environments/${envId}/mining-jobs`)

export const getMiningJobDetail = (envId, jobId) =>
  request(`/environments/${envId}/mining-jobs/${jobId}`)

export const exportMinedData = async (envId, jobId, format = 'dpo') => {
  const token = getToken()
  const params = new URLSearchParams({ format })
  const res = await fetch(`${API_BASE}/environments/${envId}/mining-jobs/${jobId}/export?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Export failed: ${res.status}`)
  }
  return res.text()
}

export const deleteMiningJob = (envId, jobId) =>
  request(`/environments/${envId}/mining-jobs/${jobId}`, { method: 'DELETE' })