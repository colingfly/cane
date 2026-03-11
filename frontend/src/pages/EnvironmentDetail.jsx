import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  FlaskConical, ArrowLeft, Plus, Trash2, Check, X, Play,
  SlidersHorizontal, ListChecks, BarChart3, Settings, Sparkles, Wand2,
} from 'lucide-react'
import {
  getEnvironment, updateEnvironment,
  addTestCase, updateTestCase, deleteTestCase,
  updateCriteria, addCustomRule, deleteCustomRule,
  getRuns, triggerRun, getRunDetail, deleteRun,
  generateTestCases,
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

  // Auto-generate
  const [showGenerate, setShowGenerate] = useState(false)
  const [genCount, setGenCount] = useState(10)
  const [genDifficulty, setGenDifficulty] = useState('mixed')
  const [generating, setGenerating] = useState(false)

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
                    <option value={5}>5 — Quick check</option>
                    <option value={10}>10 — Standard</option>
                    <option value={15}>15 — Thorough</option>
                    <option value={20}>20 — Comprehensive</option>
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
                    <option value="easy">Easy — Straightforward factual</option>
                    <option value="mixed">Mixed — Facts + edge cases + adversarial</option>
                    <option value="adversarial">Adversarial — Hallucination traps + tricks</option>
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
              background: 'var(--cane-900)', borderRadius: 8, border: '1px solid var(--rule)',
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, var(--accent), var(--gold))' }} />
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
                    background: 'var(--cane-900)', padding: '22px 28px',
                    minWidth: 160, position: 'relative',
                  }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, var(--accent), var(--gold))' }} />
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
    </div>
  )
}