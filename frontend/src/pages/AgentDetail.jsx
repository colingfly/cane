import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Upload, Trash2, FileText, Sparkles, Save, ToggleLeft, ToggleRight, MessageSquare, Store, Wrench, Zap, Play, Plus, ChevronDown, ChevronUp } from 'lucide-react'
import {
  getAgent, updateAgent, generateAgentPrompt,
  getDocuments, uploadDocument, deleteDocument, getDocumentStatus,
  publishToMarketplace, getTools, createTool, updateTool, deleteTool, testTool,
} from '../api/client'
import { getEnvironments, getRuns } from '../api/eval'

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

export default function AgentDetail() {
  const { agentId } = useParams()
  const navigate = useNavigate()
  const [agent, setAgent] = useState(null)
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState('')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editPrompt, setEditPrompt] = useState('')
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [dirty, setDirty] = useState(false)
  const [dragover, setDragover] = useState(false)
  const fileRef = useRef()

  // Publish flow
  const [showPublish, setShowPublish] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState(null)
  const [envs, setEnvs] = useState([])
  const [pubEnvId, setPubEnvId] = useState('')
  const [pubCategory, setPubCategory] = useState('general')
  const [pubPackType, setPubPackType] = useState('byod')
  const [pubRuns, setPubRuns] = useState([])
  const [pubRunId, setPubRunId] = useState('')

  // Tools
  const [tools, setTools] = useState([])
  const [showAddTool, setShowAddTool] = useState(false)
  const [toolTesting, setToolTesting] = useState(null)
  const [toolTestResult, setToolTestResult] = useState(null)
  const [expandedTool, setExpandedTool] = useState(null)
  const [newTool, setNewTool] = useState({
    name: '', description: '', url: '', method: 'POST',
    tool_type: 'webhook', fire_and_forget: true,
    auth_type: 'none', auth_value: '',
    parameters: [
      { name: 'question', type: 'string', description: "The user's question", required: true },
      { name: 'answer', type: 'string', description: "The agent's answer", required: true },
    ],
    payload_template: { question: '{{question}}', answer: '{{answer}}' },
  })

  useEffect(() => { loadAgent() }, [agentId])

  const loadAgent = async () => {
    try {
      const [agentRes, docsRes] = await Promise.all([
        getAgent(agentId),
        getDocuments(agentId),
      ])
      setAgent(agentRes)
      setEditPrompt(agentRes.system_prompt || '')
      setEditName(agentRes.name || '')
      setEditDescription(agentRes.agent_description || '')
      setDirty(false)
      setDocuments(docsRes.documents || [])

      // Load tools
      try {
        const toolsRes = await getTools(agentId)
        setTools(toolsRes.tools || [])
      } catch { setTools([]) }
    } catch (e) {
      console.error('Failed to load agent:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async (files) => {
    if (!files?.length || uploading) return
    setUploading(true)

    for (const file of files) {
      setUploadStatus(`Uploading ${file.name}...`)
      try {
        const res = await uploadDocument(file, agentId)
        if (res.document_id) {
          pollStatus(res.document_id)
        }
      } catch (e) {
        setUploadStatus(`Failed: ${file.name}`)
      }
    }

    setUploading(false)
    setUploadStatus('')
    loadAgent()
  }

  const pollStatus = async (docId) => {
    const poll = setInterval(async () => {
      try {
        const s = await getDocumentStatus(docId)
        if (s.status === 'ready' || s.status === 'error') {
          clearInterval(poll)
          loadAgent()
        }
      } catch {
        clearInterval(poll)
      }
    }, 2000)
  }

  const handleDelete = async (docId) => {
    if (!confirm('Delete this file?')) return
    try {
      await deleteDocument(docId)
      setDocuments(prev => prev.filter(d => d.id !== docId))
    } catch (e) {
      console.error('Failed to delete:', e)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await updateAgent(agentId, {
        name: editName,
        agent_description: editDescription,
        system_prompt: editPrompt,
      })
      setAgent(prev => ({ ...prev, name: editName, agent_description: editDescription, system_prompt: editPrompt }))
      setDirty(false)
    } catch (e) {
      console.error('Failed to save agent:', e)
      alert('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const markDirty = () => {
    if (!agent) return
    const changed = editName !== (agent.name || '') ||
      editDescription !== (agent.agent_description || '') ||
      editPrompt !== (agent.system_prompt || '')
    setDirty(changed)
  }

  const handleGenerate = async () => {
    if (generating) return
    setGenerating(true)
    try {
      const res = await generateAgentPrompt(agentId)
      if (res.system_prompt) {
        setEditPrompt(res.system_prompt)
        setAgent(prev => ({ ...prev, system_prompt: res.system_prompt }))
        setDirty(false)
      }
    } catch (e) {
      alert(e.message || 'Failed to generate prompt')
    } finally {
      setGenerating(false)
    }
  }

  const handleToggleHomepage = async () => {
    const newVal = !agent.show_on_homepage
    try {
      await updateAgent(agentId, { show_on_homepage: newVal })
      setAgent(prev => ({ ...prev, show_on_homepage: newVal }))
    } catch (e) {
      console.error('Failed to toggle:', e)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragover(false)
    handleUpload(e.dataTransfer.files)
  }

  const handleOpenPublish = async () => {
    setShowPublish(true)
    try {
      const res = await getEnvironments()
      const agentEnvs = (res.environments || res || []).filter(e => e.workspace_id === agentId)
      setEnvs(agentEnvs)
      if (agentEnvs.length > 0) {
        setPubEnvId(agentEnvs[0].id)
        loadRunsForEnv(agentEnvs[0].id)
      }
    } catch (e) {
      console.error('Failed to load environments:', e)
    }
  }

  const loadRunsForEnv = async (envId) => {
    setPubRuns([])
    setPubRunId('')
    if (!envId) return
    try {
      const res = await getRuns(envId)
      const completed = (res.runs || res || []).filter(r => r.status === 'completed')
      setPubRuns(completed)
      if (completed.length > 0) setPubRunId(completed[0].id)
    } catch (e) {
      console.error('Failed to load runs:', e)
    }
  }

  const handleEnvChange = (envId) => {
    setPubEnvId(envId)
    loadRunsForEnv(envId)
  }

  const handlePublish = async () => {
    setPublishing(true)
    try {
      const res = await publishToMarketplace(agentId, pubEnvId || null, pubRunId || null, pubCategory, [], pubPackType)
      setPublished(res)
    } catch (e) {
      alert(e.message || 'Failed to publish')
    } finally {
      setPublishing(false)
    }
  }

  // ─── Tool handlers ───
  const handleAddTool = async () => {
    if (!newTool.name.trim() || !newTool.url.trim() || !newTool.description.trim()) {
      alert('Name, description, and URL are required')
      return
    }
    try {
      await createTool(agentId, newTool)
      setShowAddTool(false)
      setNewTool({
        name: '', description: '', url: '', method: 'POST',
        tool_type: 'webhook', fire_and_forget: true,
        auth_type: 'none', auth_value: '',
        parameters: [
          { name: 'question', type: 'string', description: "The user's question", required: true },
          { name: 'answer', type: 'string', description: "The agent's answer", required: true },
        ],
        payload_template: { question: '{{question}}', answer: '{{answer}}' },
      })
      const toolsRes = await getTools(agentId)
      setTools(toolsRes.tools || [])
    } catch (err) {
      alert(err.message || 'Failed to create tool')
    }
  }

  const handleDeleteTool = async (toolId) => {
    if (!confirm('Delete this tool?')) return
    try {
      await deleteTool(toolId)
      setTools(prev => prev.filter(t => t.id !== toolId))
    } catch (err) {
      alert(err.message)
    }
  }

  const handleToggleTool = async (tool) => {
    try {
      await updateTool(tool.id, { is_enabled: !tool.is_enabled })
      setTools(prev => prev.map(t => t.id === tool.id ? { ...t, is_enabled: !t.is_enabled } : t))
    } catch (err) {
      alert(err.message)
    }
  }

  const handleTestTool = async (toolId) => {
    setToolTesting(toolId)
    setToolTestResult(null)
    setExpandedTool(toolId)
    try {
      const res = await testTool(toolId)
      setToolTestResult(res)
    } catch (err) {
      setToolTestResult({ status: 'error', error: err.message })
    } finally {
      setToolTesting(null)
    }
  }

  if (loading) return <div className="loading-center"><div className="spinner" /></div>
  if (!agent) return <div className="fade-in"><p>Agent not found.</p></div>

  const readyDocs = documents.filter(d => d.status === 'ready')
  const processingDocs = documents.filter(d => d.status === 'processing')

  return (
    <div className="fade-in" style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Link to="/" style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12, textDecoration: 'none' }}>
          <ArrowLeft size={14} /> Back to Agent Builder
        </Link>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <AgentIcon icon={agent.agent_icon} size={48} />
          <div style={{ flex: 1 }}>
            <input
              value={editName}
              onChange={e => { setEditName(e.target.value); setTimeout(markDirty, 0) }}
              placeholder="Agent name"
              style={{
                fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--font-display)',
                border: 'none', background: 'transparent', color: 'var(--text)',
                width: '100%', padding: 0, outline: 'none',
                borderBottom: '1px solid transparent',
              }}
              onFocus={e => e.target.style.borderBottomColor = 'var(--rule)'}
              onBlur={e => e.target.style.borderBottomColor = 'transparent'}
            />
            <input
              value={editDescription}
              onChange={e => { setEditDescription(e.target.value); setTimeout(markDirty, 0) }}
              placeholder="Add a description..."
              style={{
                color: 'var(--text-muted)', fontSize: '0.875rem',
                border: 'none', background: 'transparent',
                width: '100%', padding: 0, marginTop: 2, outline: 'none',
                borderBottom: '1px solid transparent',
              }}
              onFocus={e => e.target.style.borderBottomColor = 'var(--rule)'}
              onBlur={e => e.target.style.borderBottomColor = 'transparent'}
            />
          </div>
          <button
            className={dirty ? "btn btn-primary" : "btn btn-outline"}
            onClick={handleSave}
            disabled={saving || !dirty}
            style={{ flexShrink: 0, opacity: dirty ? 1 : 0.4 }}
          >
            <Save size={14} /> {saving ? 'Saving...' : dirty ? 'Save Agent' : 'Saved'}
          </button>
        </div>
      </div>

      {/* Search toggle */}
      <div className="card" style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>Include on Search page</div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            Show this agent as a workspace option on the main search page
          </div>
        </div>
        <button
          className="btn btn-ghost"
          onClick={handleToggleHomepage}
          style={{ padding: 4 }}
        >
          {agent.show_on_homepage
            ? <ToggleRight size={28} style={{ color: 'var(--accent)' }} />
            : <ToggleLeft size={28} style={{ color: 'var(--text-muted)' }} />
          }
        </button>
      </div>

      {/* Ask this agent */}
      {readyDocs.length > 0 && agent.system_prompt && (
        <div style={{ marginBottom: 24 }}>
          <button
            className="btn btn-primary"
            style={{ width: '100%', padding: 12, justifyContent: 'center', fontSize: '0.9375rem' }}
            onClick={() => navigate(`/search?workspace=${agentId}`)}
          >
            <MessageSquare size={16} /> Ask this agent
          </button>
        </div>
      )}

      {/* Files */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 16 }}>Files</h3>

        <div
          style={{
            border: `2px dashed ${dragover ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 'var(--radius)',
            padding: 24,
            textAlign: 'center',
            marginBottom: 16,
            cursor: 'pointer',
            transition: 'all 0.15s',
            background: dragover ? 'rgba(196, 164, 105, 0.05)' : 'transparent',
          }}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragover(true) }}
          onDragLeave={() => setDragover(false)}
          onDrop={handleDrop}
        >
          <Upload size={24} style={{ color: 'var(--accent)', marginBottom: 8 }} />
          <div style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: 4 }}>
            {uploading ? uploadStatus : 'Drop files here or click to upload'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            PDF, DOCX, XLSX, CSV, audio, video, images
          </div>
          <input
            ref={fileRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={e => handleUpload(e.target.files)}
          />
        </div>

        {processingDocs.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {processingDocs.map(d => (
              <div key={d.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 0', fontSize: '0.8125rem', color: 'var(--text-muted)',
              }}>
                <div className="spinner" style={{ width: 14, height: 14 }} />
                Processing: {d.filename}
              </div>
            ))}
          </div>
        )}

        {readyDocs.length > 0 ? (
          <div>
            {readyDocs.map((d, i) => (
              <div key={d.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 0',
                borderBottom: i < readyDocs.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileText size={16} style={{ color: 'var(--text-muted)' }} />
                  <span style={{ fontSize: '0.875rem' }}>{d.filename}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {d.chunk_count} chunks
                  </span>
                </div>
                <button
                  className="btn btn-ghost"
                  style={{ padding: 4, opacity: 0.5 }}
                  onClick={() => handleDelete(d.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            No files yet. Upload files to train this agent.
          </div>
        )}
      </div>

      {/* System Prompt */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            AI Instructions
            {agent.agent_type === 'custom' && (
              <span style={{
                fontSize: '0.55rem', fontWeight: 600, background: 'var(--accent)', color: 'white',
                padding: '1px 6px', borderRadius: 8,
              }}>AUTO-GENERATE</span>
            )}
          </h3>
          <div style={{ display: 'flex', gap: 8 }}>
            {agent.agent_type === 'custom' && readyDocs.length > 0 && (
              <button
                className="btn btn-ghost"
                onClick={handleGenerate}
                disabled={generating}
                title="Auto-generate prompt from files"
              >
                <Sparkles size={14} />
                {generating ? 'Generating...' : 'Auto-generate'}
              </button>
            )}
          </div>
        </div>

        <textarea
          value={editPrompt}
          onChange={e => { setEditPrompt(e.target.value); setTimeout(markDirty, 0) }}
          placeholder={agent.agent_type === 'custom'
            ? 'Upload files and click "Auto-generate" to create a specialized prompt, or write your own...'
            : 'This agent uses a pre-built prompt. Edit below to customize...'
          }
          style={{
            width: '100%',
            minHeight: 200,
            padding: 12,
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--rule)',
            background: 'var(--paper)',
            color: 'var(--text)',
            fontFamily: 'var(--font-body)',
            fontSize: '0.8125rem',
            lineHeight: 1.5,
            resize: 'vertical',
            outline: 'none',
          }}
        />
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>
          This prompt tells the AI how to interpret and answer questions about the files in this agent.
        </div>
      </div>

      {/* Tools */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Wrench size={16} /> Tools
            {tools.length > 0 && (
              <span style={{
                fontSize: '0.65rem', fontWeight: 700, background: 'var(--cane-100)',
                color: 'var(--cane-700)', padding: '2px 8px', borderRadius: 10,
              }}>{tools.length}</span>
            )}
          </h3>
          <button className="btn btn-ghost" onClick={() => setShowAddTool(!showAddTool)} style={{ fontSize: '0.8rem' }}>
            <Plus size={14} /> Add Tool
          </button>
        </div>

        {/* Add tool form */}
        {showAddTool && (
          <div style={{
            padding: 16, borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--cane-200)', background: 'var(--cane-50)',
            marginBottom: 16,
          }}>
            <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 14 }}>New Webhook Tool</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Tool Name
                </label>
                <input
                  className="form-input"
                  value={newTool.name}
                  onChange={e => setNewTool({ ...newTool, name: e.target.value })}
                  placeholder="e.g. notify_slack"
                  style={{ fontSize: '0.84rem' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Webhook URL
                </label>
                <input
                  className="form-input"
                  value={newTool.url}
                  onChange={e => setNewTool({ ...newTool, url: e.target.value })}
                  placeholder="https://hooks.zapier.com/..."
                  style={{ fontSize: '0.84rem' }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Description <span style={{ fontWeight: 400, textTransform: 'none' }}>— tells the AI when to use this tool</span>
              </label>
              <textarea
                className="form-input"
                value={newTool.description}
                onChange={e => setNewTool({ ...newTool, description: e.target.value })}
                placeholder="e.g. Use this tool to send a notification to the team's Slack channel whenever a user asks about compliance policies."
                style={{ fontSize: '0.84rem', minHeight: 70, resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  HTTP Method
                </label>
                <select
                  className="form-input"
                  value={newTool.method}
                  onChange={e => setNewTool({ ...newTool, method: e.target.value })}
                >
                  <option value="POST">POST</option>
                  <option value="GET">GET</option>
                  <option value="PUT">PUT</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Behavior
                </label>
                <select
                  className="form-input"
                  value={newTool.fire_and_forget ? 'fire' : 'wait'}
                  onChange={e => setNewTool({ ...newTool, fire_and_forget: e.target.value === 'fire' })}
                >
                  <option value="fire">Fire & Forget (notify/log)</option>
                  <option value="wait">Wait for Response (data lookup)</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Auth Type
                </label>
                <select
                  className="form-input"
                  value={newTool.auth_type}
                  onChange={e => setNewTool({ ...newTool, auth_type: e.target.value })}
                >
                  <option value="none">None</option>
                  <option value="bearer">Bearer Token</option>
                  <option value="api_key">API Key</option>
                </select>
              </div>
              {newTool.auth_type !== 'none' && (
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {newTool.auth_type === 'bearer' ? 'Bearer Token' : 'API Key'}
                  </label>
                  <input
                    className="form-input"
                    type="password"
                    value={newTool.auth_value}
                    onChange={e => setNewTool({ ...newTool, auth_value: e.target.value })}
                    placeholder="Enter token..."
                    style={{ fontSize: '0.84rem' }}
                  />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={handleAddTool} style={{ fontSize: '0.82rem' }}>
                <Zap size={14} /> Create Tool
              </button>
              <button className="btn btn-ghost" onClick={() => setShowAddTool(false)} style={{ fontSize: '0.82rem' }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Tool list */}
        {tools.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tools.map(tool => (
              <div key={tool.id} style={{
                padding: '12px 16px', borderRadius: 'var(--radius-sm)',
                border: `1px solid ${tool.is_enabled ? 'var(--cane-200)' : 'var(--border)'}`,
                background: tool.is_enabled ? 'white' : 'var(--bg)',
                opacity: tool.is_enabled ? 1 : 0.6,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                    <Zap size={15} style={{ color: tool.is_enabled ? 'var(--cane-600)' : 'var(--text-muted)', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{tool.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        {tool.description.length > 80 ? tool.description.slice(0, 80) + '...' : tool.description}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {tool.execution_count > 0 && (
                      <span style={{
                        fontSize: '0.68rem', color: 'var(--text-muted)', padding: '2px 8px',
                        background: 'var(--bg)', borderRadius: 8,
                      }}>{tool.execution_count} calls</span>
                    )}
                    <button
                      className="btn btn-ghost"
                      onClick={() => handleTestTool(tool.id)}
                      disabled={toolTesting === tool.id}
                      style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                      title="Test this tool"
                    >
                      <Play size={12} /> {toolTesting === tool.id ? '...' : 'Test'}
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => handleToggleTool(tool)}
                      style={{ padding: '4px 8px' }}
                      title={tool.is_enabled ? 'Disable' : 'Enable'}
                    >
                      {tool.is_enabled ? <ToggleRight size={16} style={{ color: 'var(--cane-600)' }} /> : <ToggleLeft size={16} />}
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => handleDeleteTool(tool.id)}
                      style={{ padding: '4px 8px' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Test result */}
                {toolTestResult && toolTesting === null && expandedTool === tool.id && (
                  <div style={{
                    marginTop: 10, padding: '8px 12px', borderRadius: 6,
                    fontSize: '0.78rem', fontFamily: 'monospace',
                    background: toolTestResult.status === 'ok' ? '#f0fdf4' : '#fef2f2',
                    border: `1px solid ${toolTestResult.status === 'ok' ? '#bbf7d0' : '#fecaca'}`,
                    color: toolTestResult.status === 'ok' ? '#166534' : '#991b1b',
                  }}>
                    {toolTestResult.status === 'ok'
                      ? `✓ Success (${toolTestResult.result?.status_code || 200})`
                      : `✗ Error: ${toolTestResult.error || toolTestResult.result?.body || 'Unknown error'}`}
                  </div>
                )}

                <div style={{ marginTop: 6, display: 'flex', gap: 8, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  <span style={{ padding: '1px 6px', background: 'var(--bg)', borderRadius: 4 }}>{tool.method}</span>
                  <span style={{ padding: '1px 6px', background: 'var(--bg)', borderRadius: 4 }}>{tool.fire_and_forget ? 'Fire & Forget' : 'Wait for Response'}</span>
                  <span style={{
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    maxWidth: 250, padding: '1px 6px', background: 'var(--bg)', borderRadius: 4,
                  }}>{tool.url}</span>
                </div>
              </div>
            ))}
          </div>
        ) : !showAddTool ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)' }}>
            <Wrench size={24} style={{ marginBottom: 8, opacity: 0.4 }} />
            <div style={{ fontSize: '0.84rem', fontWeight: 500 }}>No tools configured</div>
            <div style={{ fontSize: '0.78rem', marginTop: 4 }}>
              Add webhooks to let this agent take actions — log to sheets, send Slack messages, trigger Zapier workflows.
            </div>
          </div>
        ) : null}
      </div>

      {/* Embed Widget */}
      {agent.system_prompt && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <MessageSquare size={16} /> Embed on Your Website
            </h3>
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 14 }}>
            Add this agent to any website with one line of code. Create an API key in{' '}
            <Link to="/settings" style={{ color: 'var(--accent)' }}>Settings → API Keys</Link>{' '}
            scoped to this agent, then paste the snippet below.
          </div>
          <div style={{
            position: 'relative',
            background: '#1e1e2e',
            borderRadius: 'var(--radius-sm)',
            padding: '16px 18px',
            fontSize: '0.78rem',
            fontFamily: "'SF Mono', Consolas, 'Liberation Mono', monospace",
            color: '#cdd6f4',
            lineHeight: 1.6,
            overflow: 'auto',
          }}>
            <button
              onClick={() => {
                const code = `<script\n  src="${window.location.origin}/widget.js"\n  data-api-key="YOUR_API_KEY"\n  data-agent-name="${agent.name}"\n  data-workspace-id="${agentId}"\n  data-color="#8B7355"\n  data-greeting="Hi! Ask me anything."\n></script>`
                navigator.clipboard.writeText(code).then(() => {
                  const btn = document.querySelector('#copy-embed-btn')
                  if (btn) { btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = 'Copy', 1500) }
                })
              }}
              id="copy-embed-btn"
              style={{
                position: 'absolute', top: 8, right: 8,
                background: 'rgba(255,255,255,0.1)', border: 'none',
                color: '#cdd6f4', padding: '4px 10px', borderRadius: 6,
                fontSize: '0.7rem', cursor: 'pointer', fontFamily: 'var(--font-body)',
              }}
            >Copy</button>
            <span style={{ color: '#89b4fa' }}>&lt;script</span><br />
            {'  '}<span style={{ color: '#a6e3a1' }}>src</span>=<span style={{ color: '#f9e2af' }}>"{window.location.origin}/widget.js"</span><br />
            {'  '}<span style={{ color: '#a6e3a1' }}>data-api-key</span>=<span style={{ color: '#f9e2af' }}>"YOUR_API_KEY"</span><br />
            {'  '}<span style={{ color: '#a6e3a1' }}>data-agent-name</span>=<span style={{ color: '#f9e2af' }}>"{agent.name}"</span><br />
            {'  '}<span style={{ color: '#a6e3a1' }}>data-workspace-id</span>=<span style={{ color: '#f9e2af' }}>"{agentId}"</span><br />
            {'  '}<span style={{ color: '#a6e3a1' }}>data-color</span>=<span style={{ color: '#f9e2af' }}>"#8B7355"</span><br />
            {'  '}<span style={{ color: '#a6e3a1' }}>data-greeting</span>=<span style={{ color: '#f9e2af' }}>"Hi! Ask me anything."</span><br />
            <span style={{ color: '#89b4fa' }}>&gt;&lt;/script&gt;</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 10 }}>
            Replace <code style={{ background: 'var(--bg)', padding: '1px 5px', borderRadius: 4, fontSize: '0.73rem' }}>YOUR_API_KEY</code> with
            a key from Settings. Customize <code style={{ background: 'var(--bg)', padding: '1px 5px', borderRadius: 4, fontSize: '0.73rem' }}>data-color</code> and <code style={{ background: 'var(--bg)', padding: '1px 5px', borderRadius: 4, fontSize: '0.73rem' }}>data-greeting</code> to match your brand.
          </div>
        </div>
      )}

      {/* Publish to Marketplace */}
      {agent.system_prompt && (
        <div className="card" style={{ marginBottom: 24 }}>
          {published ? (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{
                fontWeight: 700, fontSize: '0.95rem', color: 'var(--status-pass)',
                fontFamily: 'var(--font-display)', marginBottom: 6,
              }}>
                Published to Marketplace!
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 14 }}>
                {published.name} is now live. Anyone can find, clone, and verify it.
              </div>
              <button
                className="btn btn-outline"
                style={{ fontSize: '0.82rem' }}
                onClick={() => navigate(`/marketplace/${published.id}`)}
              >
                View Listing →
              </button>
            </div>
          ) : !showPublish ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Store size={15} /> Publish to Marketplace
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  Share this agent with the community. Others can clone and re-verify your eval scores.
                </div>
              </div>
              <button className="btn btn-outline" onClick={handleOpenPublish}>
                Publish
              </button>
            </div>
          ) : (
            <div>
              <div style={{
                fontWeight: 700, fontSize: '0.88rem', marginBottom: 16,
                fontFamily: 'var(--font-display)',
              }}>
                Publish to Marketplace
              </div>

              {/* Category */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Category
                </label>
                <select
                  value={pubCategory}
                  onChange={e => setPubCategory(e.target.value)}
                  style={{
                    width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--rule)', fontSize: '0.84rem',
                    fontFamily: 'var(--font-body)', background: 'white',
                    color: 'var(--text)', outline: 'none',
                  }}
                >
                  <option value="general">General</option>
                  <option value="legal">Legal</option>
                  <option value="healthcare">Healthcare</option>
                  <option value="finance">Finance</option>
                  <option value="engineering">Engineering</option>
                  <option value="education">Education</option>
                  <option value="operations">Operations</option>
                </select>
              </div>

              {/* Pack Type */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  What to include
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { id: 'byod', label: 'BYOD', desc: 'Blueprint + eval spec only. Users upload their own docs.' },
                    { id: 'open', label: 'Open Pack', desc: 'Include documents. Anyone can clone the full agent.' },
                  ].map(p => (
                    <label key={p.id} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                      border: `1px solid ${pubPackType === p.id ? 'var(--cane-500)' : 'var(--rule)'}`,
                      cursor: 'pointer', background: pubPackType === p.id ? 'var(--paper)' : 'white',
                      transition: 'border-color 0.15s',
                    }}>
                      <input
                        type="radio"
                        name="packType"
                        checked={pubPackType === p.id}
                        onChange={() => setPubPackType(p.id)}
                        style={{ marginTop: 2 }}
                      />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.84rem' }}>{p.label}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Environment (optional) */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Evaluation (optional)
                </label>
                {envs.length > 0 ? (
                  <select
                    value={pubEnvId}
                    onChange={e => handleEnvChange(e.target.value)}
                    style={{
                      width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--rule)', fontSize: '0.84rem',
                      fontFamily: 'var(--font-body)', background: 'white',
                      color: 'var(--text)', outline: 'none',
                    }}
                  >
                    <option value="">None — publish without eval scores</option>
                    {envs.map(e => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                  </select>
                ) : (
                  <div style={{
                    fontSize: '0.8rem', color: 'var(--text-muted)',
                    padding: '10px 14px', background: 'var(--paper)',
                    borderRadius: 'var(--radius-sm)', border: '1px solid var(--rule)',
                  }}>
                    No evaluation environments found for this agent. You can still publish, but the listing won't have a performance card or re-verify capability.
                  </div>
                )}
              </div>

              {/* Run picker */}
              {pubEnvId && pubRuns.length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Eval Run
                  </label>
                  <select
                    value={pubRunId}
                    onChange={e => setPubRunId(e.target.value)}
                    style={{
                      width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--rule)', fontSize: '0.84rem',
                      fontFamily: 'var(--font-body)', background: 'white',
                      color: 'var(--text)', outline: 'none',
                    }}
                  >
                    {pubRuns.map(r => (
                      <option key={r.id} value={r.id}>
                        Score: {Math.round(r.overall_score)} — {new Date(r.created_at).toLocaleDateString()} {new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </option>
                    ))}
                  </select>
                  <div style={{
                    fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 6,
                    fontStyle: 'italic',
                  }}>
                    This run's score, test cases, and criteria will be published with your listing.
                  </div>
                </div>
              )}
              {pubEnvId && pubRuns.length === 0 && (
                <div style={{
                  fontSize: '0.8rem', color: 'var(--text-muted)',
                  padding: '10px 14px', background: 'var(--paper)',
                  borderRadius: 'var(--radius-sm)', border: '1px solid var(--rule)',
                  marginBottom: 18,
                }}>
                  No completed eval runs found. Run an evaluation first to include a performance card.
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setShowPublish(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handlePublish}
                  disabled={publishing}
                >
                  <Store size={14} />
                  {publishing ? 'Publishing...' : 'Publish Agent'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}