import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  FlaskConical, ArrowLeft, Plus, Trash2, Check, X, Play, Bell,
  SlidersHorizontal, ListChecks, BarChart3, Settings, Sparkles, Wand2,
  Globe, Zap, Download, Brain, Loader2, TrendingUp, TrendingDown, AlertTriangle,
  Activity, Target, GitBranch, Clock, ToggleLeft, ToggleRight, Search,
} from 'lucide-react'
import {
  getEnvironment, updateEnvironment,
  addTestCase, updateTestCase, deleteTestCase,
  updateCriteria, addCustomRule, deleteCustomRule,
  getRuns, triggerRun, getRunDetail, deleteRun,
  generateTestCases, testWebhook, testTarget,
  exportRun, getExportStats,
  generateDataset, submitFinetune, listFinetuneJobs,
  getFinetuneStatus, cancelFinetune, getFinetuneEvents,
  getAnalyticsDashboard, getRegressions, getCategoryBreakdown,
  getFailurePatterns, getConsistencyAnalysis, getCriteriaBreakdown,
  triggerMining, getMiningJobs, getMiningJobDetail, exportMinedData, deleteMiningJob,
  getEvalSchedule, saveEvalSchedule, deleteEvalSchedule, triggerScheduleNow,
  runBatchRCA, runTargetedRCA,
} from '../api/eval'
import { getAgents } from '../api/client'
import PersonalityProfile from '../components/PersonalityProfile'

const TABS = [
  { id: 'setup', label: 'Setup', icon: Settings },
  { id: 'cases', label: 'Test Cases', icon: ListChecks },
  { id: 'criteria', label: 'Judge Criteria', icon: SlidersHorizontal },
  { id: 'results', label: 'Results', icon: BarChart3 },
  { id: 'analytics', label: 'Analytics', icon: Activity },
  { id: 'personality', label: 'Personality', icon: Sparkles },
  { id: 'schedule', label: 'Schedule', icon: Clock },
  { id: 'training', label: 'Training Data', icon: Brain },
]

export default function EnvironmentDetail() {
  const { envId } = useParams()
  const navigate = useNavigate()
  const [env, setEnv] = useState(null)
  const [agents, setAgents] = useState([])
  const [tab, setTab] = useState('setup')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Setup state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [workspaceId, setWorkspaceId] = useState('')

  // Test case form
  const [showAddCase, setShowAddCase] = useState(false)
  const [newQuestion, setNewQuestion] = useState('')
  const [newExpected, setNewExpected] = useState('')
  const [newTags, setNewTags] = useState('')
  const [editingCase, setEditingCase] = useState(null)

  // Custom rule form
  const [newRule, setNewRule] = useState('')

  // Auto-generate
  const [showGenerate, setShowGenerate] = useState(false)
  const [genCount, setGenCount] = useState(10)
  const [genDifficulty, setGenDifficulty] = useState('mixed')
  const [generating, setGenerating] = useState(false)

  // Webhook state
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookHeaders, setWebhookHeaders] = useState('{}')
  const [webhookEnabled, setWebhookEnabled] = useState(false)
  const [webhookTesting, setWebhookTesting] = useState(false)
  const [webhookTestResult, setWebhookTestResult] = useState(null)

  // External agent target state
  const [targetType, setTargetType] = useState('internal')
  const [targetUrl, setTargetUrl] = useState('')
  const [targetMethod, setTargetMethod] = useState('POST')
  const [targetHeaders, setTargetHeaders] = useState('{}')
  const [targetPayloadTemplate, setTargetPayloadTemplate] = useState('{"message": "{{question}}"}')
  const [targetResponsePath, setTargetResponsePath] = useState('response')
  const [isPublic, setIsPublic] = useState(false)
  const [targetTesting, setTargetTesting] = useState(false)
  const [targetTestResult, setTargetTestResult] = useState(null)

  // Training data state
  const [exportStats, setExportStats] = useState(null)
  const [exportFormat, setExportFormat] = useState('openai')
  const [exportMinScore, setExportMinScore] = useState(80)
  const [exporting, setExporting] = useState(false)
  const [datasetPreview, setDatasetPreview] = useState(null)
  const [ftModel, setFtModel] = useState('gpt-4o-mini-2024-07-18')
  const [ftEpochs, setFtEpochs] = useState(3)
  const [ftMinScore, setFtMinScore] = useState(80)
  const [ftSubmitting, setFtSubmitting] = useState(false)
  const [ftJobs, setFtJobs] = useState([])
  const [ftJobDetail, setFtJobDetail] = useState(null)
  const [ftPolling, setFtPolling] = useState(null)

  // Mining state
  const [miningJobs, setMiningJobs] = useState([])
  const [miningMaxScore, setMiningMaxScore] = useState(60)
  const [miningRunning, setMiningRunning] = useState(false)
  const [miningDetail, setMiningDetail] = useState(null)
  const [miningExpanded, setMiningExpanded] = useState(null)

  // Schedule state
  const [schedule, setSchedule] = useState(null)
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [scheduleForm, setScheduleForm] = useState({
    is_enabled: true,
    schedule_type: 'daily',
    daily_time: '09:00',
    interval_hours: 24,
    auto_mine: false,
    mine_max_score: 60,
    notify_on_regression: true,
  })

  // Analytics state
  const [analyticsDash, setAnalyticsDash] = useState(null)
  const [analyticsView, setAnalyticsView] = useState('dashboard')
  const [regressions, setRegressions] = useState(null)
  const [categories, setCategories] = useState(null)
  const [failurePatterns, setFailurePatterns] = useState(null)
  const [consistency, setConsistency] = useState(null)
  const [criteriaBreakdown, setCriteriaBreakdown] = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)

  // Root Cause Analysis state
  const [rcaResult, setRcaResult] = useState(null)
  const [rcaLoading, setRcaLoading] = useState(false)
  const [rcaMaxScore, setRcaMaxScore] = useState(60)
  const [rcaTargeted, setRcaTargeted] = useState(null)
  const [rcaTargetedLoading, setRcaTargetedLoading] = useState(null)

  // Run state
  const [running, setRunning] = useState(false)
  const [activeRunId, setActiveRunId] = useState(null)
  const [runDetail, setRunDetail] = useState(null)
  const [expandedResult, setExpandedResult] = useState(null)

  useEffect(() => {
    loadEnv()
  }, [envId])

  // Poll for run completion
  useEffect(() => {
    if (!activeRunId || !running) return
    const interval = setInterval(async () => {
      try {
        const detail = await getRunDetail(envId, activeRunId)
        setRunDetail(detail)
        if (detail.status === 'completed' || detail.status === 'failed') {
          setRunning(false)
          setActiveRunId(null)
          await loadEnv()  // refresh run list
        }
      } catch (err) {
        console.error(err)
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [activeRunId, running, envId])

  // Load schedule when tab switches to schedule
  useEffect(() => {
    if (tab !== 'schedule' || !envId) return
    setScheduleLoading(true)
    getEvalSchedule(envId).then(res => {
      setSchedule(res.schedule)
      if (res.schedule) {
        setScheduleForm({
          is_enabled: res.schedule.is_enabled,
          schedule_type: res.schedule.schedule_type || 'daily',
          daily_time: res.schedule.daily_time || '09:00',
          interval_hours: res.schedule.interval_hours || 24,
          auto_mine: res.schedule.auto_mine || false,
          mine_max_score: res.schedule.mine_max_score || 60,
          notify_on_regression: res.schedule.notify_on_regression !== false,
        })
      }
    }).catch(console.error).finally(() => setScheduleLoading(false))
  }, [tab, envId])

  async function loadEnv() {
    try {
      const [envRes, agentRes] = await Promise.all([getEnvironment(envId), getAgents()])
      setEnv(envRes)
      setAgents(agentRes.agents || [])
      setName(envRes.name)
      setDescription(envRes.description || '')
      setWorkspaceId(envRes.workspace_id)
      setWebhookUrl(envRes.webhook_url || '')
      setWebhookHeaders(envRes.webhook_headers || '{}')
      setWebhookEnabled(envRes.webhook_enabled || false)
      setTargetType(envRes.target_type || 'internal')
      setTargetUrl(envRes.target_url || '')
      setTargetMethod(envRes.target_method || 'POST')
      setTargetHeaders(envRes.target_headers || '{}')
      setTargetPayloadTemplate(envRes.target_payload_template || '{"message": "{{question}}"}')
      setTargetResponsePath(envRes.target_response_path || 'response')
      setIsPublic(envRes.is_public || false)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveSetup() {
    setSaving(true)
    try {
      const data = {}
      if (name !== env.name) data.name = name
      if (description !== (env.description || '')) data.description = description
      if (workspaceId !== env.workspace_id) data.workspace_id = workspaceId
      if (webhookUrl !== (env.webhook_url || '')) data.webhook_url = webhookUrl
      if (webhookHeaders !== (env.webhook_headers || '{}')) data.webhook_headers = webhookHeaders
      if (webhookEnabled !== (env.webhook_enabled || false)) data.webhook_enabled = webhookEnabled
      if (targetType !== (env.target_type || 'internal')) data.target_type = targetType
      if (targetUrl !== (env.target_url || '')) data.target_url = targetUrl
      if (targetMethod !== (env.target_method || 'POST')) data.target_method = targetMethod
      if (targetHeaders !== (env.target_headers || '{}')) data.target_headers = targetHeaders
      if (targetPayloadTemplate !== (env.target_payload_template || '{"message": "{{question}}"}')) data.target_payload_template = targetPayloadTemplate
      if (targetResponsePath !== (env.target_response_path || 'response')) data.target_response_path = targetResponsePath
      if (isPublic !== (env.is_public || false)) data.is_public = isPublic
      if (Object.keys(data).length > 0) {
        const updated = await updateEnvironment(envId, data)
        setEnv(updated)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function handleAddCase(e) {
    e.preventDefault()
    if (!newQuestion.trim()) return
    try {
      const tags = newTags.trim()
        ? JSON.stringify(newTags.split(',').map(t => t.trim()).filter(Boolean))
        : '[]'
      await addTestCase(envId, newQuestion.trim(), newExpected.trim(), tags)
      setNewQuestion('')
      setNewExpected('')
      setNewTags('')
      setShowAddCase(false)
      await loadEnv()
    } catch (err) {
      console.error(err)
    }
  }

  async function handleUpdateCase(caseId, data) {
    try {
      await updateTestCase(envId, caseId, data)
      setEditingCase(null)
      await loadEnv()
    } catch (err) {
      console.error(err)
    }
  }

  async function handleDeleteCase(caseId) {
    if (!confirm('Delete this test case?')) return
    try {
      await deleteTestCase(envId, caseId)
      await loadEnv()
    } catch (err) {
      console.error(err)
    }
  }

  async function handleGenerate() {
    setGenerating(true)
    try {
      const res = await generateTestCases(envId, genCount, genDifficulty)
      setShowGenerate(false)
      await loadEnv()
      alert(`Generated ${res.generated} test cases!`)
    } catch (err) {
      alert(err.message || 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  async function handleCriteriaChange(id, field, value) {
    const updated = env.criteria.map(c =>
      c.id === id ? { ...c, [field]: value } : c
    )
    setEnv({ ...env, criteria: updated })
  }

  async function handleSaveCriteria() {
    setSaving(true)
    try {
      const payload = env.criteria.map(c => ({
        id: c.id,
        weight: c.weight,
        is_enabled: c.is_enabled,
      }))
      const res = await updateCriteria(envId, payload)
      setEnv(prev => ({ ...prev, criteria: res.criteria }))
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function handleAddRule(e) {
    e.preventDefault()
    if (!newRule.trim()) return
    try {
      await addCustomRule(envId, newRule.trim())
      setNewRule('')
      await loadEnv()
    } catch (err) {
      console.error(err)
    }
  }

  async function handleDeleteRule(ruleId) {
    try {
      await deleteCustomRule(envId, ruleId)
      await loadEnv()
    } catch (err) {
      console.error(err)
    }
  }

  async function handleRun() {
    setRunning(true)
    setRunDetail(null)
    setExpandedResult(null)
    setTab('results')
    try {
      const res = await triggerRun(envId)
      setActiveRunId(res.run_id)
    } catch (err) {
      alert(err.message)
      setRunning(false)
    }
  }

  async function handleViewRun(runId) {
    try {
      const detail = await getRunDetail(envId, runId)
      setRunDetail(detail)
      setExpandedResult(null)
    } catch (err) {
      console.error(err)
    }
  }

  async function handleDeleteRun(e, runId) {
    e.stopPropagation()
    if (!confirm('Delete this run?')) return
    try {
      await deleteRun(envId, runId)
      if (runDetail?.id === runId) setRunDetail(null)
      await loadEnv()
    } catch (err) {
      console.error(err)
    }
  }

  if (loading) return <div className="loading-center"><div className="spinner" /></div>
  if (!env) return <div className="empty-state"><h3>Evaluation not found</h3></div>

  const enabledCriteria = env.criteria?.filter(c => c.is_enabled) || []
  const totalWeight = enabledCriteria.reduce((s, c) => s + c.weight, 0)

  return (
    <div className="fade-in">
      {/* Header */}
      <button
        className="btn btn-ghost"
        onClick={() => navigate('/environments')}
        style={{ marginBottom: 16, gap: 6 }}
      >
        <ArrowLeft size={14} /> Back to Evaluations
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: 'var(--accent-muted)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--accent)',
        }}>
          <FlaskConical size={22} />
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em' }}>{env.name}</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
            Testing: {env.workspace_name}
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleRun}
          disabled={running || !env.test_cases?.length}
          style={{ gap: 8 }}
        >
          {running ? (
            <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Running...</>
          ) : (
            <><Play size={15} /> Run Evaluation</>
          )}
        </button>
      </div>

      {/* Tabs */}
      <div className="workspace-tabs" style={{ marginBottom: 24 }}>
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              className={`workspace-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Icon size={14} /> {t.label}
              {t.id === 'cases' && env.test_cases?.length > 0 && (
                <span style={{ fontSize: '0.7rem', opacity: 0.6, marginLeft: 2 }}>{env.test_cases.length}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* ═══ SETUP TAB ═══ */}
      {tab === 'setup' && (
        <div className="card">
          <h3 style={{ marginBottom: 20 }}>Evaluation Details</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label>Name</label>
              <input className="form-input" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Linked Agent</label>
              <select className="form-input" value={workspaceId} onChange={e => setWorkspaceId(e.target.value)}>
                {agents.map(a => (
                  <option key={a.id} value={a.id}>{a.icon} {a.name} ({a.document_count} files)</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Description</label>
            <input
              className="form-input"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What does this evaluation test?"
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={handleSaveSetup}
            disabled={saving}
            style={{ marginTop: 8 }}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>

          {/* ─── Agent Target ─── */}
          <div style={{ marginTop: 32, borderTop: '1px solid var(--border)', paddingTop: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Globe size={16} style={{ color: 'var(--cane-600)' }} />
                  Agent Target
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  Evaluate a Cane agent or any external agent via HTTP endpoint.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '8px 16px', borderRadius: 8, border: targetType === 'internal' ? '2px solid var(--cane-600)' : '1px solid var(--border)', background: targetType === 'internal' ? 'rgba(37, 99, 235, 0.08)' : 'transparent' }}>
                <input type="radio" name="targetType" checked={targetType === 'internal'} onChange={() => setTargetType('internal')} style={{ display: 'none' }} />
                <Zap size={14} />
                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Cane Agent</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '8px 16px', borderRadius: 8, border: targetType === 'external' ? '2px solid var(--cane-600)' : '1px solid var(--border)', background: targetType === 'external' ? 'rgba(37, 99, 235, 0.08)' : 'transparent' }}>
                <input type="radio" name="targetType" checked={targetType === 'external'} onChange={() => setTargetType('external')} style={{ display: 'none' }} />
                <Globe size={14} />
                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>External Agent (HTTP)</span>
              </label>
            </div>

            {targetType === 'external' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12 }}>
                  <div className="form-group">
                    <label>Endpoint URL</label>
                    <input
                      className="form-input"
                      value={targetUrl}
                      onChange={e => { setTargetUrl(e.target.value); setTargetTestResult(null) }}
                      placeholder="https://api.example.com/v1/chat"
                    />
                  </div>
                  <div className="form-group">
                    <label>Method</label>
                    <select className="form-input" value={targetMethod} onChange={e => setTargetMethod(e.target.value)} style={{ width: 100 }}>
                      <option value="POST">POST</option>
                      <option value="GET">GET</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Auth Headers (JSON)</label>
                  <textarea
                    className="form-input"
                    value={targetHeaders}
                    onChange={e => setTargetHeaders(e.target.value)}
                    placeholder='{"Authorization": "Bearer your-api-key"}'
                    rows={2}
                    style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}
                  />
                </div>
                <div className="form-group">
                  <label>Payload Template</label>
                  <textarea
                    className="form-input"
                    value={targetPayloadTemplate}
                    onChange={e => setTargetPayloadTemplate(e.target.value)}
                    rows={3}
                    style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}
                  />
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    Use {'{{question}}'} as the placeholder for the test case question.
                  </div>
                </div>
                <div className="form-group">
                  <label>Response Path</label>
                  <input
                    className="form-input"
                    value={targetResponsePath}
                    onChange={e => setTargetResponsePath(e.target.value)}
                    placeholder="response"
                  />
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    Dot-notation path to extract the answer from the JSON response. Example: data.choices.0.message.content
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    className="btn btn-secondary"
                    onClick={async () => {
                      setTargetTesting(true)
                      setTargetTestResult(null)
                      try {
                        await updateEnvironment(envId, {
                          target_type: targetType,
                          target_url: targetUrl,
                          target_method: targetMethod,
                          target_headers: targetHeaders,
                          target_payload_template: targetPayloadTemplate,
                          target_response_path: targetResponsePath,
                        })
                        const res = await testTarget(envId)
                        setTargetTestResult({ ok: true, answer: res.extracted_answer, time: res.response_time_ms })
                      } catch (err) {
                        setTargetTestResult({ ok: false, error: err.message })
                      } finally {
                        setTargetTesting(false)
                      }
                    }}
                    disabled={targetTesting || !targetUrl.trim()}
                    style={{ fontSize: '0.82rem' }}
                  >
                    {targetTesting ? 'Testing...' : 'Test Connection'}
                  </button>
                  {targetTestResult && (
                    <span style={{
                      fontSize: '0.82rem',
                      color: targetTestResult.ok ? '#16a34a' : '#dc2626',
                      fontWeight: 600,
                    }}>
                      {targetTestResult.ok
                        ? `Connected (${targetTestResult.time}ms)`
                        : `Failed: ${targetTestResult.error}`
                      }
                    </span>
                  )}
                </div>
                {targetTestResult?.ok && targetTestResult.answer && (
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, fontSize: '0.82rem' }}>
                    <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-muted)' }}>Extracted Response:</div>
                    <div style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {targetTestResult.answer}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Public eval suite toggle */}
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={isPublic}
                onChange={e => setIsPublic(e.target.checked)}
                style={{ width: 16, height: 16 }}
                id="is-public"
              />
              <label htmlFor="is-public" style={{ fontSize: '0.85rem', cursor: 'pointer' }}>
                <span style={{ fontWeight: 600 }}>Public eval suite</span>
                <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>
                  Allow anyone with an API key to run evaluations against this suite
                </span>
              </label>
            </div>
          </div>

          {/* ─── Webhook Notifications ─── */}
          <div style={{ marginTop: 32, borderTop: '1px solid var(--border)', paddingTop: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Bell size={16} style={{ color: 'var(--cane-600)' }} />
                  Webhook Notifications
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  Send a webhook when eval runs complete with failed checks.
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={webhookEnabled}
                  onChange={e => setWebhookEnabled(e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Enabled</span>
              </label>
            </div>

            {webhookEnabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="form-group">
                  <label>Webhook URL</label>
                  <input
                    className="form-input"
                    value={webhookUrl}
                    onChange={e => { setWebhookUrl(e.target.value); setWebhookTestResult(null) }}
                    placeholder="https://hooks.slack.com/services/... or any POST endpoint"
                  />
                </div>
                <div className="form-group">
                  <label>Custom Headers (JSON)</label>
                  <textarea
                    className="form-input"
                    value={webhookHeaders}
                    onChange={e => setWebhookHeaders(e.target.value)}
                    placeholder='{"Authorization": "Bearer your-token"}'
                    rows={2}
                    style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    className="btn btn-secondary"
                    onClick={async () => {
                      setWebhookTesting(true)
                      setWebhookTestResult(null)
                      try {
                        // Save first so the backend has the latest URL/headers
                        await updateEnvironment(envId, {
                          webhook_url: webhookUrl,
                          webhook_headers: webhookHeaders,
                          webhook_enabled: webhookEnabled,
                        })
                        await testWebhook(envId)
                        setWebhookTestResult({ ok: true })
                      } catch (err) {
                        setWebhookTestResult({ ok: false, error: err.message })
                      } finally {
                        setWebhookTesting(false)
                      }
                    }}
                    disabled={webhookTesting || !webhookUrl.trim()}
                    style={{ fontSize: '0.82rem' }}
                  >
                    {webhookTesting ? 'Sending...' : 'Test Webhook'}
                  </button>
                  {webhookTestResult && (
                    <span style={{
                      fontSize: '0.82rem',
                      color: webhookTestResult.ok ? '#16a34a' : '#dc2626',
                      fontWeight: 600,
                    }}>
                      {webhookTestResult.ok
                        ? 'Test payload sent successfully'
                        : `Failed: ${webhookTestResult.error}`
                      }
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ TEST CASES TAB ═══ */}
      {tab === 'cases' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <span style={{ fontWeight: 600 }}>{env.test_cases?.length || 0} test cases</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-secondary"
                onClick={() => { setShowGenerate(!showGenerate); setShowAddCase(false) }}
                disabled={generating}
              >
                <Wand2 size={14} /> {generating ? 'Generating...' : 'Auto-Generate'}
              </button>
              <button className="btn btn-primary" onClick={() => { setShowAddCase(!showAddCase); setShowGenerate(false) }}>
                <Plus size={14} /> Add Test Case
              </button>
            </div>
          </div>

          {/* Auto-generate panel */}
          {showGenerate && (
            <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--cane-500)' }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Wand2 size={16} style={{ color: 'var(--cane-600)' }} />
                  Auto-Generate Test Cases
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Reads your documents and generates Q&A pairs with expected answers automatically.
                </div>
              </div>

              <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Number of Test Cases
                  </label>
                  <select
                    className="form-input"
                    value={genCount}
                    onChange={e => setGenCount(parseInt(e.target.value))}
                  >
                    <option value={5}>5 (Quick check)</option>
                    <option value={10}>10 (Standard)</option>
                    <option value={15}>15 (Thorough)</option>
                    <option value={20}>20 (Comprehensive)</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Difficulty
                  </label>
                  <select
                    className="form-input"
                    value={genDifficulty}
                    onChange={e => setGenDifficulty(e.target.value)}
                  >
                    <option value="easy">Easy: Straightforward factual</option>
                    <option value="mixed">Mixed: Facts + edge cases + adversarial</option>
                    <option value="adversarial">Adversarial: Hallucination traps + tricks</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-primary"
                  onClick={handleGenerate}
                  disabled={generating}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {generating ? (
                    <>
                      <span className="spinner" style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      Generating {genCount} cases...
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} /> Generate {genCount} Cases
                    </>
                  )}
                </button>
                <button className="btn btn-secondary" onClick={() => setShowGenerate(false)} disabled={generating}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Add form */}
          {showAddCase && (
            <div className="card" style={{ marginBottom: 16 }}>
              <form onSubmit={handleAddCase}>
                <div className="form-group">
                  <label>Question</label>
                  <input
                    className="form-input"
                    value={newQuestion}
                    onChange={e => setNewQuestion(e.target.value)}
                    placeholder="What should the agent be able to answer?"
                    autoFocus
                  />
                </div>
                <div className="form-group">
                  <label>Expected Answer</label>
                  <textarea
                    className="form-input"
                    style={{ minHeight: 80, resize: 'vertical' }}
                    value={newExpected}
                    onChange={e => setNewExpected(e.target.value)}
                    placeholder="The correct answer the agent should give"
                  />
                </div>
                <div className="form-group">
                  <label>Tags (comma-separated)</label>
                  <input
                    className="form-input"
                    value={newTags}
                    onChange={e => setNewTags(e.target.value)}
                    placeholder="e.g. policy, onboarding, edge-case"
                  />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" className="btn btn-primary" disabled={!newQuestion.trim()}>Add</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowAddCase(false)}>Cancel</button>
                </div>
              </form>
            </div>
          )}

          {/* Case list */}
          {env.test_cases?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {env.test_cases.map((tc, i) => (
                <div key={tc.id} className="card" style={{ padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <span style={{
                          width: 24, height: 24, borderRadius: '50%',
                          background: 'var(--cane-100)', color: 'var(--cane-600)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.7rem', fontWeight: 600, flexShrink: 0,
                        }}>{i + 1}</span>
                        <span style={{ fontWeight: 600 }}>{tc.question}</span>
                      </div>
                      {tc.expected_answer && (
                        <div style={{ marginLeft: 34 }}>
                          <div style={{
                            fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)',
                            textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4,
                          }}>Expected Answer</div>
                          <div style={{
                            fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5,
                            padding: '10px 14px', background: 'var(--cane-50)',
                            borderRadius: 8, border: '1px solid var(--border)',
                          }}>{tc.expected_answer}</div>
                        </div>
                      )}
                      {tc.tags?.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 10, marginLeft: 34 }}>
                          {tc.tags.map(t => (
                            <span key={t} style={{
                              padding: '2px 10px', borderRadius: 12,
                              background: 'var(--accent-muted)', color: 'var(--accent-hover)',
                              fontSize: '0.7rem', fontWeight: 600,
                            }}>{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      className="btn btn-ghost"
                      onClick={() => handleDeleteCase(tc.id)}
                      style={{ flexShrink: 0 }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : !showAddCase && !showGenerate ? (
            <div className="empty-state">
              <ListChecks size={28} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
              <h3>No test cases yet</h3>
              <p>Add questions manually or use Auto-Generate to create them from your documents.</p>
            </div>
          ) : null}
        </div>
      )}

      {/* ═══ JUDGE CRITERIA TAB ═══ */}
      {tab === 'criteria' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Judge Criteria</h3>
            <div style={{
              padding: '6px 14px', borderRadius: 8,
              background: totalWeight === 100 ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
              color: totalWeight === 100 ? 'var(--success)' : 'var(--error)',
              fontSize: '0.8rem', fontWeight: 600,
            }}>
              Total Weight: {totalWeight}/100
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {env.criteria?.map(c => (
              <div key={c.id} className="card" style={{
                padding: 20, opacity: c.is_enabled ? 1 : 0.5,
                transition: 'opacity 0.2s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1 }}>
                    <button
                      onClick={() => handleCriteriaChange(c.id, 'is_enabled', !c.is_enabled)}
                      style={{
                        width: 20, height: 20, borderRadius: 4,
                        border: `2px solid ${c.is_enabled ? 'var(--accent)' : 'var(--border)'}`,
                        background: c.is_enabled ? 'var(--accent)' : 'transparent',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#000', flexShrink: 0, padding: 0,
                      }}
                    >
                      {c.is_enabled && <Check size={12} />}
                    </button>
                    <div>
                      <div style={{ fontWeight: 600 }}>{c.label}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 1 }}>{c.description}</div>
                    </div>
                  </div>
                  {c.is_enabled && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="range" min={0} max={100} value={c.weight}
                        onChange={e => handleCriteriaChange(c.id, 'weight', Number(e.target.value))}
                        style={{ width: 120, accentColor: 'var(--accent)' }}
                      />
                      <span style={{
                        fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent)',
                        minWidth: 36, textAlign: 'right',
                      }}>{c.weight}%</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Custom Rules */}
          <div style={{ marginTop: 32 }}>
            <div style={{
              padding: '20px 24px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 'var(--radius)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Sparkles size={16} style={{ color: 'var(--accent)' }} />
                <span style={{ fontWeight: 600, color: 'var(--accent-hover)' }}>Custom Rules</span>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>
                Write evaluation rules in plain English. The judge will follow them when scoring.
              </p>

              {env.custom_rules?.map(r => (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', background: 'var(--bg-card)', borderRadius: 6,
                  border: '1px solid var(--border)', marginBottom: 8,
                }}>
                  <span style={{ flex: 1, fontSize: '0.85rem' }}>{r.rule_text}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleDeleteRule(r.id)}>
                    <X size={12} />
                  </button>
                </div>
              ))}

              <form onSubmit={handleAddRule} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input
                  className="form-input"
                  value={newRule}
                  onChange={e => setNewRule(e.target.value)}
                  placeholder='e.g. "Never recommend contacting a manager directly"'
                  style={{ flex: 1 }}
                />
                <button type="submit" className="btn btn-primary btn-sm" disabled={!newRule.trim()}>Add</button>
              </form>
            </div>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleSaveCriteria}
            disabled={saving || totalWeight !== 100}
            style={{ marginTop: 20 }}
          >
            {saving ? 'Saving...' : 'Save Criteria'}
          </button>
          {totalWeight !== 100 && (
            <span style={{ fontSize: '0.78rem', color: 'var(--error)', marginLeft: 12 }}>
              Weights must sum to 100
            </span>
          )}
        </div>
      )}

      {/* ═══ RESULTS TAB ═══ */}
      {tab === 'results' && (
        <div>
          {/* Running indicator */}
          {running && (
            <div style={{
              marginBottom: 20, textAlign: 'center', padding: 24,
              background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--rule)',
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'rgba(255,255,255,0.15)' }} />
              <div className="spinner" style={{ margin: '0 auto 12px', width: 24, height: 24, borderColor: 'var(--cane-800)', borderTopColor: 'var(--accent)' }} />
              <div style={{ fontWeight: 700, marginBottom: 4, color: 'var(--text-inverse)' }}>Evaluation running...</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--cane-700)', marginBottom: 8 }}>
                {runDetail?.results?.length || 0} / {env.test_cases?.length || 0} test cases complete
              </div>
              {env.test_cases?.length > 0 && (
                <div style={{ width: '60%', margin: '0 auto', height: 4, background: 'var(--cane-800)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    width: `${((runDetail?.results?.length || 0) / env.test_cases.length) * 100}%`,
                    height: '100%', background: 'var(--accent)', borderRadius: 2,
                    transition: 'width 0.5s ease',
                  }} />
                </div>
              )}
            </div>
          )}

          {/* Streaming results while running */}
          {running && runDetail?.results?.length > 0 && (
            <div style={{ border: '1px solid var(--rule)', borderRadius: 8, overflow: 'hidden', marginBottom: 20, background: 'var(--bg-card)' }}>
              {runDetail.results.map((r, i) => (
                <div key={r.id} style={{
                  display: 'grid', gridTemplateColumns: '72px 1fr 56px 80px',
                  padding: '13px 18px', alignItems: 'center',
                  borderBottom: '1px solid var(--rule-light)',
                }}>
                  <span style={{
                    fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em',
                    color: r.status === 'pass' ? 'var(--success)' : r.status === 'warn' ? 'var(--warning)' : 'var(--error)',
                  }}>{r.status}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text)', fontWeight: 550 }}>{r.question}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-faint)', textAlign: 'right' }}>
                    {r.response_time_ms > 0 ? `${(r.response_time_ms / 1000).toFixed(1)}s` : '—'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                    <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--rule-light)', overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.round(r.overall_score)}%`, height: '100%', borderRadius: 2,
                        background: r.overall_score >= 80 ? 'var(--success)' : r.overall_score >= 60 ? 'var(--warning)' : 'var(--error)',
                      }} />
                    </div>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700, minWidth: 24, textAlign: 'right',
                      color: r.overall_score >= 80 ? 'var(--success)' : r.overall_score >= 60 ? 'var(--text-secondary)' : 'var(--error)',
                    }}>{Math.round(r.overall_score)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Run detail view */}
          {runDetail && runDetail.status !== 'pending' && (
            <div>
              {/* Summary cards */}
              {runDetail.status === 'completed' && (
                <div style={{ display: 'flex', alignItems: 'stretch', marginBottom: 22, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--rule)', background: 'var(--bg-card)' }}>
                  {/* Big score — dark brown */}
                  <div style={{
                    background: 'rgba(255,255,255,0.04)', padding: '22px 28px',
                    minWidth: 160, position: 'relative',
                  }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'rgba(255,255,255,0.15)' }} />
                    <div style={{ fontSize: '0.58rem', color: 'var(--cane-700)', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
                      Overall Score
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '2.6rem', fontWeight: 800, color: 'var(--text-inverse)', lineHeight: 1, letterSpacing: '-0.04em' }}>
                        {Math.round(runDetail.overall_score || 0)}
                      </span>
                      <span style={{ fontSize: '0.85rem', color: 'var(--cane-700)' }}>/100</span>
                    </div>
                  </div>
                  {/* Stats inline */}
                  {[
                    { label: 'Passed', value: runDetail.passed, color: 'var(--success)' },
                    { label: 'Warned', value: runDetail.warned, color: 'var(--warning)' },
                    { label: 'Failed', value: runDetail.failed, color: 'var(--error)' },
                  ].map((s, i) => (
                    <div key={i} style={{
                      flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
                      padding: '22px 20px', borderLeft: '1px solid var(--rule-light)',
                    }}>
                      <div style={{ fontSize: '0.58rem', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: 10, textTransform: 'uppercase' }}>
                        {s.label}
                      </div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.65rem', fontWeight: 800, color: s.color, lineHeight: 1 }}>
                        {s.value}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {runDetail.status === 'failed' && (
                <div className="card" style={{ marginBottom: 20, borderLeft: '3px solid var(--error)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--error)', marginBottom: 4 }}>Run Failed</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{runDetail.error_message || 'Unknown error'}</div>
                </div>
              )}

              {/* Export button */}
              {runDetail.status === 'completed' && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12, gap: 8 }}>
                  <button
                    className="btn btn-ghost"
                    onClick={async () => {
                      try {
                        const text = await exportRun(envId, runDetail.id, 'openai', 80)
                        const blob = new Blob([text], { type: 'application/jsonl' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = `training_data_${new Date().toISOString().slice(0, 10)}.jsonl`
                        a.click()
                        URL.revokeObjectURL(url)
                      } catch (err) { alert(err.message) }
                    }}
                    style={{ fontSize: '0.72rem', padding: '4px 12px' }}
                  >
                    <Download size={12} style={{ marginRight: 4 }} /> Export as Training Data
                  </button>
                </div>
              )}

              {/* Individual results — table style */}
              <div style={{ border: '1px solid var(--rule)', borderRadius: 8, overflow: 'hidden', background: 'var(--bg-card)' }}>
                {/* Table header */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '72px 1fr 56px 80px',
                  padding: '10px 18px',
                  fontSize: '0.58rem', fontWeight: 800, color: 'var(--text-muted)',
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                  borderBottom: '1px solid var(--rule)',
                }}>
                  <span>Status</span>
                  <span>Question</span>
                  <span style={{ textAlign: 'right' }}>Time</span>
                  <span style={{ textAlign: 'right' }}>Score</span>
                </div>

                {runDetail.results?.map((r, i) => (
                  <div key={r.id}>
                    <div
                      style={{
                        display: 'grid', gridTemplateColumns: '72px 1fr 56px 80px',
                        padding: '13px 18px', alignItems: 'center',
                        background: 'transparent',
                        borderBottom: '1px solid var(--rule-light)',
                        cursor: 'pointer', transition: 'background 0.1s',
                      }}
                      onClick={() => setExpandedResult(expandedResult === i ? null : i)}
                      onMouseOver={e => e.currentTarget.style.background = 'rgba(212,104,40,0.03)'}
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                    >
                      {/* Status */}
                      <span style={{
                        fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em',
                        color: r.status === 'pass' ? 'var(--success)' : r.status === 'warn' ? 'var(--warning)' : 'var(--error)',
                      }}>{r.status}</span>

                      {/* Question */}
                      <span style={{ fontSize: '0.8rem', color: 'var(--text)', fontWeight: 550 }}>
                        {r.question}
                      </span>

                      {/* Time */}
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-faint)', textAlign: 'right',
                      }}>
                        {r.response_time_ms > 0 ? `${(r.response_time_ms / 1000).toFixed(1)}s` : '—'}
                      </span>

                      {/* Score with bar */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--rule-light)', overflow: 'hidden' }}>
                          <div style={{
                            width: `${Math.round(r.overall_score)}%`, height: '100%', borderRadius: 2,
                            background: r.overall_score >= 80 ? 'var(--success)' : r.overall_score >= 60 ? 'var(--warning)' : 'var(--error)',
                          }} />
                        </div>
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700, minWidth: 24, textAlign: 'right',
                          color: r.overall_score >= 80 ? 'var(--success)' : r.overall_score >= 60 ? 'var(--text-secondary)' : 'var(--error)',
                        }}>{Math.round(r.overall_score)}</span>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {expandedResult === i && (
                      <div style={{ padding: '16px 18px 18px', background: 'var(--paper)', borderBottom: '1px solid var(--rule)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                          <div>
                            <div style={{ fontSize: '0.58rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Agent's Answer</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6, padding: 12, background: 'var(--bg-card)', borderRadius: 6, border: '1px solid var(--rule-light)', maxHeight: 200, overflow: 'auto' }}>
                              {r.agent_answer}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.58rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Expected Answer</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6, padding: 12, background: 'var(--bg-card)', borderRadius: 6, border: '1px solid var(--rule-light)', maxHeight: 200, overflow: 'auto' }}>
                              {r.expected_answer || '(not specified)'}
                            </div>
                          </div>
                        </div>

                        {r.judge_reasoning && (
                          <div style={{ marginBottom: 14 }}>
                            <div style={{ fontSize: '0.58rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Judge Reasoning</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5, fontStyle: 'italic' }}>{r.judge_reasoning}</div>
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <div style={{ fontSize: '0.58rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Score Breakdown</div>
                          {r.status === 'fail' && (
                            <button className="btn btn-ghost btn-sm"
                              disabled={rcaTargetedLoading === r.id}
                              onClick={async (e) => {
                                e.stopPropagation()
                                setRcaTargetedLoading(r.id)
                                try {
                                  const res = await runTargetedRCA(envId, r.id)
                                  setRcaTargeted(res)
                                } catch (err) { console.error(err) }
                                finally { setRcaTargetedLoading(null) }
                              }}
                              style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                              {rcaTargetedLoading === r.id ? <Loader2 size={12} className="spin" /> : <Search size={12} />}
                              Deep Analyze
                            </button>
                          )}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                          {Object.entries(r.criteria_scores || {}).map(([key, val]) => {
                            const score = typeof val === 'object' ? val.score : val
                            return (
                              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ width: 90, fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{key}</span>
                                <div style={{ flex: 1, height: 4, background: 'var(--rule-light)', borderRadius: 2, overflow: 'hidden' }}>
                                  <div style={{
                                    width: `${score}%`, height: '100%',
                                    background: score >= 80 ? 'var(--success)' : score >= 60 ? 'var(--warning)' : 'var(--error)',
                                    borderRadius: 2,
                                  }} />
                                </div>
                                <span style={{
                                  fontSize: '0.68rem', fontWeight: 700, fontFamily: 'var(--font-mono)', minWidth: 24, textAlign: 'right',
                                  color: score >= 80 ? 'var(--success)' : score >= 60 ? 'var(--warning)' : 'var(--error)',
                                }}>{score}</span>
                              </div>
                            )
                          })}
                        </div>

                        {/* Targeted RCA Result */}
                        {rcaTargeted && rcaTargeted.result_id === r.id && (
                          <div style={{ marginTop: 14, padding: 14, background: 'rgba(37,99,235,0.03)', borderRadius: 8, border: '1px solid rgba(37,99,235,0.1)' }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Root Cause Analysis</div>
                            <div style={{ fontSize: '0.78rem', lineHeight: 1.6, marginBottom: 10, color: 'var(--text-primary)' }}>{rcaTargeted.diagnosis}</div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                              <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: 99, background: 'rgba(37,99,235,0.08)', color: '#2563eb', fontWeight: 600 }}>
                                {(rcaTargeted.likely_cause || '').replace(/_/g, ' ')}
                              </span>
                              {rcaTargeted.confidence != null && (
                                <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: 99, background: 'rgba(107,114,128,0.08)', color: 'var(--text-muted)', fontWeight: 600 }}>
                                  {rcaTargeted.confidence}% confidence
                                </span>
                              )}
                            </div>
                            {rcaTargeted.fix_actions?.length > 0 && (
                              <div>
                                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#16a34a', marginBottom: 4 }}>Fix Actions:</div>
                                {rcaTargeted.fix_actions.map((a, j) => (
                                  <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: '0.75rem' }}>
                                    <span style={{
                                      fontSize: '0.6rem', fontWeight: 700, padding: '1px 6px', borderRadius: 4, textTransform: 'uppercase',
                                      background: a.priority === 'high' ? 'rgba(220,38,38,0.08)' : a.priority === 'medium' ? 'rgba(217,119,6,0.08)' : 'rgba(37,99,235,0.08)',
                                      color: a.priority === 'high' ? '#dc2626' : a.priority === 'medium' ? '#d97706' : '#2563eb',
                                    }}>{a.priority}</span>
                                    <span style={{ color: 'var(--text-secondary)' }}>{a.action}</span>
                                    {a.effort && <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>({a.effort})</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Run history (when not viewing a detail) */}
          {!runDetail && !running && (
            <>
              {env.runs?.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {env.runs.map(r => (
                    <div key={r.id} className="card" style={{ cursor: 'pointer' }} onClick={() => handleViewRun(r.id)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{
                              padding: '2px 8px', borderRadius: 12,
                              fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase',
                              background: r.status === 'completed' ? 'rgba(74,222,128,0.1)' : r.status === 'failed' ? 'rgba(248,113,113,0.1)' : 'var(--accent-muted)',
                              color: r.status === 'completed' ? 'var(--success)' : r.status === 'failed' ? 'var(--error)' : 'var(--warning)',
                            }}>{r.status}</span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              {r.created_at ? new Date(r.created_at).toLocaleString() : ''}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 16, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            <span>{r.total_cases} cases</span>
                            {r.status === 'completed' && (
                              <>
                                <span style={{ color: 'var(--success)' }}>{r.passed} passed</span>
                                <span style={{ color: 'var(--warning)' }}>{r.warned} warned</span>
                                <span style={{ color: 'var(--error)' }}>{r.failed} failed</span>
                              </>
                            )}
                          </div>
                        </div>
                        {r.overall_score !== null && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{
                              fontSize: '1.75rem', fontWeight: 800,
                              fontFamily: 'var(--font-display)',
                              color: r.overall_score >= 80 ? 'var(--success)' : r.overall_score >= 60 ? 'var(--warning)' : 'var(--error)',
                            }}>{Math.round(r.overall_score)}</div>
                            <button
                              className="btn btn-ghost"
                              onClick={(e) => handleDeleteRun(e, r.id)}
                              style={{ padding: 4, minWidth: 'auto', color: 'var(--text-muted)' }}
                              title="Delete run"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                        {r.overall_score === null && (
                          <button
                            className="btn btn-ghost"
                            onClick={(e) => handleDeleteRun(e, r.id)}
                            style={{ padding: 4, minWidth: 'auto', color: 'var(--text-muted)' }}
                            title="Delete run"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  <button
                    className="btn btn-ghost"
                    onClick={() => setRunDetail(null)}
                    style={{ alignSelf: 'center', marginTop: 8, fontSize: '0.8rem' }}
                  >
                    Click any run to view details
                  </button>
                </div>
              ) : (
                <div className="empty-state">
                  <BarChart3 size={28} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
                  <h3>No runs yet</h3>
                  <p>Add test cases and configure criteria, then hit Run Evaluation.</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══ ANALYTICS TAB ═══ */}
      {tab === 'analytics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Analytics Nav */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { id: 'dashboard', label: 'Dashboard', icon: Activity },
              { id: 'regressions', label: 'Regressions', icon: AlertTriangle },
              { id: 'categories', label: 'Categories', icon: Target },
              { id: 'failures', label: 'Failure Patterns', icon: TrendingDown },
              { id: 'consistency', label: 'Consistency', icon: GitBranch },
              { id: 'criteria', label: 'Criteria Deep Dive', icon: SlidersHorizontal },
              { id: 'rca', label: 'Root Cause', icon: Search },
            ].map(v => (
              <button key={v.id} className={`btn btn-sm ${analyticsView === v.id ? 'btn-primary' : 'btn-ghost'}`}
                onClick={async () => {
                  setAnalyticsView(v.id)
                  setAnalyticsLoading(true)
                  try {
                    if (v.id === 'dashboard') {
                      const d = await getAnalyticsDashboard(envId)
                      setAnalyticsDash(d)
                    } else if (v.id === 'regressions') {
                      const r = await getRegressions(envId)
                      setRegressions(r)
                    } else if (v.id === 'categories') {
                      const c = await getCategoryBreakdown(envId)
                      setCategories(c)
                    } else if (v.id === 'failures') {
                      const f = await getFailurePatterns(envId)
                      setFailurePatterns(f)
                    } else if (v.id === 'consistency') {
                      const c = await getConsistencyAnalysis(envId)
                      setConsistency(c)
                    } else if (v.id === 'criteria') {
                      const c = await getCriteriaBreakdown(envId)
                      setCriteriaBreakdown(c)
                    } else if (v.id === 'rca') {
                      // Don't auto-load, user triggers manually
                    }
                  } catch (err) { console.error(err) }
                  finally { setAnalyticsLoading(false) }
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem' }}>
                <v.icon size={14} /> {v.label}
              </button>
            ))}
          </div>

          {analyticsLoading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              <Loader2 size={24} className="spin" style={{ marginBottom: 8 }} />
              <div style={{ fontSize: '0.85rem' }}>Loading analytics...</div>
            </div>
          ) : (
            <>
              {/* Dashboard View */}
              {analyticsView === 'dashboard' && analyticsDash && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {!analyticsDash.has_data ? (
                    <div className="card" style={{ padding: 40, textAlign: 'center' }}>
                      <Activity size={28} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
                      <h3>No analytics data yet</h3>
                      <p style={{ color: 'var(--text-muted)' }}>Run at least one evaluation to see analytics.</p>
                    </div>
                  ) : (
                    <>
                      {/* KPI Row */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
                        {[
                          { label: 'Latest Score', value: `${analyticsDash.latest_run?.score || 0}`, color: (analyticsDash.latest_run?.score || 0) >= 80 ? '#16a34a' : (analyticsDash.latest_run?.score || 0) >= 60 ? '#d97706' : '#dc2626' },
                          { label: 'Pass Rate', value: `${analyticsDash.pass_rate || 0}%`, color: '#2563eb' },
                          { label: 'Total Runs', value: `${analyticsDash.total_runs}`, color: '#7c3aed' },
                          { label: 'Regressions', value: `${analyticsDash.regressions_detected}`, color: analyticsDash.regressions_detected > 0 ? '#dc2626' : '#16a34a' },
                          { label: 'Avg Latency', value: `${analyticsDash.latency_stats?.mean || 0}ms`, color: '#0891b2' },
                          { label: 'Median Score', value: `${analyticsDash.score_stats?.median || 0}`, color: '#059669' },
                        ].map(kpi => (
                          <div key={kpi.label} className="card" style={{ padding: 16, textAlign: 'center' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{kpi.label}</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
                          </div>
                        ))}
                      </div>

                      {/* Score Trend */}
                      {analyticsDash.score_trend?.length > 1 && (
                        <div className="card" style={{ padding: 20 }}>
                          <h4 style={{ fontSize: '0.85rem', fontWeight: 700, margin: '0 0 16px 0' }}>Score Trend (Last {analyticsDash.score_trend.length} Runs)</h4>
                          <div style={{ display: 'flex', alignItems: 'end', gap: 4, height: 120 }}>
                            {analyticsDash.score_trend.map((t, i) => {
                              const h = Math.max(8, (t.score || 0) / 100 * 100)
                              const color = (t.score || 0) >= 80 ? '#16a34a' : (t.score || 0) >= 60 ? '#d97706' : '#dc2626'
                              return (
                                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                  <div style={{ fontSize: '0.65rem', fontWeight: 700, color }}>{t.score}</div>
                                  <div style={{ width: '100%', height: `${h}%`, background: color, borderRadius: 4, minHeight: 8, opacity: 0.8 }} title={`Run ${i + 1}: ${t.score}`} />
                                  <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                                    {t.created_at ? new Date(t.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Top Failure Criteria */}
                      {analyticsDash.top_failure_criteria?.length > 0 && (
                        <div className="card" style={{ padding: 20 }}>
                          <h4 style={{ fontSize: '0.85rem', fontWeight: 700, margin: '0 0 12px 0' }}>Top Failure Criteria</h4>
                          {analyticsDash.top_failure_criteria.map(fc => (
                            <div key={fc.criteria} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-light)' }}>
                              <span style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'capitalize' }}>{fc.criteria.replace(/_/g, ' ')}</span>
                              <span style={{ fontSize: '0.78rem', color: '#dc2626', fontWeight: 700 }}>{fc.count} failures</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Dashboard auto-load */}
              {analyticsView === 'dashboard' && !analyticsDash && !analyticsLoading && (
                <div className="card" style={{ padding: 40, textAlign: 'center' }}>
                  <button className="btn btn-primary" onClick={async () => {
                    setAnalyticsLoading(true)
                    try { setAnalyticsDash(await getAnalyticsDashboard(envId)) }
                    catch (err) { console.error(err) }
                    finally { setAnalyticsLoading(false) }
                  }}>
                    <Activity size={16} /> Load Analytics Dashboard
                  </button>
                </div>
              )}

              {/* Regressions View */}
              {analyticsView === 'regressions' && regressions && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="card" style={{ padding: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <h4 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0 }}>Regression Detection</h4>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Overall: <span style={{ fontWeight: 700, color: regressions.score_delta >= 0 ? '#16a34a' : '#dc2626' }}>
                          {regressions.score_delta >= 0 ? '+' : ''}{regressions.score_delta}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                      <div style={{ textAlign: 'center', padding: 12, background: 'rgba(220,38,38,0.06)', borderRadius: 8 }}>
                        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#dc2626' }}>{regressions.summary.regressions}</div>
                        <div style={{ fontSize: '0.7rem', color: '#dc2626', fontWeight: 600 }}>Regressions</div>
                      </div>
                      <div style={{ textAlign: 'center', padding: 12, background: 'rgba(22,163,74,0.06)', borderRadius: 8 }}>
                        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#16a34a' }}>{regressions.summary.improvements}</div>
                        <div style={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: 600 }}>Improvements</div>
                      </div>
                      <div style={{ textAlign: 'center', padding: 12, background: 'rgba(107,114,128,0.06)', borderRadius: 8 }}>
                        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-muted)' }}>{regressions.summary.stable}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>Stable</div>
                      </div>
                      <div style={{ textAlign: 'center', padding: 12, background: 'rgba(37,99,235,0.06)', borderRadius: 8 }}>
                        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#2563eb' }}>{regressions.summary.new_questions}</div>
                        <div style={{ fontSize: '0.7rem', color: '#2563eb', fontWeight: 600 }}>New Questions</div>
                      </div>
                    </div>
                  </div>

                  {regressions.regressions?.length > 0 && (
                    <div className="card" style={{ padding: 20 }}>
                      <h4 style={{ fontSize: '0.85rem', fontWeight: 700, margin: '0 0 12px 0', color: '#dc2626', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <TrendingDown size={16} /> Regressions (score dropped)
                      </h4>
                      {regressions.regressions.map((r, i) => (
                        <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                          <div style={{ flex: 1, fontSize: '0.78rem', lineHeight: 1.4 }}>{r.question}</div>
                          <div style={{ display: 'flex', gap: 12, alignItems: 'center', whiteSpace: 'nowrap' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.base_score}</span>
                            <span style={{ fontSize: '0.75rem' }}>&#8594;</span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>{r.compare_score}</span>
                            <span style={{ fontSize: '0.7rem', color: '#dc2626', fontWeight: 700, background: 'rgba(220,38,38,0.08)', padding: '2px 8px', borderRadius: 99 }}>{r.delta}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {regressions.improvements?.length > 0 && (
                    <div className="card" style={{ padding: 20 }}>
                      <h4 style={{ fontSize: '0.85rem', fontWeight: 700, margin: '0 0 12px 0', color: '#16a34a', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <TrendingUp size={16} /> Improvements (score increased)
                      </h4>
                      {regressions.improvements.slice(0, 10).map((r, i) => (
                        <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                          <div style={{ flex: 1, fontSize: '0.78rem', lineHeight: 1.4 }}>{r.question}</div>
                          <div style={{ display: 'flex', gap: 12, alignItems: 'center', whiteSpace: 'nowrap' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.base_score}</span>
                            <span style={{ fontSize: '0.75rem' }}>&#8594;</span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>{r.compare_score}</span>
                            <span style={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: 700, background: 'rgba(22,163,74,0.08)', padding: '2px 8px', borderRadius: 99 }}>+{r.delta}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Categories View */}
              {analyticsView === 'categories' && categories && (
                <div className="card" style={{ padding: 20 }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 700, margin: '0 0 16px 0' }}>Performance by Category</h4>
                  {categories.categories?.length > 0 ? (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid var(--border-light)' }}>
                            <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 700 }}>Tag</th>
                            <th style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 700 }}>Count</th>
                            <th style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 700 }}>Mean Score</th>
                            <th style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 700 }}>Pass Rate</th>
                            <th style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 700 }}>Fail Rate</th>
                            <th style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 700 }}>Avg Latency</th>
                          </tr>
                        </thead>
                        <tbody>
                          {categories.categories.map(cat => (
                            <tr key={cat.tag} style={{ borderBottom: '1px solid var(--border-light)' }}>
                              <td style={{ padding: '8px 12px', fontWeight: 600 }}>
                                <span style={{ background: 'rgba(37,99,235,0.08)', padding: '2px 10px', borderRadius: 99, fontSize: '0.72rem' }}>{cat.tag}</span>
                              </td>
                              <td style={{ textAlign: 'center', padding: '8px 12px' }}>{cat.count}</td>
                              <td style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 700, color: cat.mean_score >= 80 ? '#16a34a' : cat.mean_score >= 60 ? '#d97706' : '#dc2626' }}>{cat.mean_score}</td>
                              <td style={{ textAlign: 'center', padding: '8px 12px', color: '#16a34a' }}>{cat.pass_rate}%</td>
                              <td style={{ textAlign: 'center', padding: '8px 12px', color: '#dc2626' }}>{cat.fail_rate}%</td>
                              <td style={{ textAlign: 'center', padding: '8px 12px', color: 'var(--text-muted)' }}>{cat.avg_latency_ms}ms</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No category data. Add tags to your test cases to see breakdowns.</p>
                  )}
                </div>
              )}

              {/* Failure Patterns View */}
              {analyticsView === 'failures' && failurePatterns && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="card" style={{ padding: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <h4 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0 }}>Failure Pattern Analysis</h4>
                      <div style={{ fontSize: '0.78rem' }}>
                        <span style={{ color: '#16a34a', fontWeight: 700 }}>{failurePatterns.pass_rate}% pass rate</span>
                        <span style={{ color: 'var(--text-muted)', margin: '0 8px' }}>|</span>
                        <span style={{ color: '#dc2626', fontWeight: 700 }}>{failurePatterns.total_issues} issues</span>
                      </div>
                    </div>

                    {Object.entries(failurePatterns.patterns || {}).map(([key, data]) => (
                      <div key={key} style={{ marginBottom: 16, padding: 16, background: 'var(--bg-secondary)', borderRadius: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <div>
                            <span style={{ fontWeight: 700, fontSize: '0.82rem', textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}</span>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 8 }}>{data.description}</span>
                          </div>
                          <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#dc2626', background: 'rgba(220,38,38,0.08)', padding: '2px 10px', borderRadius: 99 }}>{data.count}</span>
                        </div>
                        {data.questions?.slice(0, 3).map((q, i) => (
                          <div key={i} style={{ fontSize: '0.75rem', padding: '6px 0', borderTop: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                            <span style={{ fontWeight: 600 }}>Q:</span> {q.question}
                            <span style={{ marginLeft: 8, color: '#dc2626', fontWeight: 700 }}>{q.score}</span>
                          </div>
                        ))}
                      </div>
                    ))}

                    {Object.keys(failurePatterns.patterns || {}).length === 0 && (
                      <div style={{ textAlign: 'center', padding: 20, color: '#16a34a', fontWeight: 600 }}>
                        All questions passed! No failure patterns detected.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Consistency View */}
              {analyticsView === 'consistency' && consistency && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="card" style={{ padding: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <h4 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0 }}>Consistency Analysis</h4>
                      <div style={{
                        fontSize: '1.3rem', fontWeight: 800,
                        color: consistency.consistency_score >= 80 ? '#16a34a' : consistency.consistency_score >= 60 ? '#d97706' : '#dc2626',
                      }}>
                        {consistency.consistency_score}/100
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                      <div style={{ textAlign: 'center', padding: 12, background: 'rgba(22,163,74,0.06)', borderRadius: 8 }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#16a34a' }}>{consistency.summary?.stable || 0}</div>
                        <div style={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: 600 }}>Stable</div>
                      </div>
                      <div style={{ textAlign: 'center', padding: 12, background: 'rgba(217,119,6,0.06)', borderRadius: 8 }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#d97706' }}>{consistency.summary?.moderate || 0}</div>
                        <div style={{ fontSize: '0.7rem', color: '#d97706', fontWeight: 600 }}>Moderate</div>
                      </div>
                      <div style={{ textAlign: 'center', padding: 12, background: 'rgba(220,38,38,0.06)', borderRadius: 8 }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#dc2626' }}>{consistency.summary?.volatile || 0}</div>
                        <div style={{ fontSize: '0.7rem', color: '#dc2626', fontWeight: 600 }}>Volatile</div>
                      </div>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                      Analyzed {consistency.questions_analyzed} questions across {consistency.runs_analyzed} runs. Average std dev: {consistency.avg_std_dev}
                    </div>
                  </div>

                  {consistency.most_inconsistent?.length > 0 && (
                    <div className="card" style={{ padding: 20 }}>
                      <h4 style={{ fontSize: '0.85rem', fontWeight: 700, margin: '0 0 12px 0', color: '#dc2626' }}>Most Inconsistent Questions</h4>
                      {consistency.most_inconsistent.map((q, i) => (
                        <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                          <div style={{ flex: 1, fontSize: '0.78rem' }}>{q.question}</div>
                          <div style={{ display: 'flex', gap: 12, alignItems: 'center', whiteSpace: 'nowrap' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{q.min_score}-{q.max_score}</span>
                            <span style={{
                              fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                              background: q.stability === 'volatile' ? 'rgba(220,38,38,0.08)' : 'rgba(217,119,6,0.08)',
                              color: q.stability === 'volatile' ? '#dc2626' : '#d97706',
                            }}>
                              {q.stability} (SD: {q.std_dev})
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Criteria Deep Dive View */}
              {analyticsView === 'criteria' && criteriaBreakdown && (
                <div className="card" style={{ padding: 20 }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 700, margin: '0 0 16px 0' }}>Criteria Performance Breakdown</h4>
                  {criteriaBreakdown.criteria?.map(c => (
                    <div key={c.criteria_key} style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, textTransform: 'capitalize' }}>{c.criteria_key.replace(/_/g, ' ')}</span>
                        <span style={{ fontSize: '0.82rem', fontWeight: 800, color: c.mean >= 80 ? '#16a34a' : c.mean >= 60 ? '#d97706' : '#dc2626' }}>{c.mean}</span>
                      </div>
                      <div style={{ height: 8, background: 'var(--bg-secondary)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{
                          width: `${c.mean}%`, height: '100%', borderRadius: 4,
                          background: c.mean >= 80 ? '#16a34a' : c.mean >= 60 ? '#d97706' : '#dc2626',
                          transition: 'width 0.3s',
                        }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        <span>Min: {c.min} | Max: {c.max} | SD: {c.std_dev}</span>
                        <span>
                          <span style={{ color: '#dc2626' }}>{c.below_60_pct}% below 60</span>
                          {' | '}
                          <span style={{ color: '#16a34a' }}>{c.above_80_pct}% above 80</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Root Cause Analysis View */}
              {analyticsView === 'rca' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* RCA Trigger Card */}
                  <div className="card" style={{ padding: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <div>
                        <h4 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0 }}>Root Cause Analysis</h4>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                          AI analyzes your failing eval results to find patterns and actionable root causes.
                        </p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Analyze failures scoring below:</label>
                      <input type="number" min={0} max={100} value={rcaMaxScore}
                        onChange={e => setRcaMaxScore(Number(e.target.value))}
                        style={{ width: 60, padding: '6px 8px', fontSize: '0.82rem', borderRadius: 6, border: '1px solid var(--border-light)', background: 'var(--bg-secondary)' }}
                      />
                      <button className="btn btn-primary btn-sm" disabled={rcaLoading}
                        onClick={async () => {
                          setRcaLoading(true)
                          setRcaResult(null)
                          try {
                            const res = await runBatchRCA(envId, rcaMaxScore)
                            setRcaResult(res)
                          } catch (err) { console.error(err); alert(err.message) }
                          finally { setRcaLoading(false) }
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {rcaLoading ? <Loader2 size={14} className="spin" /> : <Search size={14} />}
                        {rcaLoading ? 'Analyzing...' : 'Run Analysis'}
                      </button>
                    </div>
                  </div>

                  {/* RCA Results */}
                  {rcaResult && (
                    <>
                      {/* Summary */}
                      <div className="card" style={{ padding: 20, borderLeft: '3px solid #2563eb' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                          <h4 style={{ fontSize: '0.85rem', fontWeight: 700, margin: 0, color: '#2563eb' }}>Analysis Summary</h4>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 99, background: 'rgba(37,99,235,0.08)', color: '#2563eb', fontWeight: 600 }}>
                              {rcaResult.total_analyzed} failures analyzed
                            </span>
                            {rcaResult.avg_failure_score != null && (
                              <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 99, background: 'rgba(220,38,38,0.08)', color: '#dc2626', fontWeight: 600 }}>
                                avg score: {rcaResult.avg_failure_score}
                              </span>
                            )}
                          </div>
                        </div>
                        <p style={{ fontSize: '0.82rem', lineHeight: 1.6, margin: '0 0 12px', color: 'var(--text-primary)' }}>{rcaResult.summary}</p>
                        {rcaResult.top_recommendation && (
                          <div style={{ padding: 12, background: 'rgba(37,99,235,0.04)', borderRadius: 8, border: '1px solid rgba(37,99,235,0.1)' }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Top Recommendation</div>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>{rcaResult.top_recommendation}</div>
                          </div>
                        )}
                      </div>

                      {/* Root Causes */}
                      {rcaResult.root_causes?.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {rcaResult.root_causes.map((rc, i) => {
                            const severityColors = { critical: '#dc2626', high: '#ea580c', medium: '#d97706', low: '#2563eb' }
                            const categoryLabels = {
                              knowledge_gap: 'Knowledge Gap', prompt_issue: 'Prompt Issue',
                              source_gap: 'Source Gap', behavior_pattern: 'Behavior Pattern',
                              data_quality: 'Data Quality',
                            }
                            return (
                              <div key={i} className="card" style={{ padding: 20, borderLeft: `3px solid ${severityColors[rc.severity] || '#6b7280'}` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                  <h4 style={{ fontSize: '0.85rem', fontWeight: 700, margin: 0 }}>{rc.title}</h4>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <span style={{
                                      fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99, textTransform: 'uppercase',
                                      background: `${severityColors[rc.severity] || '#6b7280'}15`,
                                      color: severityColors[rc.severity] || '#6b7280',
                                    }}>{rc.severity}</span>
                                    <span style={{
                                      fontSize: '0.65rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                                      background: 'rgba(107,114,128,0.08)', color: 'var(--text-muted)',
                                    }}>{categoryLabels[rc.category] || rc.category}</span>
                                  </div>
                                </div>
                                <p style={{ fontSize: '0.8rem', lineHeight: 1.6, margin: '0 0 10px', color: 'var(--text-secondary)' }}>{rc.description}</p>

                                {rc.evidence?.length > 0 && (
                                  <div style={{ marginBottom: 10 }}>
                                    <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Evidence:</div>
                                    {rc.evidence.map((e, j) => (
                                      <div key={j} style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '2px 0', paddingLeft: 12, borderLeft: '2px solid var(--border-light)' }}>{e}</div>
                                    ))}
                                  </div>
                                )}

                                {rc.recommendation && (
                                  <div style={{ padding: 10, background: 'rgba(22,163,74,0.04)', borderRadius: 6, border: '1px solid rgba(22,163,74,0.1)' }}>
                                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#16a34a', marginBottom: 2 }}>Recommendation</div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>{rc.recommendation}</div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {rcaResult.total_analyzed === 0 && (
                        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
                          <Check size={24} style={{ color: '#16a34a', marginBottom: 8 }} />
                          <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>No failures found</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>All results scored above your threshold. Try increasing the score cutoff.</div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Empty state */}
                  {!rcaResult && !rcaLoading && (
                    <div className="card" style={{ padding: 40, textAlign: 'center' }}>
                      <Search size={28} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
                      <h3 style={{ margin: '0 0 8px', fontSize: '0.95rem' }}>AI-Powered Root Cause Analysis</h3>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', maxWidth: 480, margin: '0 auto 16px' }}>
                        Goes beyond failure classification to find the underlying reasons your agent fails.
                        Identifies knowledge gaps, prompt issues, source gaps, and behavior patterns.
                      </p>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        Click "Run Analysis" above to get started.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══ PERSONALITY TAB ═══ */}
      {tab === 'personality' && (
        <PersonalityProfile envId={envId} runs={env?.runs} />
      )}

      {/* ═══ SCHEDULE TAB ═══ */}
      {tab === 'schedule' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Schedule Config Card */}
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16 }}>Automated Eval Schedule</h3>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                  Run eval suites automatically on a schedule. Catch regressions before they reach users.
                </p>
              </div>
              {schedule && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                    background: schedule.is_enabled ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                    color: schedule.is_enabled ? '#22c55e' : '#ef4444',
                  }}>
                    {schedule.is_enabled ? 'Active' : 'Paused'}
                  </span>
                </div>
              )}
            </div>

            {/* Schedule Type */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Schedule Type</label>
                <select
                  value={scheduleForm.schedule_type}
                  onChange={e => setScheduleForm(f => ({ ...f, schedule_type: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', fontSize: 13 }}
                >
                  <option value="daily">Daily</option>
                  <option value="interval">Every N hours</option>
                </select>
              </div>

              {scheduleForm.schedule_type === 'daily' ? (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Time (UTC)</label>
                  <input
                    type="time"
                    value={scheduleForm.daily_time}
                    onChange={e => setScheduleForm(f => ({ ...f, daily_time: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', fontSize: 13 }}
                  />
                </div>
              ) : (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Interval (hours)</label>
                  <input
                    type="number"
                    min="1"
                    max="168"
                    value={scheduleForm.interval_hours}
                    onChange={e => setScheduleForm(f => ({ ...f, interval_hours: parseInt(e.target.value) || 24 }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', fontSize: 13 }}
                  />
                </div>
              )}
            </div>

            {/* Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={scheduleForm.notify_on_regression}
                  onChange={e => setScheduleForm(f => ({ ...f, notify_on_regression: e.target.checked }))}
                />
                <span>Notify on regression (webhook fires when score drops &gt;5 points)</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={scheduleForm.auto_mine}
                  onChange={e => setScheduleForm(f => ({ ...f, auto_mine: e.target.checked }))}
                />
                <span>Auto-mine failures after each run (generate training data from failures)</span>
              </label>
              {scheduleForm.auto_mine && (
                <div style={{ marginLeft: 28 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Mine failures below score:
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={scheduleForm.mine_max_score}
                      onChange={e => setScheduleForm(f => ({ ...f, mine_max_score: parseInt(e.target.value) || 60 }))}
                      style={{ width: 60, marginLeft: 8, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', fontSize: 13 }}
                    />
                  </label>
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={async () => {
                  setScheduleSaving(true)
                  try {
                    const res = await saveEvalSchedule(envId, scheduleForm)
                    setSchedule(res.schedule)
                  } catch (e) { alert(e.message) }
                  setScheduleSaving(false)
                }}
                className="btn btn-primary"
                disabled={scheduleSaving}
                style={{ fontSize: 13, padding: '8px 20px' }}
              >
                {scheduleSaving ? 'Saving...' : schedule ? 'Update Schedule' : 'Create Schedule'}
              </button>

              {schedule && (
                <>
                  <button
                    onClick={async () => {
                      setScheduleSaving(true)
                      try {
                        const res = await saveEvalSchedule(envId, { ...scheduleForm, is_enabled: !schedule.is_enabled })
                        setSchedule(res.schedule)
                        setScheduleForm(f => ({ ...f, is_enabled: !schedule.is_enabled }))
                      } catch (e) { alert(e.message) }
                      setScheduleSaving(false)
                    }}
                    className="btn"
                    style={{ fontSize: 13, padding: '8px 16px' }}
                  >
                    {schedule.is_enabled ? 'Pause' : 'Enable'}
                  </button>

                  <button
                    onClick={async () => {
                      try {
                        await triggerScheduleNow(envId)
                        const res = await getEvalSchedule(envId)
                        setSchedule(res.schedule)
                      } catch (e) { alert(e.message) }
                    }}
                    className="btn"
                    style={{ fontSize: 13, padding: '8px 16px' }}
                    disabled={schedule.last_status === 'running'}
                  >
                    <Play size={13} style={{ marginRight: 4 }} />
                    Run Now
                  </button>

                  <button
                    onClick={async () => {
                      if (!confirm('Delete this eval schedule?')) return
                      try {
                        await deleteEvalSchedule(envId)
                        setSchedule(null)
                      } catch (e) { alert(e.message) }
                    }}
                    className="btn"
                    style={{ fontSize: 13, padding: '8px 16px', color: '#ef4444' }}
                  >
                    <Trash2 size={13} />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Schedule Status Card */}
          {schedule && (
            <div className="card" style={{ padding: 24 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Schedule Status</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                <div style={{ padding: 16, borderRadius: 8, background: 'var(--bg-secondary)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Last Status</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: {
                    completed: '#22c55e', running: '#3b82f6', failed: '#ef4444', idle: 'var(--text-secondary)',
                  }[schedule.last_status] || 'var(--text-primary)' }}>
                    {schedule.last_status || 'Never run'}
                  </div>
                </div>
                <div style={{ padding: 16, borderRadius: 8, background: 'var(--bg-secondary)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Last Score</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {schedule.last_score != null ? `${schedule.last_score.toFixed(1)}` : 'N/A'}
                  </div>
                </div>
                <div style={{ padding: 16, borderRadius: 8, background: 'var(--bg-secondary)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Total Runs</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{schedule.run_count}</div>
                </div>
                <div style={{ padding: 16, borderRadius: 8, background: 'var(--bg-secondary)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Next Run</div>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>
                    {schedule.next_run_at ? new Date(schedule.next_run_at + 'Z').toLocaleString() : 'Not scheduled'}
                  </div>
                </div>
              </div>

              {schedule.last_run_at && (
                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
                  Last run: {new Date(schedule.last_run_at + 'Z').toLocaleString()}
                  {schedule.consecutive_failures > 0 && (
                    <span style={{ color: '#ef4444', marginLeft: 8 }}>
                      ({schedule.consecutive_failures} consecutive failure{schedule.consecutive_failures > 1 ? 's' : ''})
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* How it works */}
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>How Eval Scheduling Works</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
              <div style={{ display: 'flex', gap: 8 }}><span style={{ color: '#3b82f6', fontWeight: 700 }}>1.</span> Set a schedule (daily at a specific time, or every N hours)</div>
              <div style={{ display: 'flex', gap: 8 }}><span style={{ color: '#3b82f6', fontWeight: 700 }}>2.</span> Cane automatically runs your full eval suite against your agent</div>
              <div style={{ display: 'flex', gap: 8 }}><span style={{ color: '#3b82f6', fontWeight: 700 }}>3.</span> If scores regress, your webhook fires with the details</div>
              <div style={{ display: 'flex', gap: 8 }}><span style={{ color: '#3b82f6', fontWeight: 700 }}>4.</span> Optionally auto-mine failures and generate training data</div>
              <div style={{ display: 'flex', gap: 8 }}><span style={{ color: '#3b82f6', fontWeight: 700 }}>5.</span> Check the Results tab for all scheduled run history</div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ TRAINING DATA TAB ═══ */}
      {tab === 'training' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Export Stats Card */}
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, marginBottom: 4 }}>Training Data Pipeline</h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
                  Export eval results as fine-tuning datasets or submit directly to OpenAI
                </p>
              </div>
              <button className="btn btn-ghost" onClick={async () => {
                try {
                  const stats = await getExportStats(envId)
                  setExportStats(stats)
                } catch (err) { alert(err.message) }
              }} style={{ fontSize: '0.78rem' }}>
                Refresh Stats
              </button>
            </div>

            {exportStats ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
                {[
                  { label: 'Total Results', value: exportStats.total_results },
                  { label: 'SFT Ready (80+)', value: exportStats.sft_ready, color: 'var(--success)' },
                  { label: 'DPO Pairs', value: exportStats.dpo_pair_potential, color: '#2563eb' },
                  { label: 'Completed Runs', value: exportStats.completed_runs },
                ].map(s => (
                  <div key={s.label} className="stat-card" style={{ padding: 14, textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: s.color || 'var(--text-primary)' }}>{s.value}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}

                {/* Score distribution */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Score Distribution</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {Object.entries(exportStats.score_distribution || {}).map(([label, count]) => (
                      <div key={label} style={{
                        flex: 1, padding: '8px 10px', borderRadius: 6,
                        background: 'var(--bg-card)', border: '1px solid var(--rule-light)', textAlign: 'center',
                      }}>
                        <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{count}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                Click "Refresh Stats" to see how much training data is available from your eval runs.
              </div>
            )}
          </div>

          {/* Export Section */}
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, marginBottom: 4 }}>
              <Download size={16} style={{ marginRight: 8, verticalAlign: 'middle', opacity: 0.6 }} />
              Export Dataset
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 16px' }}>
              Download training data from your eval runs in standard fine-tuning formats
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 12, alignItems: 'end' }}>
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Format</label>
                <select className="input" value={exportFormat} onChange={e => setExportFormat(e.target.value)} style={{ fontSize: '0.82rem' }}>
                  <option value="openai">OpenAI Fine-tune</option>
                  <option value="sft">SFT (prompt/completion)</option>
                  <option value="dpo">DPO (preference pairs)</option>
                  <option value="raw">Raw (full eval data)</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Min Score</label>
                <input className="input" type="number" min="0" max="100" value={exportMinScore}
                  onChange={e => setExportMinScore(Number(e.target.value))}
                  style={{ fontSize: '0.82rem' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Source Run</label>
                <select className="input" id="export-run-select" style={{ fontSize: '0.82rem' }}>
                  {(env?.runs || []).filter(r => r.status === 'completed').map(r => (
                    <option key={r.id} value={r.id}>
                      {r.created_at ? new Date(r.created_at).toLocaleDateString() : 'Run'} (score: {Math.round(r.overall_score || 0)})
                    </option>
                  ))}
                </select>
              </div>
              <button
                className="btn"
                disabled={exporting}
                onClick={async () => {
                  const sel = document.getElementById('export-run-select')
                  if (!sel?.value) return alert('Select a completed run first')
                  setExporting(true)
                  try {
                    const res = await exportRun(envId, sel.value, exportFormat, exportMinScore)
                    // Trigger file download
                    const blob = new Blob([typeof res === 'string' ? res : JSON.stringify(res)], { type: 'application/jsonl' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `${exportFormat}_${new Date().toISOString().slice(0, 10)}.jsonl`
                    a.click()
                    URL.revokeObjectURL(url)
                  } catch (err) { alert(err.message) }
                  setExporting(false)
                }}
                style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}
              >
                {exporting ? <><Loader2 size={14} className="spin" style={{ marginRight: 6 }} /> Exporting...</> : <><Download size={14} style={{ marginRight: 6 }} /> Export</>}
              </button>
            </div>
          </div>

          {/* Fine-tune Section */}
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, marginBottom: 4 }}>
              <Brain size={16} style={{ marginRight: 8, verticalAlign: 'middle', opacity: 0.6 }} />
              Fine-tune Model
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 16px' }}>
              Train a custom model using high-scoring eval results via OpenAI's fine-tuning API
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Base Model</label>
                <select className="input" value={ftModel} onChange={e => setFtModel(e.target.value)} style={{ fontSize: '0.82rem' }}>
                  <option value="gpt-4o-mini-2024-07-18">GPT-4o Mini</option>
                  <option value="gpt-4o-2024-08-06">GPT-4o</option>
                  <option value="gpt-3.5-turbo-0125">GPT-3.5 Turbo</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Min Score Threshold</label>
                <input className="input" type="number" min="0" max="100" value={ftMinScore}
                  onChange={e => setFtMinScore(Number(e.target.value))} style={{ fontSize: '0.82rem' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Epochs</label>
                <input className="input" type="number" min="1" max="10" value={ftEpochs}
                  onChange={e => setFtEpochs(Number(e.target.value))} style={{ fontSize: '0.82rem' }}
                />
              </div>
            </div>

            {/* Preview + Submit */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              <button
                className="btn btn-ghost"
                onClick={async () => {
                  try {
                    const data = await generateDataset(envId, 'openai', ftMinScore)
                    setDatasetPreview(data)
                  } catch (err) { alert(err.message) }
                }}
                style={{ fontSize: '0.8rem' }}
              >
                Preview Dataset
              </button>
              <button
                className="btn"
                disabled={ftSubmitting}
                onClick={async () => {
                  if (!confirm(`Submit fine-tune job?\n\nModel: ${ftModel}\nMin score: ${ftMinScore}\nEpochs: ${ftEpochs}\n\nThis will incur OpenAI fine-tuning costs.`)) return
                  setFtSubmitting(true)
                  try {
                    const result = await submitFinetune(envId, ftModel, ftMinScore, ftEpochs)
                    alert(`Fine-tune job submitted!\n\nJob ID: ${result.job_id}\nTraining examples: ${result.training_examples}\nStatus: ${result.status}`)
                    setDatasetPreview(null)
                    // Refresh jobs list
                    const jobs = await listFinetuneJobs()
                    setFtJobs(jobs.jobs || [])
                  } catch (err) { alert(err.message) }
                  setFtSubmitting(false)
                }}
                style={{ fontSize: '0.8rem', background: '#2563eb' }}
              >
                {ftSubmitting ? <><Loader2 size={14} className="spin" style={{ marginRight: 6 }} /> Submitting...</> : <><Brain size={14} style={{ marginRight: 6 }} /> Submit Fine-tune Job</>}
              </button>
            </div>

            {/* Dataset preview */}
            {datasetPreview && (
              <div style={{ marginBottom: 20, padding: 16, background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--rule-light)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>Dataset Preview</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{datasetPreview.total_examples} training examples</span>
                </div>
                {(datasetPreview.dataset_preview || []).slice(0, 2).map((ex, i) => (
                  <div key={i} style={{ marginBottom: 10, padding: 10, background: 'var(--paper)', borderRadius: 6, border: '1px solid var(--rule-light)' }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Example {i + 1}</div>
                    {(ex.messages || []).filter(m => m.role !== 'system').map((m, j) => (
                      <div key={j} style={{ fontSize: '0.75rem', marginBottom: 4, color: m.role === 'user' ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                        <strong style={{ textTransform: 'capitalize', fontSize: '0.65rem', color: 'var(--text-muted)' }}>{m.role}:</strong>{' '}
                        {(m.content || '').slice(0, 150)}{m.content?.length > 150 ? '...' : ''}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* Fine-tune Jobs */}
            <div style={{ borderTop: '1px solid var(--rule-light)', paddingTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>Fine-tune Jobs</span>
                <button className="btn btn-ghost" onClick={async () => {
                  try {
                    const jobs = await listFinetuneJobs()
                    setFtJobs(jobs.jobs || [])
                  } catch (err) { alert(err.message) }
                }} style={{ fontSize: '0.72rem', padding: '4px 10px' }}>Refresh</button>
              </div>

              {ftJobs.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {ftJobs.map(j => (
                    <div key={j.job_id} style={{
                      padding: '12px 16px', borderRadius: 8, background: 'var(--bg-card)',
                      border: '1px solid var(--rule-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 2 }}>
                          {j.fine_tuned_model || j.model}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {j.job_id?.slice(0, 20)}... {j.trained_tokens ? `| ${j.trained_tokens.toLocaleString()} tokens` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 12, fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase',
                          background: j.status === 'succeeded' ? 'rgba(74,222,128,0.1)' : j.status === 'failed' ? 'rgba(248,113,113,0.1)' : 'var(--accent-muted)',
                          color: j.status === 'succeeded' ? 'var(--success)' : j.status === 'failed' ? 'var(--error)' : 'var(--warning)',
                        }}>{j.status}</span>
                        {j.status === 'running' && (
                          <button className="btn btn-ghost" onClick={async () => {
                            if (confirm('Cancel this fine-tune job?')) {
                              try {
                                await cancelFinetune(j.job_id)
                                const jobs = await listFinetuneJobs()
                                setFtJobs(jobs.jobs || [])
                              } catch (err) { alert(err.message) }
                            }
                          }} style={{ fontSize: '0.68rem', padding: '2px 8px', color: 'var(--error)' }}>Cancel</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                  No fine-tune jobs yet. Configure settings above and submit a job.
                </div>
              )}
            </div>
          </div>

          {/* ── Failure Mining ── */}
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, marginBottom: 4 }}>
                  <Sparkles size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6, color: '#f59e0b' }} />
                  Failure Mining
                </h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
                  Automatically turn agent mistakes into training data. Low-scoring responses get rewritten by a strong LLM.
                </p>
              </div>
              <button className="btn btn-ghost" onClick={async () => {
                try {
                  const data = await getMiningJobs(envId)
                  setMiningJobs(data.jobs || [])
                } catch {}
              }}>
                Refresh
              </button>
            </div>

            {/* Mine trigger */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, padding: 16, background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 4 }}>Mine results scoring below</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="range" min="20" max="80" step="5"
                    value={miningMaxScore}
                    onChange={e => setMiningMaxScore(Number(e.target.value))}
                    style={{ width: 120 }}
                  />
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text)', minWidth: 32 }}>{miningMaxScore}</span>
                </div>
              </div>
              <button
                className="btn btn-primary"
                disabled={miningRunning}
                onClick={async () => {
                  setMiningRunning(true)
                  try {
                    const result = await triggerMining(envId, miningMaxScore)
                    // Start polling
                    const poll = setInterval(async () => {
                      try {
                        const jobs = await getMiningJobs(envId)
                        setMiningJobs(jobs.jobs || [])
                        const active = (jobs.jobs || []).find(j => j.status === 'pending' || j.status === 'running')
                        if (!active) {
                          clearInterval(poll)
                          setMiningRunning(false)
                        }
                      } catch { clearInterval(poll); setMiningRunning(false) }
                    }, 3000)
                    // Immediate refresh
                    const jobs = await getMiningJobs(envId)
                    setMiningJobs(jobs.jobs || [])
                  } catch (err) {
                    alert(err.message || 'Failed to start mining')
                    setMiningRunning(false)
                  }
                }}
              >
                {miningRunning ? <><Loader2 size={14} className="spin" /> Mining...</> : <><Wand2 size={14} /> Mine Failures</>}
              </button>
            </div>

            {/* Mining jobs list */}
            {miningJobs.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {miningJobs.map(job => (
                  <div key={job.id} style={{
                    padding: '12px 16px', background: 'var(--paper)', border: '1px solid var(--rule)',
                    borderRadius: 8, cursor: 'pointer',
                  }} onClick={async () => {
                    if (miningExpanded === job.id) { setMiningExpanded(null); setMiningDetail(null); return }
                    try {
                      const detail = await getMiningJobDetail(envId, job.id)
                      setMiningDetail(detail)
                      setMiningExpanded(job.id)
                    } catch {}
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{
                          fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                          background: job.status === 'completed' ? 'rgba(34,197,94,0.1)' : job.status === 'running' ? 'rgba(59,130,246,0.1)' : job.status === 'failed' ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.06)',
                          color: job.status === 'completed' ? '#22c55e' : job.status === 'running' ? '#3b82f6' : job.status === 'failed' ? '#ef4444' : 'var(--text-muted)',
                        }}>
                          {job.status}
                        </span>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                          {job.total_mined} / {job.total_failures} mined
                        </span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          threshold: {(job.config || {}).max_score || 60}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {job.created_at ? new Date(job.created_at).toLocaleDateString() : ''}
                        </span>
                        {job.status === 'completed' && (
                          <>
                            <button className="btn btn-ghost" style={{ fontSize: '0.7rem', padding: '3px 8px' }} onClick={async (e) => {
                              e.stopPropagation()
                              try {
                                const data = await exportMinedData(envId, job.id, 'dpo')
                                const blob = new Blob([data], { type: 'application/jsonl' })
                                const url = URL.createObjectURL(blob)
                                const a = document.createElement('a')
                                a.href = url; a.download = `mined_dpo_${new Date().toISOString().slice(0, 10)}.jsonl`
                                a.click(); URL.revokeObjectURL(url)
                              } catch (err) { alert(err.message) }
                            }}>
                              <Download size={12} /> DPO
                            </button>
                            <button className="btn btn-ghost" style={{ fontSize: '0.7rem', padding: '3px 8px' }} onClick={async (e) => {
                              e.stopPropagation()
                              try {
                                const data = await exportMinedData(envId, job.id, 'sft')
                                const blob = new Blob([data], { type: 'application/jsonl' })
                                const url = URL.createObjectURL(blob)
                                const a = document.createElement('a')
                                a.href = url; a.download = `mined_sft_${new Date().toISOString().slice(0, 10)}.jsonl`
                                a.click(); URL.revokeObjectURL(url)
                              } catch (err) { alert(err.message) }
                            }}>
                              <Download size={12} /> SFT
                            </button>
                          </>
                        )}
                        {job.status === 'completed' && (
                          <button className="btn btn-ghost" style={{ fontSize: '0.7rem', padding: '3px 8px', color: '#ef4444' }} onClick={async (e) => {
                            e.stopPropagation()
                            if (!confirm('Delete this mining job and all its results?')) return
                            try {
                              await deleteMiningJob(envId, job.id)
                              setMiningJobs(prev => prev.filter(j => j.id !== job.id))
                            } catch (err) { alert(err.message) }
                          }}>
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {miningExpanded === job.id && miningDetail && (
                      <div style={{ marginTop: 16, borderTop: '1px solid var(--rule)', paddingTop: 16 }}>
                        {/* Failure type distribution */}
                        {miningDetail.failure_type_distribution && Object.keys(miningDetail.failure_type_distribution).length > 0 && (
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                            {Object.entries(miningDetail.failure_type_distribution).map(([type, count]) => (
                              <span key={type} style={{
                                fontSize: '0.7rem', fontWeight: 600, padding: '3px 10px', borderRadius: 12,
                                background: type === 'hallucination' ? 'rgba(239,68,68,0.1)' : type === 'incomplete' ? 'rgba(234,179,8,0.1)' : type === 'factual_error' ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.06)',
                                color: type === 'hallucination' ? '#ef4444' : type === 'incomplete' ? '#eab308' : type === 'factual_error' ? '#f87171' : 'var(--text-secondary)',
                              }}>
                                {type.replace(/_/g, ' ')}: {count}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Examples */}
                        {(miningDetail.examples || []).slice(0, 10).map((ex, i) => (
                          <div key={ex.id} style={{
                            marginBottom: 12, padding: '12px 14px', background: 'rgba(255,255,255,0.02)',
                            border: '1px solid var(--rule)', borderRadius: 6,
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text)' }}>
                                {ex.prompt?.slice(0, 80)}{ex.prompt?.length > 80 ? '...' : ''}
                              </span>
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <span style={{
                                  fontSize: '0.65rem', fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                                  background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                                }}>
                                  {ex.failure_type?.replace(/_/g, ' ')}
                                </span>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                  {ex.original_score?.toFixed(0)} {ex.estimated_improved_score ? `\u2192 ~${ex.estimated_improved_score.toFixed(0)}` : ''}
                                </span>
                              </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                              <div>
                                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Original (Rejected)</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5, maxHeight: 80, overflow: 'hidden' }}>
                                  {ex.original_answer?.slice(0, 200)}{ex.original_answer?.length > 200 ? '...' : ''}
                                </div>
                              </div>
                              <div>
                                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Improved (Chosen)</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5, maxHeight: 80, overflow: 'hidden' }}>
                                  {ex.improved_answer?.slice(0, 200)}{ex.improved_answer?.length > 200 ? '...' : ''}
                                </div>
                              </div>
                            </div>
                            {ex.improvement_reasoning && (
                              <div style={{ marginTop: 6, fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                {ex.improvement_reasoning}
                              </div>
                            )}
                          </div>
                        ))}
                        {(miningDetail.examples || []).length > 10 && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', padding: 8 }}>
                            Showing 10 of {miningDetail.examples.length} examples. Export to see all.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {miningJobs.length === 0 && (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                No mining jobs yet. Run evals first, then mine failures to generate training data.
              </div>
            )}
          </div>

          {/* How it works */}
          <div className="card" style={{ padding: 20, background: 'var(--bg-card)', border: '1px solid var(--rule-light)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, marginBottom: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>How the Training Pipeline Works</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
              {[
                { step: '1', title: 'Run Evals', desc: 'Evaluate your agent with LLM-as-judge scoring' },
                { step: '2', title: 'Filter Quality', desc: 'High-scoring responses (80+) become training examples' },
                { step: '3', title: 'Mine Failures', desc: 'Low-scoring responses get rewritten into training data' },
                { step: '4', title: 'Fine-tune', desc: 'Submit DPO/SFT datasets to train improved models' },
                { step: '5', title: 'Re-evaluate', desc: 'Run evals on fine-tuned models to measure gains' },
              ].map(s => (
                <div key={s.step} style={{ textAlign: 'center' }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', background: s.step === '3' ? 'rgba(245,158,11,0.15)' : 'rgba(37,99,235,0.1)',
                    color: s.step === '3' ? '#f59e0b' : '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.75rem', fontWeight: 800, margin: '0 auto 8px',
                  }}>{s.step}</div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: 4 }}>{s.title}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{s.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}