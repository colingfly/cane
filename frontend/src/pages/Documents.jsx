import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { getDocuments, uploadDocument, deleteDocument, getWorkspaces } from '../api/client'
import { Upload, Trash2, FileText, AlertCircle } from 'lucide-react'

export default function Documents() {
  const { workspaces, isOwner, updateWorkspaces } = useAuth()
  const [documents, setDocuments] = useState([])
  const [activeWs, setActiveWs] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState('')
  const [dragover, setDragover] = useState(false)
  const fileRef = useRef()

  useEffect(() => {
    loadDocs()
  }, [activeWs])

  async function loadDocs() {
    try {
      const data = await getDocuments(activeWs)
      setDocuments(data.documents || [])
    } catch (err) {
      console.error('Failed to load documents:', err)
    }
  }

  async function handleUpload(files) {
    if (!files?.length) return

    const wsId = activeWs || workspaces.find(w => w.is_default)?.id || workspaces[0]?.id
    if (!wsId) {
      setUploadStatus('No workspace available. Create one first.')
      return
    }

    setUploading(true)
    setUploadStatus('')

    let successCount = 0
    for (const file of files) {
      try {
        setUploadStatus(`Processing ${file.name}...`)
        await uploadDocument(file, wsId)
        successCount++
      } catch (err) {
        setUploadStatus(`Error with ${file.name}: ${err.message}`)
      }
    }

    setUploading(false)
    if (successCount > 0) {
      setUploadStatus(`${successCount} file${successCount > 1 ? 's' : ''} uploaded successfully`)
      loadDocs()
      // Refresh workspace counts
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
    handleUpload(e.dataTransfer.files)
  }

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
            </button>
          ))}
        </div>
      )}

      {/* Upload zone */}
      <div
        className={`upload-zone ${dragover ? 'dragover' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragover(true) }}
        onDragLeave={() => setDragover(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        style={{ marginBottom: 24 }}
      >
        <Upload size={24} style={{ color: 'var(--accent)', marginBottom: 8 }} />
        <p>
          <span className="upload-label">Click to upload</span> or drag and drop
        </p>
        <p style={{ fontSize: '0.75rem', marginTop: 4 }}>
          PDF, DOCX, XLSX, CSV, images, audio, video
        </p>
        <input
          ref={fileRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={e => handleUpload(e.target.files)}
        />
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
                <th>Status</th>
                <th>Uploaded</th>
                {isOwner && <th style={{ width: 60 }}></th>}
              </tr>
            </thead>
            <tbody>
              {documents.map(doc => (
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
                  <td>
                    <span className={`badge badge-${doc.status}`}>{doc.status}</span>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {new Date(doc.created_at).toLocaleDateString()}
                  </td>
                  {isOwner && (
                    <td>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleDelete(doc.id, doc.filename)}
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
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
