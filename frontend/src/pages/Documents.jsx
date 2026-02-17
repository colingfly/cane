import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { getDocuments, uploadDocument, deleteDocument, getWorkspaces } from '../api/client'
import { Upload, Trash2, FileText, AlertCircle, ChevronDown } from 'lucide-react'

export default function Documents() {
  const { workspaces, updateWorkspaces } = useAuth()
  const [documents, setDocuments] = useState([])
  const [activeWs, setActiveWs] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState('')
  const [dragover, setDragover] = useState(false)
  const [showWsPicker, setShowWsPicker] = useState(false)
  const [pendingFiles, setPendingFiles] = useState(null)
  const fileRef = useRef()
  const pickerRef = useRef()

  useEffect(() => {
    loadDocs()
  }, [activeWs])

  // Fetch workspaces if auth context has none
  useEffect(() => {
    if (workspaces.length === 0) {
      getWorkspaces().then(data => {
        const ws = data.workspaces || []
        updateWorkspaces(ws)
        if (!activeWs && ws.length > 0) setActiveWs(ws[0].id)
      }).catch(console.error)
    } else if (!activeWs && workspaces.length > 0) {
      setActiveWs(workspaces[0].id)
    }
  }, [workspaces])

  // Close workspace picker on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowWsPicker(false)
        setPendingFiles(null)
      }
    }
    if (showWsPicker) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showWsPicker])

  async function loadDocs() {
    try {
      const data = await getDocuments(activeWs)
      setDocuments(data.documents || [])
    } catch (err) {
      console.error('Failed to load documents:', err)
    }
  }

  function getUploadTargetName() {
    if (activeWs) {
      const ws = workspaces.find(w => w.id === activeWs)
      return ws?.name || 'Selected workspace'
    }
    return null
  }

  function initiateUpload(rawFiles) {
    const files = Array.from(rawFiles)
    if (!files.length) return

    // If user is on a specific workspace tab, upload directly there
    if (activeWs) {
      handleUpload(files, activeWs)
      return
    }

    // If on "All" tab, show workspace picker
    if (workspaces.length === 1) {
      // Only one workspace — skip picker
      handleUpload(files, workspaces[0].id)
      return
    }

    // Multiple workspaces — ask user to pick
    setPendingFiles(files)
    setShowWsPicker(true)
  }

  function selectWorkspaceAndUpload(wsId) {
    setShowWsPicker(false)
    if (pendingFiles) {
      handleUpload(pendingFiles, wsId)
      setPendingFiles(null)
    }
  }

  async function handleUpload(files, wsId) {
    const fileArray = Array.from(files)
    if (!fileArray.length || !wsId) return

    setUploading(true)
    setUploadStatus('')

    const wsName = workspaces.find(w => w.id === wsId)?.name || ''

    let successCount = 0
    for (const file of fileArray) {
      try {
        setUploadStatus(`Uploading ${file.name} to ${wsName}...`)
        await uploadDocument(file, wsId)
        successCount++
      } catch (err) {
        setUploadStatus(`Error with ${file.name}: ${err.message}`)
      }
    }

    setUploading(false)
    if (successCount > 0) {
      setUploadStatus(`${successCount} file${successCount > 1 ? 's' : ''} uploaded to ${wsName}`)
      loadDocs()
      const wsData = await getWorkspaces()
      updateWorkspaces(wsData.workspaces || [])
    }
  }

  async function handleDelete(docId, filename) {
    if (!confirm(`Delete "${filename}" and all its indexed content?`)) return
    try {
      await deleteDocument(docId)
      loadDocs()
    } catch (err) {
      alert('Delete failed: ' + err.message)
    }
  }

  function onDrop(e) {
    e.preventDefault()
    setDragover(false)
    initiateUpload(e.dataTransfer.files)
  }

  const uploadTarget = getUploadTargetName()

  return (
    <div className="fade-in">
      <div className="page-header">
        <h2>Documents</h2>
        <p>Upload and manage your knowledge base</p>
      </div>

      {/* Workspace tabs */}
      {workspaces.length > 0 && (
        <div className="workspace-tabs">
          <button
            className={`workspace-tab ${activeWs === '' ? 'active' : ''}`}
            onClick={() => setActiveWs('')}
          >
            All
          </button>
          {workspaces.map(w => (
            <button
              key={w.id}
              className={`workspace-tab ${activeWs === w.id ? 'active' : ''}`}
              onClick={() => setActiveWs(w.id)}
            >
              {w.name}
              <span style={{
                marginLeft: 6,
                fontSize: '0.7rem',
                opacity: 0.6,
              }}>
                {w.document_count || 0}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Upload zone */}
      <div style={{ position: 'relative', marginBottom: 24 }}>
        <div
          className={`upload-zone ${dragover ? 'dragover' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragover(true) }}
          onDragLeave={() => setDragover(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={24} style={{ color: 'var(--accent)', marginBottom: 8 }} />
          <p>
            <span className="upload-label">Click to upload</span> or drag and drop
          </p>
          <p style={{ fontSize: '0.75rem', marginTop: 4, color: 'var(--text-muted)' }}>
            PDF, DOCX, XLSX, CSV, images, audio, video
          </p>
          {uploadTarget && (
            <p style={{
              fontSize: '0.75rem',
              marginTop: 8,
              color: 'var(--accent)',
              fontWeight: 500,
            }}>
              Uploading to: {uploadTarget}
            </p>
          )}
          {!uploadTarget && workspaces.length > 1 && (
            <p style={{
              fontSize: '0.75rem',
              marginTop: 8,
              color: 'var(--text-muted)',
              fontStyle: 'italic',
            }}>
              Select a workspace tab above, or you'll choose on upload
            </p>
          )}
          <input
            ref={fileRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={e => {
              initiateUpload(e.target.files)
              e.target.value = ''
            }}
          />
        </div>

        {/* Workspace picker modal */}
        {showWsPicker && (
          <div
            ref={pickerRef}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'var(--bg-card, #fff)',
              border: '1px solid var(--border, #e2e2e2)',
              borderRadius: 12,
              padding: '20px 24px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
              zIndex: 100,
              minWidth: 280,
            }}
          >
            <p style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              marginBottom: 12,
              color: 'var(--text)',
            }}>
              Upload to which workspace?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {workspaces.map(w => (
                <button
                  key={w.id}
                  onClick={() => selectWorkspaceAndUpload(w.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    border: '1px solid var(--border, #e2e2e2)',
                    borderRadius: 8,
                    background: 'var(--bg, #fff)',
                    cursor: 'pointer',
                    fontSize: '0.8125rem',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'var(--accent)'
                    e.currentTarget.style.background = 'var(--bg-hover, #f9f7f4)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--border, #e2e2e2)'
                    e.currentTarget.style.background = 'var(--bg, #fff)'
                  }}
                >
                  <span>{w.name}</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {w.document_count || 0} docs
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={() => { setShowWsPicker(false); setPendingFiles(null) }}
              style={{
                marginTop: 12,
                width: '100%',
                padding: '8px',
                border: 'none',
                background: 'none',
                color: 'var(--text-muted)',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {uploadStatus && (
        <div style={{
          textAlign: 'center',
          padding: '8px 16px',
          marginBottom: 16,
          fontSize: '0.8125rem',
          color: uploading ? 'var(--text-muted)' : 'var(--success)',
        }}>
          {uploading && <span className="spinner" style={{ width: 14, height: 14, marginRight: 6, verticalAlign: 'middle' }} />}
          {uploadStatus}
        </div>
      )}

      {/* Documents table */}
      {documents.length > 0 ? (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="doc-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Type</th>
                <th>Chunks</th>
                <th>Workspace</th>
                <th>Status</th>
                <th>Uploaded</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {documents.map(doc => {
                const ws = workspaces.find(w => w.id === doc.workspace_id)
                return (
                  <tr key={doc.id}>
                    <td>
                      <span className="filename">
                        <FileText size={14} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--accent)' }} />
                        {doc.filename}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                      {doc.file_type}
                    </td>
                    <td>{doc.chunk_count}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {ws?.name || '—'}
                    </td>
                    <td>
                      <span className={`badge badge-${doc.status}`}>{doc.status}</span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {new Date(doc.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleDelete(doc.id, doc.filename)}
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <FileText size={32} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
          <h3>No documents yet</h3>
          <p>Upload files above to start building your searchable knowledge base</p>
        </div>
      )}
    </div>
  )
}