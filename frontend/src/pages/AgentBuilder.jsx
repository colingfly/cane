import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { getAgents, getAgentTemplates, createAgent, deleteAgent } from '../api/client'

const ICON_COLORS = {
  OG: { bg: 'rgba(255,255,255,0.15)' },
  AT: { bg: 'rgba(255,255,255,0.12)' },
  KB: { bg: 'rgba(255,255,255,0.10)' },
}
const DEFAULT_COLOR = { bg: 'rgba(255,255,255,0.08)' }

function AgentIcon({ icon, size = 40 }) {
  const label = (icon || '??').slice(0, 2).toUpperCase()
  const colors = ICON_COLORS[label] || DEFAULT_COLOR
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.25,
      background: colors.bg, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-display)', fontWeight: 700,
      fontSize: size * 0.36, letterSpacing: '0.02em', flexShrink: 0,
    }}>
      {label}
    </div>
  )
}

export default function AgentBuilder() {
  const [agents, setAgents] = useState([])
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showCustomModal, setShowCustomModal] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [customName, setCustomName] = useState('')
  const [customDesc, setCustomDesc] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      const [agentRes, templateRes] = await Promise.all([getAgents(), getAgentTemplates()])
      setAgents(agentRes.agents || [])
      setTemplates(templateRes.templates || [])
    } catch (e) {
      console.error('Failed to load agents:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateFromTemplate = async () => {
    if (creating || !selectedTemplate) return
    setCreating(true)
    setError('')
    try {
      const res = await createAgent({ agent_type: selectedTemplate.type })
      if (res.id) {
        setSelectedTemplate(null)
        navigate(`/agents/${res.id}`)
      }
    } catch (e) {
      setError(e.message)
      setSelectedTemplate(null)
    } finally {
      setCreating(false)
    }
  }

  const handleCreateCustom = async () => {
    if (!customName.trim() || creating) return
    setCreating(true)
    setError('')
    try {
      const res = await createAgent({
        agent_type: 'custom',
        name: customName.trim(),
        description: customDesc.trim(),
      })
      if (res.id) {
        setShowCustomModal(false)
        setCustomName('')
        setCustomDesc('')
        navigate(`/agents/${res.id}`)
      }
    } catch (e) {
      setError(e.message)
      setShowCustomModal(false)
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (e, agentId) => {
    e.stopPropagation()
    if (!confirm('Delete this agent and all its files?')) return
    try {
      await deleteAgent(agentId)
      setAgents(prev => prev.filter(a => a.id !== agentId))
    } catch (e) {
      console.error('Failed to delete agent:', e)
      alert('Failed to delete agent. Please try again.')
    }
  }

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  return (
    <div className="fade-in">
      {/* Welcome banner for first-time users — disappears once they create an agent */}
      {!loading && agents.length === 0 && (
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12, padding: '20px 24px', marginBottom: 28,
        }}>
          <div style={{ fontWeight: 700, fontSize: '0.9375rem', marginBottom: 4, fontFamily: 'var(--font-display)' }}>
            Welcome to Cane
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Start by choosing a template or creating a custom agent. Upload your files, and your agent will be ready to answer questions in minutes.
          </div>
        </div>
      )}

      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4, fontFamily: 'var(--font-display)' }}>
          Agent Builder
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          Create AI agents specialized for your files. Choose a template or build your own.
        </p>
      </div>

      {/* Plan limit error */}
      {error && (
        <div style={{
          background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.15)',
          borderRadius: 10, padding: '14px 20px', marginBottom: 24,
          fontSize: '0.8125rem', color: 'var(--error)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>{error}</span>
          <button onClick={() => setError('')} style={{
            background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', fontSize: '1rem', padding: '0 4px',
          }}>x</button>
        </div>
      )}

      {/* Templates */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div style={{ height: 1, flex: 1, background: 'var(--rule)' }} />
        <span style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Templates</span>
        <div style={{ height: 1, flex: 1, background: 'var(--rule)' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 40 }}>
        {templates.map((t) => (
          <div
            key={t.type}
            className="card"
            style={{ cursor: 'pointer', transition: 'all 0.1s', padding: 20 }}
            onClick={() => setSelectedTemplate(t)}
            onMouseOver={e => e.currentTarget.style.borderColor = 'var(--cane-500)'}
            onMouseOut={e => e.currentTarget.style.borderColor = ''}
          >
            <div style={{ marginBottom: 12 }}>
              <AgentIcon icon={t.icon} size={40} />
            </div>
            <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 4, fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>{t.name}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
              {t.description}
            </div>
          </div>
        ))}

        {/* Create Your Own */}
        <div
          className="card"
          style={{
            cursor: 'pointer', transition: 'all 0.1s', padding: 20,
            border: '2px dashed var(--rule)', background: 'transparent',
          }}
          onClick={() => setShowCustomModal(true)}
          onMouseOver={e => e.currentTarget.style.borderColor = 'var(--accent)'}
          onMouseOut={e => e.currentTarget.style.borderColor = 'var(--rule)'}
        >
          <div style={{ marginBottom: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 4,
              border: '2px dashed var(--cane-500)', color: 'var(--cane-500)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Plus size={18} />
            </div>
          </div>
          <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 4, fontFamily: 'var(--font-display)' }}>
            Create Your Own
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
            Upload docs and auto-generate a specialized AI agent.
          </div>
        </div>
      </div>

      {/* Existing Agents */}
      {agents.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{ height: 1, flex: 1, background: 'var(--rule)' }} />
            <span style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              Your Agents
            </span>
            <div style={{ height: 1, flex: 1, background: 'var(--rule)' }} />
          </div>
          <div style={{ border: '1px solid var(--rule)', borderRadius: 8, overflow: 'hidden', background: 'var(--bg-card)' }}>
            {agents.map((a, i) => (
              <div
                key={a.id}
                style={{
                  display: 'flex', alignItems: 'center', padding: '14px 18px',
                  background: 'transparent',
                  borderBottom: i < agents.length - 1 ? '1px solid var(--rule-light)' : 'none',
                  gap: 14, cursor: 'pointer', transition: 'background 0.1s',
                }}
                onClick={() => navigate(`/agents/${a.id}`)}
              >
                {/* Icon square */}
                <div style={{
                  width: 38, height: 38, borderRadius: 8,
                  background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, overflow: 'hidden',
                }}>
                  <AgentIcon icon={a.agent_icon} size={38} />
                </div>

                {/* Info */}
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: '0.88rem', fontWeight: 700, color: 'var(--cane-900)',
                    fontFamily: 'var(--font-display)', letterSpacing: '-0.01em',
                  }}>
                    {a.name}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--cane-400)', marginTop: 1 }}>
                    {a.document_count} documents · {a.agent_type === 'custom' ? 'Custom' : a.agent_type?.replace('_', ' ')}
                  </div>
                </div>

                {/* Prompt status */}
                <span style={{
                  fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
                  color: a.system_prompt ? 'var(--success)' : 'var(--text-faint)',
                  padding: '4px 10px', borderRadius: 4,
                  background: a.system_prompt ? 'var(--success-bg)' : 'rgba(255,255,255,0.04)',
                }}>
                  {a.system_prompt ? 'Active' : 'Draft'}
                </span>

                {/* Delete */}
                <button
                  className="btn btn-ghost"
                  style={{ padding: 4, opacity: 0.4 }}
                  onClick={(e) => handleDelete(e, a.id)}
                  title="Delete agent"
                >
                  <Trash2 size={14} />
                </button>

                {/* Arrow */}
                <span style={{ color: 'var(--text-faint)', fontSize: 16 }}>→</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Template Confirmation Modal */}
      {selectedTemplate && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000,
        }} onClick={() => setSelectedTemplate(null)}>
          <div className="card" style={{ width: 420, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 16 }}>
              <AgentIcon icon={selectedTemplate.icon} size={48} />
              <div>
                <h3 style={{ marginBottom: 2 }}>{selectedTemplate.name}</h3>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Agent Template</div>
              </div>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 24 }}>
              {selectedTemplate.description} This will create a new agent workspace with a pre-configured prompt. You can upload files and customize the prompt after creation.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setSelectedTemplate(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreateFromTemplate} disabled={creating}>
                {creating ? 'Creating...' : 'Create Agent'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Agent Modal */}
      {showCustomModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000,
        }} onClick={() => setShowCustomModal(false)}>
          <div className="card" style={{ width: 420, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 16 }}>Create Custom Agent</h3>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Agent Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Legal Advisor, Product Expert"
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="form-group" style={{ marginBottom: 24 }}>
              <label>Description <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
              <input
                type="text"
                className="form-input"
                placeholder="What does this agent help with?"
                value={customDesc}
                onChange={e => setCustomDesc(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowCustomModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreateCustom} disabled={!customName.trim() || creating}>
                {creating ? 'Creating...' : 'Create Agent'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export { AgentIcon }