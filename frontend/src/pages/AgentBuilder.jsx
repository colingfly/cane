import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { getAgents, getAgentTemplates, createAgent, deleteAgent } from '../api/client'

const ICON_COLORS = {
  OG: { bg: '#c8963e' },
  AT: { bg: '#5b7bb4' },
  KB: { bg: '#3d8c5c' },
}
const DEFAULT_COLOR = { bg: '#8a7a62' }

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
    }
  }

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  return (
    <div className="fade-in">
      {/* Welcome banner for first-time users — disappears once they create an agent */}
      {!loading && agents.length === 0 && (
        <div style={{
          background: 'var(--accent-muted)', border: '1px solid rgba(200,150,62,0.2)',
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
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-display)' }}>
          Agent Builder
          <span style={{
            fontSize: '0.6rem', fontWeight: 600, background: 'var(--accent)', color: 'white',
            padding: '2px 8px', borderRadius: 10, letterSpacing: '0.05em', textTransform: 'uppercase',
          }}>Beta</span>
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          Create AI agents specialized for your files. Choose a template or build your own.
        </p>
      </div>

      {/* Plan limit error */}
      {error && (
        <div style={{
          background: 'rgba(196,78,63,0.08)', border: '1px solid rgba(196,78,63,0.2)',
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
      <h3 style={{ fontSize: '0.8125rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 16 }}>
        Templates
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 40 }}>
        {templates.map((t) => (
          <div
            key={t.type}
            className="card"
            style={{ cursor: 'pointer', transition: 'all 0.15s', padding: 24 }}
            onClick={() => setSelectedTemplate(t)}
            onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
            onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)' }}
          >
            <div style={{ marginBottom: 14 }}>
              <AgentIcon icon={t.icon} size={44} />
            </div>
            <div style={{ fontWeight: 600, fontSize: '0.9375rem', marginBottom: 6 }}>{t.name}</div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
              {t.description}
            </div>
          </div>
        ))}

        {/* Create Your Own */}
        <div
          className="card"
          style={{
            cursor: 'pointer', transition: 'all 0.15s', padding: 24,
            border: '2px dashed var(--border)', background: 'transparent',
          }}
          onClick={() => setShowCustomModal(true)}
          onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
          onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)' }}
        >
          <div style={{ marginBottom: 14 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 11,
              border: '2px dashed var(--cane-400)', color: 'var(--cane-400)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Plus size={20} />
            </div>
          </div>
          <div style={{ fontWeight: 600, fontSize: '0.9375rem', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            Create Your Own
            <span style={{
              fontSize: '0.55rem', fontWeight: 600, background: 'var(--accent)', color: 'white',
              padding: '1px 6px', borderRadius: 8, letterSpacing: '0.05em',
            }}>BETA</span>
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
            Upload docs and auto-generate a specialized AI agent.
          </div>
        </div>
      </div>

      {/* Existing Agents */}
      {agents.length > 0 && (
        <>
          <h3 style={{ fontSize: '0.8125rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 16 }}>
            Your Agents
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {agents.map(a => (
              <div
                key={a.id}
                className="card"
                style={{ cursor: 'pointer', transition: 'all 0.15s' }}
                onClick={() => navigate(`/agents/${a.id}`)}
                onMouseOver={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                    <AgentIcon icon={a.agent_icon} size={36} />
                    <div>
                      <div style={{ fontWeight: 600 }}>{a.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {a.agent_type === 'custom' ? 'Custom Agent' : a.agent_type?.replace('_', ' ')}
                      </div>
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost"
                    style={{ padding: 4, opacity: 0.5 }}
                    onClick={(e) => handleDelete(e, a.id)}
                    title="Delete agent"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 20, marginTop: 4 }}>
                  <div>
                    <div style={{ fontSize: '1.125rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>{a.document_count}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Files</div>
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <div style={{ fontSize: '0.7rem', color: a.system_prompt ? 'var(--success)' : 'var(--text-muted)', fontWeight: 600 }}>
                      {a.system_prompt ? 'Prompt configured' : 'No prompt yet'}
                    </div>
                  </div>
                </div>
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