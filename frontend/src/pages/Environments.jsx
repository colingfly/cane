import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FlaskConical, Plus, ArrowRight, Sparkles, Trash2 } from 'lucide-react'
import { getEnvironments, createEnvironment, deleteEnvironment } from '../api/eval'
import { getAgents } from '../api/client'

export default function Environments() {
  const navigate = useNavigate()
  const [environments, setEnvironments] = useState([])
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newAgent, setNewAgent] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      const [envRes, agentRes] = await Promise.all([getEnvironments(), getAgents()])
      setEnvironments(envRes.environments || [])
      setAgents(agentRes.agents || [])
      if (agentRes.agents?.length > 0 && !newAgent) {
        setNewAgent(agentRes.agents[0].id)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!newName.trim() || !newAgent) return
    setCreating(true)
    setError('')
    try {
      const env = await createEnvironment(newName.trim(), newAgent, newDesc.trim())
      navigate(`/environments/${env.id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this evaluation and all its test cases?')) return
    try {
      await deleteEnvironment(id)
      setEnvironments(prev => prev.filter(e => e.id !== id))
    } catch (err) {
      console.error(err)
    }
  }

  function scoreColor(score) {
    if (score === null || score === undefined) return 'var(--text-muted)'
    if (score >= 80) return 'var(--success)'
    if (score >= 60) return 'var(--warning)'
    return 'var(--error)'
  }

  if (loading) {
    return <div className="loading-center"><div className="spinner" /></div>
  }

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 8,
            background: 'var(--cane-900)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--cane-400)',
          }}>
            <FlaskConical size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em' }}>Evaluations</h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: 2 }}>
              Test, evaluate, and improve your agents.
            </p>
          </div>
        </div>
        {agents.length > 0 && (
          <button
            className="btn btn-primary"
            onClick={() => setShowCreate(!showCreate)}
          >
            <Plus size={16} /> New Evaluation
          </button>
        )}
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="card" style={{ marginBottom: 24 }}>
          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group">
                <label>Name</label>
                <input
                  className="form-input"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. HR Policy Stress Test"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Agent</label>
                <select className="form-input" value={newAgent} onChange={e => setNewAgent(e.target.value)}>
                  {agents.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.icon} {a.name} ({a.document_count} files)
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Description (optional)</label>
              <input
                className="form-input"
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="What does this evaluation test?"
              />
            </div>
            {error && <p style={{ color: 'var(--error)', fontSize: '0.8125rem', marginBottom: 12 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary" disabled={creating || !newName.trim()}>
                {creating ? 'Creating...' : 'Create Evaluation'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Evaluation list */}
      {environments.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {environments.map(env => (
            <div
              key={env.id}
              className="card"
              style={{ cursor: 'pointer', transition: 'border-color 0.15s' }}
              onClick={() => navigate(`/environments/${env.id}`)}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <FlaskConical size={16} style={{ color: 'var(--accent)' }} />
                    <span style={{ fontWeight: 600, fontSize: '1rem' }}>{env.name}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      → {env.workspace_name}
                    </span>
                  </div>
                  {env.description && (
                    <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginLeft: 26 }}>
                      {env.description}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 16, marginTop: 8, marginLeft: 26 }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {env.test_case_count} test case{env.test_case_count !== 1 ? 's' : ''}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {env.run_count} run{env.run_count !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  {env.last_score !== null && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{
                        fontSize: '1.5rem', fontWeight: 800,
                        fontFamily: 'var(--font-display)',
                        color: scoreColor(env.last_score),
                        letterSpacing: '-0.02em',
                      }}>{Math.round(env.last_score)}</div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>last score</div>
                    </div>
                  )}
                  <button
                    className="btn btn-ghost"
                    onClick={e => { e.stopPropagation(); handleDelete(env.id) }}
                    title="Delete evaluation"
                  >
                    <Trash2 size={15} />
                  </button>
                  <ArrowRight size={16} style={{ color: 'var(--text-muted)' }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : !showCreate ? (
        <div className="empty-state">
          <FlaskConical size={32} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
          {agents.length === 0 ? (
            <>
              <h3>Create an agent first</h3>
              <p>Evaluations test your agents. Build an agent in Agent Builder, then come back here.</p>
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/')}>
                Go to Agent Builder
              </button>
            </>
          ) : (
            <>
              <h3>No evaluations yet</h3>
              <p>Create an evaluation to start testing your agents.</p>
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowCreate(true)}>
                <Plus size={16} /> New Evaluation
              </button>
            </>
          )}
        </div>
      ) : null}

      {/* How it works */}
      {environments.length <= 2 && (
        <div style={{
          marginTop: 40, padding: '28px 32px',
          background: 'linear-gradient(135deg, var(--accent-muted), rgba(200,150,62,0.04))',
          border: '1px solid rgba(200,150,62,0.2)',
          borderRadius: 'var(--radius-lg)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Sparkles size={16} style={{ color: 'var(--accent)' }} />
            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--accent-hover)' }}>How it works</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {[
              { step: '1', title: 'Define Test Cases', desc: 'Write questions your agent should handle' },
              { step: '2', title: 'Set Judge Criteria', desc: 'Weight what matters: accuracy, tone, citations' },
              { step: '3', title: 'Run Evaluation', desc: 'Agent answers, LLM Judge scores each response' },
              { step: '4', title: 'Iterate', desc: 'Tweak prompt or files, run again' },
            ].map((s, i) => (
              <div key={i}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: 'var(--accent)', color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.7rem', fontWeight: 700, marginBottom: 8,
                }}>{s.step}</div>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 4 }}>{s.title}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}