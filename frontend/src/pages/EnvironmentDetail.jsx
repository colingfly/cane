import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  FlaskConical, ArrowLeft, Plus, Trash2, Check, X, Play,
  SlidersHorizontal, ListChecks, BarChart3, Settings, Sparkles,
} from 'lucide-react'
import {
  getEnvironment, updateEnvironment,
  addTestCase, updateTestCase, deleteTestCase,
  updateCriteria, addCustomRule, deleteCustomRule,
  getRuns, triggerRun, getRunDetail,
} from '../api/eval'
import { getAgents } from '../api/client'

const TABS = [
  { id: 'setup', label: 'Setup', icon: Settings },
  { id: 'cases', label: 'Test Cases', icon: ListChecks },
  { id: 'criteria', label: 'Judge Criteria', icon: SlidersHorizontal },
  { id: 'results', label: 'Results', icon: BarChart3 },
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

  if (loading) return <div className="loading-center"><div className="spinner" /></div>
  if (!env) return <div className="empty-state"><h3>Environment not found</h3></div>

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
        <ArrowLeft size={14} /> Back to Environments
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
          <h3 style={{ marginBottom: 20 }}>Environment Details</h3>
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
              placeholder="What does this environment test?"
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
        </div>
      )}

      {/* ═══ TEST CASES TAB ═══ */}
      {tab === 'cases' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <span style={{ fontWeight: 600 }}>{env.test_cases?.length || 0} test cases</span>
            </div>
            <button className="btn btn-primary" onClick={() => setShowAddCase(!showAddCase)}>
              <Plus size={14} /> Add Test Case
            </button>
          </div>

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
          ) : !showAddCase ? (
            <div className="empty-state">
              <ListChecks size={28} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
              <h3>No test cases yet</h3>
              <p>Add questions to evaluate your agent against.</p>
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
              background: totalWeight === 100 ? 'rgba(61,140,92,0.1)' : 'rgba(196,78,63,0.1)',
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
                        color: 'white', flexShrink: 0, padding: 0,
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

          <button
            className="btn btn-primary"
            onClick={handleSaveCriteria}
            disabled={saving || totalWeight !== 100}
            style={{ marginTop: 16 }}
          >
            {saving ? 'Saving...' : 'Save Criteria'}
          </button>
          {totalWeight !== 100 && (
            <span style={{ fontSize: '0.78rem', color: 'var(--error)', marginLeft: 12 }}>
              Weights must sum to 100
            </span>
          )}

          {/* Custom Rules */}
          <div style={{ marginTop: 32 }}>
            <div style={{
              padding: '20px 24px',
              background: 'linear-gradient(135deg, var(--accent-muted), rgba(200,150,62,0.04))',
              border: '1px solid rgba(200,150,62,0.2)',
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
                  padding: '8px 12px', background: 'white', borderRadius: 6,
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
        </div>
      )}

      {/* ═══ RESULTS TAB ═══ */}
      {tab === 'results' && (
        <div>
          {/* Running indicator */}
          {running && (
            <div className="card" style={{
              marginBottom: 20, textAlign: 'center', padding: 32,
              background: 'linear-gradient(135deg, var(--accent-muted), rgba(200,150,62,0.04))',
              border: '1px solid rgba(200,150,62,0.2)',
            }}>
              <div className="spinner" style={{ margin: '0 auto 16px', width: 28, height: 28 }} />
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Evaluation running...</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {runDetail?.results?.length || 0} / {env.test_cases?.length || 0} test cases complete
              </div>
            </div>
          )}

          {/* Run detail view */}
          {runDetail && runDetail.status !== 'pending' && (
            <div>
              {/* Summary cards */}
              {runDetail.status === 'completed' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                  {[
                    {
                      label: 'Overall Score', value: Math.round(runDetail.overall_score || 0), suffix: '/100',
                      color: (runDetail.overall_score || 0) >= 80 ? 'var(--success)' : (runDetail.overall_score || 0) >= 60 ? 'var(--warning)' : 'var(--error)',
                    },
                    { label: 'Passed', value: runDetail.passed, suffix: '', color: 'var(--success)' },
                    { label: 'Warned', value: runDetail.warned, suffix: '', color: 'var(--warning)' },
                    { label: 'Failed', value: runDetail.failed, suffix: '', color: 'var(--error)' },
                  ].map((s, i) => (
                    <div key={i} className="card" style={{ padding: 16 }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                        <span style={{ fontSize: '1.5rem', fontWeight: 800, color: s.color, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>{s.value}</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{s.suffix}</span>
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

              {/* Individual results */}
              {runDetail.results?.map((r, i) => (
                <div key={r.id} className="card" style={{
                  marginBottom: 10, cursor: 'pointer',
                  borderLeft: `3px solid ${r.status === 'pass' ? 'var(--success)' : r.status === 'warn' ? 'var(--warning)' : 'var(--error)'}`,
                }} onClick={() => setExpandedResult(expandedResult === i ? null : i)}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 10,
                          fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                          background: r.status === 'pass' ? 'rgba(61,140,92,0.12)' : r.status === 'warn' ? 'rgba(200,150,62,0.12)' : 'rgba(196,78,63,0.12)',
                          color: r.status === 'pass' ? 'var(--success)' : r.status === 'warn' ? 'var(--warning)' : 'var(--error)',
                        }}>{r.status}</span>
                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{r.question}</span>
                      </div>
                      {r.response_time_ms > 0 && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{(r.response_time_ms / 1000).toFixed(1)}s</span>
                      )}
                    </div>
                    <span style={{
                      fontSize: '1.4rem', fontWeight: 800,
                      fontFamily: 'var(--font-display)',
                      color: r.status === 'pass' ? 'var(--success)' : r.status === 'warn' ? 'var(--warning)' : 'var(--error)',
                    }}>{Math.round(r.overall_score)}</span>
                  </div>

                  {expandedResult === i && (
                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                        <div>
                          <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Agent's Answer</div>
                          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6, padding: 12, background: 'var(--cane-50)', borderRadius: 8, border: '1px solid var(--border)', maxHeight: 200, overflow: 'auto' }}>
                            {r.agent_answer}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Expected Answer</div>
                          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6, padding: 12, background: 'var(--cane-50)', borderRadius: 8, border: '1px solid var(--border)', maxHeight: 200, overflow: 'auto' }}>
                            {r.expected_answer || '(not specified)'}
                          </div>
                        </div>
                      </div>

                      {r.judge_reasoning && (
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Judge Reasoning</div>
                          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, fontStyle: 'italic' }}>{r.judge_reasoning}</div>
                        </div>
                      )}

                      <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Score Breakdown</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        {Object.entries(r.criteria_scores || {}).map(([key, val]) => {
                          const score = typeof val === 'object' ? val.score : val
                          return (
                            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ width: 90, fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{key}</span>
                              <div style={{ flex: 1, height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{
                                  width: `${score}%`, height: '100%',
                                  background: score >= 80 ? 'var(--success)' : score >= 60 ? 'var(--warning)' : 'var(--error)',
                                  borderRadius: 3,
                                }} />
                              </div>
                              <span style={{
                                fontSize: '0.75rem', fontWeight: 700, minWidth: 28, textAlign: 'right',
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
                              background: r.status === 'completed' ? 'rgba(61,140,92,0.1)' : r.status === 'failed' ? 'rgba(196,78,63,0.1)' : 'var(--accent-muted)',
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
                          <div style={{
                            fontSize: '1.75rem', fontWeight: 800,
                            fontFamily: 'var(--font-display)',
                            color: r.overall_score >= 80 ? 'var(--success)' : r.overall_score >= 60 ? 'var(--warning)' : 'var(--error)',
                          }}>{Math.round(r.overall_score)}</div>
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
    </div>
  )
}