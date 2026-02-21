import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Upload, Trash2, FileText, Sparkles, Save, ToggleLeft, ToggleRight, MessageSquare } from 'lucide-react'
import {
  getAgent, updateAgent, generateAgentPrompt,
  getDocuments, uploadDocument, deleteDocument, getDocumentStatus,
} from '../api/client'

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
  const [promptDirty, setPromptDirty] = useState(false)
  const [dragover, setDragover] = useState(false)
  const fileRef = useRef()

  useEffect(() => { loadAgent() }, [agentId])

  const loadAgent = async () => {
    try {
      const [agentRes, docsRes] = await Promise.all([
        getAgent(agentId),
        getDocuments(agentId),
      ])
      setAgent(agentRes)
      setEditPrompt(agentRes.system_prompt || '')
      setDocuments(docsRes.documents || [])
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

  const handleSavePrompt = async () => {
    setSaving(true)
    try {
      await updateAgent(agentId, { system_prompt: editPrompt })
      setAgent(prev => ({ ...prev, system_prompt: editPrompt }))
      setPromptDirty(false)
    } catch (e) {
      console.error('Failed to save prompt:', e)
    } finally {
      setSaving(false)
    }
  }

  const handleGenerate = async () => {
    if (generating) return
    setGenerating(true)
    try {
      const res = await generateAgentPrompt(agentId)
      if (res.system_prompt) {
        setEditPrompt(res.system_prompt)
        setAgent(prev => ({ ...prev, system_prompt: res.system_prompt }))
        setPromptDirty(false)
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <AgentIcon icon={agent.agent_icon} size={48} />
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>
              {agent.name}
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              {agent.agent_description || 'No description'}
            </p>
          </div>
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
            {promptDirty && (
              <button className="btn btn-primary" onClick={handleSavePrompt} disabled={saving}>
                <Save size={14} /> {saving ? 'Saving...' : 'Save'}
              </button>
            )}
            {!promptDirty && (
              <button className="btn btn-outline" disabled style={{ opacity: 0.4 }}>
                <Save size={14} /> Saved
              </button>
            )}
          </div>
        </div>

        <textarea
          value={editPrompt}
          onChange={e => { setEditPrompt(e.target.value); setPromptDirty(e.target.value !== (agent.system_prompt || '')) }}
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
    </div>
  )
}