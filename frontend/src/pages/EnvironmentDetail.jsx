import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  FlaskConical, ArrowLeft, Plus, Trash2, Check, X, Play, Bell,
  SlidersHorizontal, ListChecks, BarChart3, Settings, Sparkles, Wand2,
  Globe, Zap, Download, Brain, Loader2,
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
} from '../api/eval'
import { getAgents } from '../api/client'

const TABS = [
  { id: 'setup', label: 'Setup', icon: Settings },
  { id: 'cases', label: 'Test Cases', icon: ListChecks },
  { id: 'criteria', label: 'Judge Criteria', icon: SlidersHorizontal },
  { id: 'results', label: 'Results', icon: BarChart3 },
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

                        <div style={{ fontSize: '0.58rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Score Breakdown</div>
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

          {/* How it works */}
          <div className="card" style={{ padding: 20, background: 'var(--bg-card)', border: '1px solid var(--rule-light)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, marginBottom: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>How the Training Pipeline Works</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
              {[
                { step: '1', title: 'Run Evals', desc: 'Evaluate your agent against test cases with LLM-as-judge scoring' },
                { step: '2', title: 'Filter Quality', desc: 'High-scoring responses (80+) become training examples automatically' },
                { step: '3', title: 'Fine-tune', desc: 'Submit to OpenAI to train a custom model on your best responses' },
                { step: '4', title: 'Re-evaluate', desc: 'Run evals on the fine-tuned model to measure improvement' },
              ].map(s => (
                <div key={s.step} style={{ textAlign: 'center' }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', background: 'rgba(37,99,235,0.1)',
                    color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center',
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