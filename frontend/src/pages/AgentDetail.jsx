import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Upload, Trash2, FileText, Sparkles, Save, ToggleLeft, ToggleRight, MessageSquare, Store, Wrench, Zap, Play, Plus, ChevronDown, ChevronUp, RefreshCw, Link2, Globe, X, BarChart3, Palette, Key, Pencil, Copy, Check, Cloud, FolderOpen, Search, Pause, Unplug, Clock, Brain } from 'lucide-react'
import {
  getAgent, updateAgent, generateAgentPrompt, generateReplicaPrompt,
  getDocuments, uploadDocument, deleteDocument, getDocumentStatus,
  publishToMarketplace, getTools, createTool, updateTool, deleteTool, testTool, copyTools,
  getMcpCatalog, getMcpServers, connectMcpServer, updateMcpServer, deleteMcpServer, syncMcpServer,
  getWidgetConfig, updateWidgetConfig,
  createApiKey, deleteApiKey, getApiKeys, getAgents,
  getAgentLinks, createAgentLink, updateAgentLink, deleteAgentLink,
  getSchedules, createSchedule, updateSchedule, deleteSchedule, getScheduleRuns, triggerSchedule,
  getMemories, addMemory, updateMemory, deleteMemory, clearMemories,
  getGdriveAuthUrl, getGdriveStatus, disconnectGdrive,
  listDriveFolders, listSyncs, createSync, getSync, triggerSync, updateSyncStatus, deleteSync,
} from '../api/client'
import { getEnvironments, getRuns } from '../api/eval'

const ICON_COLORS = {
  OG: { bg: 'rgba(255,255,255,0.15)' },
  AT: { bg: 'rgba(255,255,255,0.12)' },
  KB: { bg: 'rgba(255,255,255,0.10)' },
}
const DEFAULT_COLOR = { bg: 'rgba(255,255,255,0.08)' }

const TABS = [
  { id: 'configure', label: 'Configure', icon: Sparkles },
  { id: 'knowledge', label: 'Knowledge', icon: FileText },
  { id: 'tools', label: 'Tools', icon: Wrench },
  { id: 'behavior', label: 'Behavior', icon: Brain },
  { id: 'deploy', label: 'Deploy', icon: Globe },
]

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
  const [editingTool, setEditingTool] = useState(null)
  const [editTool, setEditTool] = useState(null)
  const [showCopyTools, setShowCopyTools] = useState(false)
  const [otherAgents, setOtherAgents] = useState([])
  const [copyingFrom, setCopyingFrom] = useState(null)
  const [agentKeys, setAgentKeys] = useState([])
  const [showNewKey, setShowNewKey] = useState(null)
  const [copiedKey, setCopiedKey] = useState(false)
  const [newTool, setNewTool] = useState({
    name: '', description: '', url: '', method: 'POST',
    tool_type: 'webhook', fire_and_forget: true,
    auth_type: 'none', auth_value: '',
    parameters: [],
    payload_template: {},
  })

  // MCP
  const [mcpServers, setMcpServers] = useState([])
  const [mcpCatalog, setMcpCatalog] = useState([])
  const [mcpCategories, setMcpCategories] = useState([])
  const [showMcpCatalog, setShowMcpCatalog] = useState(false)
  const [showMcpCustom, setShowMcpCustom] = useState(false)
  const [mcpSyncing, setMcpSyncing] = useState(null)
  const [mcpExpanded, setMcpExpanded] = useState(null)
  const [mcpConnecting, setMcpConnecting] = useState(null)
  const [mcpConnectForm, setMcpConnectForm] = useState(null) // { id, name, auth_type, setup_instructions, server_url, auth_value }
  const [mcpCustom, setMcpCustom] = useState({
    name: '', server_url: '', auth_type: 'none', auth_value: '',
  })

  // Live Connectors (Google Drive)
  const [gdriveConnected, setGdriveConnected] = useState(false)
  const [gdriveEmail, setGdriveEmail] = useState('')
  const [gdriveLoading, setGdriveLoading] = useState(true)
  const [syncs, setSyncs] = useState([])
  const [folderQuery, setFolderQuery] = useState('')
  const [folderResults, setFolderResults] = useState([])
  const [folderSearching, setFolderSearching] = useState(false)
  const [selectedFolder, setSelectedFolder] = useState(null)
  const [syncCreating, setSyncCreating] = useState(false)
  const [expandedSync, setExpandedSync] = useState(null)
  const [syncFiles, setSyncFiles] = useState({})

  // Widget config
  const [widgetConfig, setWidgetConfig] = useState({
    color: '#ffffff', greeting: 'Hi! Ask me anything.', position: 'right',
    subtitle: 'Powered by Cane', placeholder: 'Type a message...',
    border_radius: '16', logo_url: '', auto_open: '0',
  })
  const [widgetDirty, setWidgetDirty] = useState(false)
  const [widgetSaving, setWidgetSaving] = useState(false)

  // Replica personality
  const [replicaProfile, setReplicaProfile] = useState({
    name: '', role: '', style: '', topics: '', traits: '',
  })
  const [replicaGenerating, setReplicaGenerating] = useState(false)

  // Sub-Agent Links
  const [agentLinks, setAgentLinks] = useState([])
  const [showAddLink, setShowAddLink] = useState(false)
  const [availableAgents, setAvailableAgents] = useState([])
  const [newLink, setNewLink] = useState({ child_agent_id: '', tool_name: '', tool_description: '' })

  // Scheduled Runs
  const [schedule, setSchedule] = useState(null)
  const [scheduleRuns, setScheduleRuns] = useState([])
  const [showAddSchedule, setShowAddSchedule] = useState(false)
  const [showScheduleRuns, setShowScheduleRuns] = useState(false)
  const [expandedRun, setExpandedRun] = useState(null)
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [scheduleTriggering, setScheduleTriggering] = useState(false)
  const [newSchedule, setNewSchedule] = useState({
    prompt: '', schedule_type: 'interval', interval_minutes: 60, daily_time: '09:00',
  })

  // Agent Memory
  const [memories, setMemories] = useState([])
  const [showAddMemory, setShowAddMemory] = useState(false)
  const [memorySaving, setMemorySaving] = useState(false)
  const [memoryClearing, setMemoryClearing] = useState(false)
  const [editingMemory, setEditingMemory] = useState(null)
  const [editMemoryContent, setEditMemoryContent] = useState('')
  const [editMemoryType, setEditMemoryType] = useState('fact')
  const [newMemory, setNewMemory] = useState({ content: '', memory_type: 'fact' })

  // Tabs
  const [tab, setTab] = useState('configure')

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

      // Load MCP servers
      try {
        const mcpRes = await getMcpServers(agentId)
        setMcpServers(mcpRes.servers || [])
      } catch { setMcpServers([]) }

      // Load sub-agent links
      try {
        const linksRes = await getAgentLinks(agentId)
        setAgentLinks(linksRes.links || [])
      } catch { setAgentLinks([]) }

      // Load available agents for linking
      try {
        const allAgents = await getAgents()
        setAvailableAgents((allAgents.agents || []).filter(a => a.id !== agentId))
      } catch { setAvailableAgents([]) }

      // Load widget config
      try {
        const wcRes = await getWidgetConfig(agentId)
        if (wcRes.config && Object.keys(wcRes.config).length > 0) {
          setWidgetConfig(prev => ({ ...prev, ...wcRes.config }))
        }
      } catch { /* ignore */ }

      // Load API keys for this agent
      try {
        const keysRes = await getApiKeys()
        const agentSpecificKeys = (keysRes.keys || []).filter(k => k.workspace_id === agentId)
        setAgentKeys(agentSpecificKeys)
      } catch { setAgentKeys([]) }

      // Load schedule
      try {
        const schedRes = await getSchedules(agentId)
        const s = (schedRes.schedules || [])[0] || null
        setSchedule(s)
        if (s) {
          const runsRes = await getScheduleRuns(agentId, s.id)
          setScheduleRuns(runsRes.runs || [])
        }
      } catch { setSchedule(null) }

      // Load memories
      try {
        const memRes = await getMemories(agentId)
        setMemories(memRes.memories || [])
      } catch { setMemories([]) }

      // Load Google Drive connector status + syncs
      loadConnectorStatus()
    } catch (e) {
      console.error('Failed to load agent:', e)
    } finally {
      setLoading(false)
    }
  }

  const loadConnectorStatus = async () => {
    setGdriveLoading(true)
    try {
      const status = await getGdriveStatus()
      setGdriveConnected(status.connected)
      setGdriveEmail(status.account_email || '')
      if (status.connected) {
        const syncsRes = await listSyncs(agentId)
        setSyncs(syncsRes.syncs || [])
      }
    } catch { /* ignore */ }
    setGdriveLoading(false)
  }

  // Poll running syncs for status updates
  useEffect(() => {
    const runningSyncs = syncs.filter(s => s.last_sync_status === 'running')
    if (runningSyncs.length === 0) return
    const interval = setInterval(async () => {
      try {
        const syncsRes = await listSyncs(agentId)
        setSyncs(syncsRes.syncs || [])
        const stillRunning = (syncsRes.syncs || []).some(s => s.last_sync_status === 'running')
        if (!stillRunning) {
          // Reload docs since new ones may have been added
          const docsRes = await getDocuments(agentId)
          setDocuments(docsRes.documents || [])
        }
      } catch { /* ignore */ }
    }, 5000)
    return () => clearInterval(interval)
  }, [syncs.filter(s => s.last_sync_status === 'running').length])

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

  const markDirty = (overrides = {}) => {
    if (!agent) return
    const name = overrides.name !== undefined ? overrides.name : editName
    const desc = overrides.description !== undefined ? overrides.description : editDescription
    const prompt = overrides.prompt !== undefined ? overrides.prompt : editPrompt
    const changed = name !== (agent.name || '') ||
      desc !== (agent.agent_description || '') ||
      prompt !== (agent.system_prompt || '')
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
        parameters: [],
        payload_template: {},
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

  const handleEditTool = (tool) => {
    setEditingTool(tool.id)
    setEditTool({
      name: tool.name, description: tool.description, url: tool.url,
      method: tool.method || 'POST', fire_and_forget: tool.fire_and_forget,
      auth_type: tool.auth_type || 'none', auth_value: '',
      parameters: tool.parameters || [],
    })
  }

  const handleSaveEditTool = async () => {
    if (!editTool.name.trim() || !editTool.url.trim() || !editTool.description.trim()) {
      alert('Name, description, and URL are required')
      return
    }
    try {
      const updates = { ...editTool }
      if (!updates.auth_value) delete updates.auth_value // don't overwrite with empty
      await updateTool(editingTool, updates)
      const toolsRes = await getTools(agentId)
      setTools(toolsRes.tools || [])
      setEditingTool(null)
      setEditTool(null)
    } catch (err) {
      alert(err.message || 'Failed to update tool')
    }
  }

  // ─── Copy tools from another agent ───
  const handleShowCopyTools = async () => {
    if (showCopyTools) { setShowCopyTools(false); return }
    try {
      const res = await getAgents()
      const others = (res.agents || []).filter(a => a.id !== agentId)
      setOtherAgents(others)
      setShowCopyTools(true)
    } catch { setOtherAgents([]) }
  }

  const handleCopyTools = async (sourceId) => {
    setCopyingFrom(sourceId)
    try {
      const res = await copyTools(sourceId, agentId)
      const toolsRes = await getTools(agentId)
      setTools(toolsRes.tools || [])
      setShowCopyTools(false)
      alert(`Copied ${res.copied} tool(s)`)
    } catch (err) {
      alert(err.message || 'Failed to copy tools')
    } finally { setCopyingFrom(null) }
  }

  // ─── API Key handlers ───
  const handleCreateKey = async () => {
    try {
      const res = await createApiKey(`${agent?.name || 'Agent'} Key`, agentId)
      if (res.key) {
        setShowNewKey(res.key)
        setCopiedKey(false)
      }
      const keysRes = await getApiKeys()
      setAgentKeys((keysRes.keys || []).filter(k => k.workspace_id === agentId))
    } catch (err) {
      alert(err.message || 'Failed to create key')
    }
  }

  const handleDeleteKey = async (keyId) => {
    if (!confirm('Delete this API key? Any widgets using it will stop working.')) return
    try {
      await deleteApiKey(keyId)
      setAgentKeys(prev => prev.filter(k => k.id !== keyId))
    } catch (err) {
      alert(err.message)
    }
  }

  // ─── MCP handlers ───

  const handleOpenCatalog = async () => {
    if (mcpCatalog.length === 0) {
      try {
        const res = await getMcpCatalog()
        setMcpCatalog(res.connectors || [])
        setMcpCategories(res.categories || [])
      } catch { /* ignore */ }
    }
    setShowMcpCatalog(true)
    setShowMcpCustom(false)
  }

  const handleConnectCatalog = (connector) => {
    setMcpConnectForm({
      id: connector.id,
      name: connector.name,
      icon: connector.icon,
      auth_type: connector.auth_type,
      setup_instructions: connector.setup_instructions,
      server_url: '',
      auth_value: '',
    })
  }

  const handleSubmitCatalogConnect = async () => {
    if (!mcpConnectForm) return
    if (!mcpConnectForm.server_url.trim()) { alert('Server URL is required'); return }
    if (mcpConnectForm.auth_type !== 'none' && !mcpConnectForm.auth_value.trim()) { alert('Auth token is required'); return }
    setMcpConnecting(mcpConnectForm.id)
    try {
      const res = await connectMcpServer(agentId, {
        name: mcpConnectForm.name,
        server_url: mcpConnectForm.server_url,
        server_type: mcpConnectForm.id,
        icon: mcpConnectForm.icon,
        auth_type: mcpConnectForm.auth_type,
        auth_value: mcpConnectForm.auth_value,
      })
      setMcpServers(prev => [res, ...prev])
      setMcpConnectForm(null)
      setShowMcpCatalog(false)
    } catch (err) {
      alert(err.message || 'Failed to connect')
    } finally {
      setMcpConnecting(null)
    }
  }

  const handleConnectCustom = async () => {
    if (!mcpCustom.name.trim() || !mcpCustom.server_url.trim()) {
      alert('Name and server URL are required')
      return
    }
    setMcpConnecting('custom')
    try {
      const res = await connectMcpServer(agentId, {
        ...mcpCustom,
        server_type: 'custom',
      })
      setMcpServers(prev => [res, ...prev])
      setShowMcpCustom(false)
      setMcpCustom({ name: '', server_url: '', auth_type: 'none', auth_value: '' })
    } catch (err) {
      alert(err.message || 'Failed to connect')
    } finally {
      setMcpConnecting(null)
    }
  }

  const handleSyncMcp = async (serverId) => {
    setMcpSyncing(serverId)
    try {
      const res = await syncMcpServer(serverId)
      setMcpServers(prev => prev.map(s => s.id === serverId ? res : s))
    } catch (err) {
      alert(err.message || 'Sync failed')
    } finally {
      setMcpSyncing(null)
    }
  }

  const handleToggleMcp = async (server) => {
    try {
      const res = await updateMcpServer(server.id, { is_enabled: !server.is_enabled })
      setMcpServers(prev => prev.map(s => s.id === server.id ? res : s))
    } catch (err) {
      alert(err.message)
    }
  }

  const handleDeleteMcp = async (serverId) => {
    if (!confirm('Disconnect this MCP server?')) return
    try {
      await deleteMcpServer(serverId)
      setMcpServers(prev => prev.filter(s => s.id !== serverId))
    } catch (err) {
      alert(err.message)
    }
  }

  const handleWidgetChange = (key, value) => {
    setWidgetConfig(prev => ({ ...prev, [key]: value }))
    setWidgetDirty(true)
  }

  const handleSaveWidget = async () => {
    setWidgetSaving(true)
    try {
      await updateWidgetConfig(agentId, widgetConfig)
      setWidgetDirty(false)
    } catch (err) {
      alert(err.message || 'Failed to save widget config')
    } finally {
      setWidgetSaving(false)
    }
  }

  // ── Google Drive Connector handlers ──
  const handleConnectGdrive = async () => {
    try {
      const res = await getGdriveAuthUrl(agentId)
      const popup = window.open(res.auth_url, 'gdrive-auth', 'width=500,height=600,popup=yes')
      const handleMessage = (event) => {
        if (event.data?.type === 'gdrive-connected') {
          window.removeEventListener('message', handleMessage)
          setGdriveConnected(true)
          setGdriveEmail(event.data.email || '')
          loadConnectorStatus()
        } else if (event.data?.type === 'gdrive-error') {
          window.removeEventListener('message', handleMessage)
          alert('Google Drive connection failed: ' + (event.data.error || 'Unknown error'))
        }
      }
      window.addEventListener('message', handleMessage)
    } catch (e) {
      alert('Failed to start Google Drive connection: ' + e.message)
    }
  }

  const handleDisconnectGdrive = async () => {
    if (!confirm('Disconnect Google Drive? All synced documents will be removed.')) return
    try {
      await disconnectGdrive()
      setGdriveConnected(false)
      setGdriveEmail('')
      setSyncs([])
      const docsRes = await getDocuments(agentId)
      setDocuments(docsRes.documents || [])
    } catch (e) {
      alert('Failed to disconnect: ' + e.message)
    }
  }

  const handleFolderSearch = async (query) => {
    setFolderQuery(query)
    setSelectedFolder(null)
    if (query.length < 2) { setFolderResults([]); return }
    setFolderSearching(true)
    try {
      const res = await listDriveFolders(query)
      setFolderResults(res.folders || [])
    } catch { setFolderResults([]) }
    setFolderSearching(false)
  }

  const handleCreateSync = async () => {
    if (!selectedFolder) return
    setSyncCreating(true)
    try {
      await createSync(agentId, selectedFolder.id, selectedFolder.name)
      setSelectedFolder(null)
      setFolderQuery('')
      setFolderResults([])
      loadConnectorStatus()
    } catch (e) {
      alert('Failed to create sync: ' + e.message)
    }
    setSyncCreating(false)
  }

  const handleTriggerSync = async (syncId) => {
    try {
      await triggerSync(syncId)
      setSyncs(prev => prev.map(s => s.id === syncId ? { ...s, last_sync_status: 'running' } : s))
    } catch (e) {
      alert('Sync failed: ' + e.message)
    }
  }

  const handleToggleSync = async (syncId, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'paused' : 'active'
    try {
      await updateSyncStatus(syncId, newStatus)
      setSyncs(prev => prev.map(s => s.id === syncId ? { ...s, status: newStatus } : s))
    } catch (e) {
      alert('Failed to update sync: ' + e.message)
    }
  }

  const handleDeleteSync = async (syncId, folderName) => {
    if (!confirm(`Remove sync for "${folderName}"? All synced documents will be deleted.`)) return
    try {
      await deleteSync(syncId)
      setSyncs(prev => prev.filter(s => s.id !== syncId))
      const docsRes = await getDocuments(agentId)
      setDocuments(docsRes.documents || [])
    } catch (e) {
      alert('Failed to delete sync: ' + e.message)
    }
  }

  const handleExpandSync = async (syncId) => {
    if (expandedSync === syncId) { setExpandedSync(null); return }
    setExpandedSync(syncId)
    try {
      const res = await getSync(syncId)
      setSyncFiles(prev => ({ ...prev, [syncId]: res.files || [] }))
    } catch { /* ignore */ }
  }

  // Sub-Agent Link handlers
  const handleAddLink = async () => {
    if (!newLink.child_agent_id || !newLink.tool_name || !newLink.tool_description) return
    try {
      const res = await createAgentLink(agentId, newLink)
      setAgentLinks(prev => [res, ...prev])
      setNewLink({ child_agent_id: '', tool_name: '', tool_description: '' })
      setShowAddLink(false)
    } catch (e) {
      alert(e.message)
    }
  }

  const handleToggleLink = async (link) => {
    try {
      await updateAgentLink(agentId, link.id, { is_enabled: !link.is_enabled })
      setAgentLinks(prev => prev.map(l => l.id === link.id ? { ...l, is_enabled: !l.is_enabled } : l))
    } catch (e) { alert(e.message) }
  }

  const handleDeleteLink = async (linkId) => {
    if (!confirm('Remove this sub-agent link?')) return
    try {
      await deleteAgentLink(agentId, linkId)
      setAgentLinks(prev => prev.filter(l => l.id !== linkId))
    } catch (e) { alert(e.message) }
  }

  const linkedAgentIds = new Set(agentLinks.map(l => l.child_agent_id))
  const linkableAgents = availableAgents.filter(a => !linkedAgentIds.has(a.id))

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
              onChange={e => { setEditName(e.target.value); markDirty({ name: e.target.value }) }}
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
              onChange={e => { setEditDescription(e.target.value); markDirty({ description: e.target.value }) }}
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
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <Link to={`/agents/${agentId}/analytics`} className="btn btn-outline" style={{ fontSize: '0.82rem' }}>
              <BarChart3 size={14} /> Analytics
            </Link>
            <button
              className={dirty ? "btn btn-primary" : "btn btn-outline"}
              onClick={handleSave}
              disabled={saving || !dirty}
              style={{ opacity: dirty ? 1 : 0.4 }}
            >
              <Save size={14} /> {saving ? 'Saving...' : dirty ? 'Save Agent' : 'Saved'}
            </button>
          </div>
        </div>
      </div>

      {/* Ask this agent + History */}
      {readyDocs.length > 0 && agent.system_prompt && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          <button
            className="btn btn-primary"
            style={{ flex: 1, padding: 12, justifyContent: 'center', fontSize: '0.9375rem' }}
            onClick={() => navigate(`/search?workspace=${agentId}`)}
          >
            <MessageSquare size={16} /> Ask this agent
          </button>
          <button
            className="btn btn-outline"
            style={{ padding: '12px 16px', fontSize: '0.8125rem' }}
            onClick={() => navigate(`/agents/${agentId}/conversations`)}
          >
            <Clock size={14} /> History
          </button>
        </div>
      )}

      {/* Tab Navigation */}
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
            </button>
          )
        })}
      </div>

      {/* Search toggle */}
      {tab === 'configure' && (
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
      )}

      {/* Tool Chaining toggle */}
      {tab === 'configure' && (
      <div className="card" style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>Tool Chaining</div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            Allow the agent to chain up to 5 tool calls in sequence for complex tasks
          </div>
        </div>
        <button
          className="btn btn-ghost"
          onClick={async () => {
            const newVal = !agent.tool_chaining_enabled
            await updateAgent(agentId, { tool_chaining_enabled: newVal })
            setAgent(prev => ({ ...prev, tool_chaining_enabled: newVal }))
          }}
          style={{ padding: 4 }}
        >
          {agent.tool_chaining_enabled
            ? <ToggleRight size={28} style={{ color: 'var(--accent)' }} />
            : <ToggleLeft size={28} style={{ color: 'var(--text-muted)' }} />
          }
        </button>
      </div>
      )}

      {/* Orchestrator Mode */}
      {tab === 'configure' && (
      <div className="card" style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>Orchestrator Mode</div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            Auto-discovers all agents in your workspace and routes queries to the best specialist. No manual linking needed.
          </div>
        </div>
        <button
          className="btn btn-ghost"
          onClick={async () => {
            const newVal = !agent.orchestrator_mode
            await updateAgent(agentId, { orchestrator_mode: newVal })
            setAgent(prev => ({ ...prev, orchestrator_mode: newVal }))
          }}
          style={{ padding: 4 }}
        >
          {agent.orchestrator_mode
            ? <ToggleRight size={28} style={{ color: 'var(--accent)' }} />
            : <ToggleLeft size={28} style={{ color: 'var(--text-muted)' }} />
          }
        </button>
      </div>
      )}

      {/* Files */}
      {tab === 'knowledge' && (
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
            background: dragover ? 'rgba(255,255,255,0.04)' : 'transparent',
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
      )}

      {/* Replica Personality Profile */}
      {tab === 'configure' && agent.agent_type === 'digital_replica' && (
        <div className="card" style={{ marginBottom: 24, borderColor: 'rgba(255,255,255,0.12)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              Personality Profile
              <span style={{
                fontSize: '0.55rem', fontWeight: 600, background: 'var(--accent)', color: 'white',
                padding: '1px 6px', borderRadius: 8,
              }}>REPLICA</span>
            </h3>
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
            Tell us about the person this replica represents. Upload their writing samples as files above, then fill in the profile below. We'll analyze everything to generate a system prompt that captures their voice.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Name</label>
              <input
                type="text" placeholder="Colin Flynn"
                value={replicaProfile.name}
                onChange={e => setReplicaProfile(p => ({ ...p, name: e.target.value }))}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--rule)', background: 'var(--paper)',
                  color: 'var(--text)', fontSize: '0.8125rem',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Role / What they do</label>
              <input
                type="text" placeholder="CEO at Cane, builds AI products"
                value={replicaProfile.role}
                onChange={e => setReplicaProfile(p => ({ ...p, role: e.target.value }))}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--rule)', background: 'var(--paper)',
                  color: 'var(--text)', fontSize: '0.8125rem',
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Communication style</label>
            <input
              type="text" placeholder="Direct, casual, uses humor, short sentences, no corporate jargon"
              value={replicaProfile.style}
              onChange={e => setReplicaProfile(p => ({ ...p, style: e.target.value }))}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--rule)', background: 'var(--paper)',
                color: 'var(--text)', fontSize: '0.8125rem',
              }}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Key topics they know about</label>
            <input
              type="text" placeholder="AI agents, SaaS, product strategy, startups, sales"
              value={replicaProfile.topics}
              onChange={e => setReplicaProfile(p => ({ ...p, topics: e.target.value }))}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--rule)', background: 'var(--paper)',
                color: 'var(--text)', fontSize: '0.8125rem',
              }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Personality traits</label>
            <input
              type="text" placeholder="Ambitious, builder mentality, moves fast, values authenticity"
              value={replicaProfile.traits}
              onChange={e => setReplicaProfile(p => ({ ...p, traits: e.target.value }))}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--rule)', background: 'var(--paper)',
                color: 'var(--text)', fontSize: '0.8125rem',
              }}
            />
          </div>

          <button
            className="btn btn-primary"
            disabled={replicaGenerating || !replicaProfile.name.trim()}
            onClick={async () => {
              setReplicaGenerating(true)
              try {
                const res = await generateReplicaPrompt(agentId, replicaProfile)
                if (res.system_prompt) {
                  setEditPrompt(res.system_prompt)
                  setAgent(prev => ({ ...prev, system_prompt: res.system_prompt }))
                  setDirty(false)
                }
              } catch (e) {
                alert(e.message || 'Failed to generate replica prompt')
              } finally {
                setReplicaGenerating(false)
              }
            }}
            style={{ width: '100%' }}
          >
            <Sparkles size={14} style={{ marginRight: 6 }} />
            {replicaGenerating ? 'Analyzing personality & writing samples...' : 'Generate My Replica'}
          </button>

          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>
            Upload writing samples (emails, posts, messages) as files above for best results. The more samples, the more accurate the replica.
          </div>
        </div>
      )}

      {/* System Prompt */}
      {tab === 'configure' && (
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            AI Instructions
            <span style={{
              fontSize: '0.55rem', fontWeight: 600, background: 'var(--accent)', color: 'white',
              padding: '1px 6px', borderRadius: 8,
            }}>AUTO-GENERATE</span>
          </h3>
          <div style={{ display: 'flex', gap: 8 }}>
            {readyDocs.length > 0 && (
              <button
                className="btn btn-ghost"
                onClick={handleGenerate}
                disabled={generating}
                title={agent.agent_type === 'custom' ? 'Auto-generate prompt from files' : 'Refine this prompt using your uploaded files'}
              >
                <Sparkles size={14} />
                {generating ? 'Generating...' : agent.agent_type === 'custom' ? 'Auto-generate' : 'Refine with files'}
              </button>
            )}
          </div>
        </div>

        <textarea
          value={editPrompt}
          onChange={e => { setEditPrompt(e.target.value); markDirty({ prompt: e.target.value }) }}
          placeholder={agent.agent_type === 'custom'
            ? 'Upload files and click "Auto-generate" to create a specialized prompt, or write your own...'
            : 'Template prompt loaded. Upload files and click "Refine with files" to specialize it for your documents...'
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
      )}

      {/* Tools */}
      {tab === 'tools' && (
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
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setShowAddTool(!showAddTool)} style={{ fontSize: '0.8rem' }}>
              <Plus size={14} /> Add Tool
            </button>
            <button className="btn btn-ghost" onClick={handleShowCopyTools} style={{ fontSize: '0.8rem' }}>
              <Copy size={14} /> Copy from Agent
            </button>
          </div>
        </div>

        {/* Setup banner for unconfigured tools */}
        {tools.filter(t => !t.url).length > 0 && (
          <div style={{
            padding: '14px 16px', borderRadius: 'var(--radius-sm)',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 12,
          }}>
            <Wrench size={18} style={{ color: 'var(--cane-600)', flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.84rem', marginBottom: 4 }}>
                {tools.filter(t => !t.url).length} tool{tools.filter(t => !t.url).length > 1 ? 's need' : ' needs'} setup
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                These tools were cloned without credentials. Click the edit icon on each to configure the webhook URL and auth.
                {' '}For Cane platform tools (email, calendar, sheets), use <code style={{ fontSize: '0.72rem', background: 'var(--cane-100)', padding: '1px 4px', borderRadius: 3 }}>https://cane.fyi/api/...</code>
              </div>
            </div>
          </div>
        )}

        {/* Copy tools from another agent */}
        {showCopyTools && (
          <div style={{
            padding: 16, borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--cane-200)', background: 'var(--cane-50)',
            marginBottom: 16,
          }}>
            <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 10 }}>Copy tools from:</div>
            {otherAgents.length === 0 ? (
              <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.4)' }}>No other agents found</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {otherAgents.map(a => (
                  <button
                    key={a.id}
                    className="btn btn-ghost"
                    disabled={copyingFrom === a.id}
                    onClick={() => handleCopyTools(a.id)}
                    style={{ justifyContent: 'flex-start', fontSize: '0.82rem', padding: '8px 12px' }}
                  >
                    {copyingFrom === a.id ? <RefreshCw size={14} className="spin" /> : <Copy size={14} />}
                    {a.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

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
                Description <span style={{ fontWeight: 400, textTransform: 'none' }}>(tells the AI when to use this tool)</span>
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

            {/* Parameters */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Parameters <span style={{ fontWeight: 400, textTransform: 'none' }}>(fields the AI will send)</span>
                </label>
                <button
                  className="btn btn-ghost"
                  onClick={() => setNewTool({ ...newTool, parameters: [...newTool.parameters, { name: '', type: 'string', description: '', required: false }] })}
                  style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                >
                  <Plus size={12} /> Add Param
                </button>
              </div>
              {newTool.parameters.length === 0 && (
                <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.35)', padding: '8px 0' }}>No parameters. The AI will send raw question/answer fields</div>
              )}
              {newTool.parameters.map((p, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '140px 80px 1fr 60px 30px', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                  <input
                    className="form-input"
                    value={p.name}
                    onChange={e => {
                      const params = [...newTool.parameters]
                      params[i] = { ...params[i], name: e.target.value }
                      setNewTool({ ...newTool, parameters: params })
                    }}
                    placeholder="name"
                    style={{ fontSize: '0.78rem' }}
                  />
                  <select
                    className="form-input"
                    value={p.type}
                    onChange={e => {
                      const params = [...newTool.parameters]
                      params[i] = { ...params[i], type: e.target.value }
                      setNewTool({ ...newTool, parameters: params })
                    }}
                    style={{ fontSize: '0.78rem' }}
                  >
                    <option value="string">string</option>
                    <option value="number">number</option>
                    <option value="boolean">bool</option>
                  </select>
                  <input
                    className="form-input"
                    value={p.description}
                    onChange={e => {
                      const params = [...newTool.parameters]
                      params[i] = { ...params[i], description: e.target.value }
                      setNewTool({ ...newTool, parameters: params })
                    }}
                    placeholder="Description"
                    style={{ fontSize: '0.78rem' }}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={p.required || false}
                      onChange={e => {
                        const params = [...newTool.parameters]
                        params[i] = { ...params[i], required: e.target.checked }
                        setNewTool({ ...newTool, parameters: params })
                      }}
                    />
                    Req
                  </label>
                  <button
                    className="btn btn-ghost"
                    onClick={() => setNewTool({ ...newTool, parameters: newTool.parameters.filter((_, j) => j !== i) })}
                    style={{ padding: 2, color: 'rgba(255,255,255,0.35)' }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
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
                border: `1px solid ${editingTool === tool.id ? 'var(--cane-400)' : tool.is_enabled ? 'var(--cane-200)' : 'var(--border)'}`,
                background: editingTool === tool.id ? 'var(--cane-50, #fdf8f0)' : tool.is_enabled ? 'var(--bg-card)' : 'var(--bg)',
                opacity: tool.is_enabled ? 1 : 0.6,
              }}>
                {editingTool === tool.id && editTool ? (
                  /* ── Inline Edit Form ── */
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                      <div>
                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tool Name</label>
                        <input className="form-input" value={editTool.name} onChange={e => setEditTool({ ...editTool, name: e.target.value })} style={{ fontSize: '0.84rem' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Webhook URL</label>
                        <input className="form-input" value={editTool.url} onChange={e => setEditTool({ ...editTool, url: e.target.value })} style={{ fontSize: '0.84rem' }} />
                      </div>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Description</label>
                      <textarea className="form-input" value={editTool.description} onChange={e => setEditTool({ ...editTool, description: e.target.value })} style={{ fontSize: '0.84rem', minHeight: 60, resize: 'vertical' }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                      <div>
                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Method</label>
                        <select className="form-input" value={editTool.method} onChange={e => setEditTool({ ...editTool, method: e.target.value })}>
                          <option value="POST">POST</option><option value="GET">GET</option><option value="PUT">PUT</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Behavior</label>
                        <select className="form-input" value={editTool.fire_and_forget ? 'fire' : 'wait'} onChange={e => setEditTool({ ...editTool, fire_and_forget: e.target.value === 'fire' })}>
                          <option value="fire">Fire & Forget</option><option value="wait">Wait for Response</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Auth</label>
                        <select className="form-input" value={editTool.auth_type} onChange={e => setEditTool({ ...editTool, auth_type: e.target.value })}>
                          <option value="none">None</option><option value="bearer">Bearer</option><option value="api_key">API Key</option>
                        </select>
                      </div>
                    </div>
                    {editTool.auth_type !== 'none' && (
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {editTool.auth_type === 'bearer' ? 'Bearer Token' : 'API Key'} <span style={{ fontWeight: 400, textTransform: 'none' }}>(leave blank to keep current)</span>
                        </label>
                        <input className="form-input" type="password" value={editTool.auth_value} onChange={e => setEditTool({ ...editTool, auth_value: e.target.value })} style={{ fontSize: '0.84rem' }} />
                      </div>
                    )}
                    {/* Parameters */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Parameters
                        </label>
                        <button
                          className="btn btn-ghost"
                          onClick={() => setEditTool({ ...editTool, parameters: [...(editTool.parameters || []), { name: '', type: 'string', description: '', required: false }] })}
                          style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                        >
                          <Plus size={12} /> Add
                        </button>
                      </div>
                      {(editTool.parameters || []).map((p, i) => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '120px 70px 1fr 50px 24px', gap: 6, marginBottom: 5, alignItems: 'center' }}>
                          <input className="form-input" value={p.name} onChange={e => { const params = [...editTool.parameters]; params[i] = { ...params[i], name: e.target.value }; setEditTool({ ...editTool, parameters: params }) }} placeholder="name" style={{ fontSize: '0.76rem' }} />
                          <select className="form-input" value={p.type || 'string'} onChange={e => { const params = [...editTool.parameters]; params[i] = { ...params[i], type: e.target.value }; setEditTool({ ...editTool, parameters: params }) }} style={{ fontSize: '0.76rem' }}>
                            <option value="string">str</option><option value="number">num</option><option value="boolean">bool</option>
                          </select>
                          <input className="form-input" value={p.description} onChange={e => { const params = [...editTool.parameters]; params[i] = { ...params[i], description: e.target.value }; setEditTool({ ...editTool, parameters: params }) }} placeholder="Description" style={{ fontSize: '0.76rem' }} />
                          <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.7rem', cursor: 'pointer' }}>
                            <input type="checkbox" checked={p.required || false} onChange={e => { const params = [...editTool.parameters]; params[i] = { ...params[i], required: e.target.checked }; setEditTool({ ...editTool, parameters: params }) }} />
                            Req
                          </label>
                          <button className="btn btn-ghost" onClick={() => setEditTool({ ...editTool, parameters: editTool.parameters.filter((_, j) => j !== i) })} style={{ padding: 1, color: 'rgba(255,255,255,0.35)' }}>
                            <X size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary" onClick={handleSaveEditTool} style={{ fontSize: '0.82rem' }}><Save size={14} /> Save</button>
                      <button className="btn btn-ghost" onClick={() => { setEditingTool(null); setEditTool(null) }} style={{ fontSize: '0.82rem' }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  /* ── Read-only Tool Card ── */
                  <>
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
                        <button className="btn btn-ghost" onClick={() => handleTestTool(tool.id)} disabled={toolTesting === tool.id} style={{ padding: '4px 8px', fontSize: '0.75rem' }} title="Test this tool">
                          <Play size={12} /> {toolTesting === tool.id ? '...' : 'Test'}
                        </button>
                        <button className="btn btn-ghost" onClick={() => handleEditTool(tool)} style={{ padding: '4px 8px' }} title="Edit tool">
                          <Pencil size={13} />
                        </button>
                        <button className="btn btn-ghost" onClick={() => handleToggleTool(tool)} style={{ padding: '4px 8px' }} title={tool.is_enabled ? 'Disable' : 'Enable'}>
                          {tool.is_enabled ? <ToggleRight size={16} style={{ color: 'var(--cane-600)' }} /> : <ToggleLeft size={16} />}
                        </button>
                        <button className="btn btn-ghost" onClick={() => handleDeleteTool(tool.id)} style={{ padding: '4px 8px' }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Test result */}
                    {toolTestResult && toolTesting === null && expandedTool === tool.id && (
                      <div style={{
                        marginTop: 10, padding: '8px 12px', borderRadius: 6,
                        fontSize: '0.78rem', fontFamily: 'monospace',
                        background: toolTestResult.status === 'ok' ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)',
                        border: `1px solid ${toolTestResult.status === 'ok' ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`,
                        color: toolTestResult.status === 'ok' ? '#4ade80' : '#f87171',
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
                  </>
                )}
              </div>
            ))}
          </div>
        ) : !showAddTool ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)' }}>
            <Wrench size={24} style={{ marginBottom: 8, opacity: 0.4 }} />
            <div style={{ fontSize: '0.84rem', fontWeight: 500 }}>No tools configured</div>
            <div style={{ fontSize: '0.78rem', marginTop: 4 }}>
              Add webhooks to let this agent take actions: log to sheets, send Slack messages, trigger Zapier workflows.
            </div>
          </div>
        ) : null}
      </div>
      )}

      {/* ════════════ Live Connectors (Google Drive) ════════════ */}
      {tab === 'knowledge' && (
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Cloud size={16} /> Live Connectors
            {syncs.length > 0 && (
              <span style={{
                fontSize: '0.65rem', fontWeight: 700, background: 'var(--accent-muted)',
                color: 'var(--accent)', padding: '2px 8px', borderRadius: 8,
              }}>{syncs.reduce((sum, s) => sum + (s.files_synced || 0), 0)} files synced</span>
            )}
          </h3>
          {gdriveConnected && (
            <button className="btn btn-ghost" onClick={handleDisconnectGdrive} style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <Unplug size={12} /> Disconnect
            </button>
          )}
        </div>

        {gdriveLoading ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
            <span className="spinner" style={{ width: 14, height: 14, marginRight: 6 }} /> Loading...
          </div>
        ) : !gdriveConnected ? (
          /* ── State A: Not connected ── */
          <div style={{ textAlign: 'center', padding: '32px 20px' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>
              <svg width="40" height="40" viewBox="0 0 87.3 78" style={{ display: 'inline-block' }}>
                <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H1c0 1.55.4 3.1 1.2 4.5z" fill="#0066DA"/>
                <path d="M43.65 25L29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z" fill="#00AC47"/>
                <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.95 10.3z" fill="#EA4335"/>
                <path d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" fill="#00832D"/>
                <path d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h36.75c1.6 0 3.15-.45 4.5-1.2z" fill="#2684FC"/>
                <path d="M73.4 26.5l-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25l16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#FFBA00"/>
              </svg>
            </div>
            <div style={{ fontSize: '0.88rem', fontWeight: 600, marginBottom: 6 }}>Connect Google Drive</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 16, maxWidth: 360, margin: '0 auto 16px' }}>
              Sync files directly from Google Drive into this agent's knowledge base. Files stay up to date automatically.
            </div>
            <button className="btn btn-primary" onClick={handleConnectGdrive} style={{ fontSize: '0.84rem' }}>
              Connect Google Drive
            </button>
          </div>
        ) : (
          /* ── State B/C: Connected ── */
          <div>
            {/* Connected status */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
              padding: '8px 12px', background: 'rgba(74,222,128,0.08)', borderRadius: 'var(--radius-sm)',
              fontSize: '0.8rem', color: 'var(--success)',
            }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} />
              Connected as <strong>{gdriveEmail}</strong>
            </div>

            {/* Folder picker */}
            <div style={{ marginBottom: 16 }}>
              <label style={{
                fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)',
                display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em',
              }}>
                Add a folder to sync
              </label>
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      className="form-input"
                      value={folderQuery}
                      onChange={e => handleFolderSearch(e.target.value)}
                      placeholder="Search your Drive folders..."
                      style={{ fontSize: '0.84rem', paddingLeft: 32 }}
                    />
                    <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    {folderSearching && (
                      <span className="spinner" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14 }} />
                    )}
                  </div>
                  {selectedFolder && (
                    <button
                      className="btn btn-primary"
                      onClick={handleCreateSync}
                      disabled={syncCreating}
                      style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}
                    >
                      {syncCreating ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Syncing...</> : <><Plus size={14} /> Start Sync</>}
                    </button>
                  )}
                </div>

                {/* Folder search results dropdown */}
                {folderResults.length > 0 && !selectedFolder && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-lg)',
                    maxHeight: 200, overflowY: 'auto', marginTop: 4,
                  }}>
                    {folderResults.map(folder => (
                      <button
                        key={folder.id}
                        onClick={() => {
                          setSelectedFolder(folder)
                          setFolderQuery(folder.name)
                          setFolderResults([])
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                          padding: '8px 12px', border: 'none', background: 'none',
                          cursor: 'pointer', fontSize: '0.84rem', color: 'var(--text)',
                          textAlign: 'left',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                      >
                        <FolderOpen size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                        {folder.name}
                      </button>
                    ))}
                  </div>
                )}

                {selectedFolder && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, marginTop: 8,
                    padding: '6px 10px', background: 'var(--accent-muted)', borderRadius: 'var(--radius-sm)',
                    fontSize: '0.8rem',
                  }}>
                    <FolderOpen size={14} style={{ color: 'var(--accent)' }} />
                    <span style={{ fontWeight: 600 }}>{selectedFolder.name}</span>
                    <button
                      onClick={() => { setSelectedFolder(null); setFolderQuery(''); }}
                      style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Active syncs */}
            {syncs.length > 0 && (
              <div>
                <label style={{
                  fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)',
                  display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em',
                }}>
                  Synced Folders
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {syncs.map(sync => {
                    const isRunning = sync.last_sync_status === 'running'
                    const hasError = sync.last_sync_status === 'error'
                    const isPaused = sync.status === 'paused'
                    const statusColor = isRunning ? 'var(--warning)' : hasError ? 'var(--error)' : isPaused ? 'var(--text-muted)' : 'var(--success)'

                    return (
                      <div key={sync.id} style={{
                        padding: '12px 16px', borderRadius: 'var(--radius-sm)',
                        border: `1px solid ${hasError ? 'rgba(248,113,113,0.3)' : 'var(--border)'}`,
                        background: isPaused ? 'var(--bg)' : 'var(--bg-card)',
                        opacity: isPaused ? 0.7 : 1,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
                            <FolderOpen size={16} style={{ color: 'var(--accent)' }} />
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '0.84rem' }}>{sync.remote_folder_name}</div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                {isRunning ? (
                                  <><span className="spinner" style={{ width: 10, height: 10, marginRight: 4, display: 'inline-block', verticalAlign: 'middle' }} /> Syncing...</>
                                ) : sync.last_sync_at ? (
                                  <>Last synced {new Date(sync.last_sync_at).toLocaleString()}</>
                                ) : 'Not synced yet'}
                                {sync.last_sync_message && !isRunning && (
                                  <> — {sync.last_sync_message}</>
                                )}
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{
                              fontSize: '0.68rem', color: 'var(--text-muted)', padding: '2px 8px',
                              background: 'var(--bg)', borderRadius: 8,
                            }}>{sync.files_synced} files</span>
                            <button className="btn btn-ghost" onClick={() => handleTriggerSync(sync.id)} disabled={isRunning} style={{ padding: '4px 8px', fontSize: '0.75rem' }} title="Sync now">
                              <RefreshCw size={12} />
                            </button>
                            <button className="btn btn-ghost" onClick={() => handleToggleSync(sync.id, sync.status)} style={{ padding: '4px 8px', fontSize: '0.75rem' }} title={isPaused ? 'Resume' : 'Pause'}>
                              {isPaused ? <Play size={12} /> : <Pause size={12} />}
                            </button>
                            <button className="btn btn-ghost" onClick={() => handleExpandSync(sync.id)} style={{ padding: '4px 8px', fontSize: '0.75rem' }}>
                              {expandedSync === sync.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>
                            <button className="btn btn-ghost" onClick={() => handleDeleteSync(sync.id, sync.remote_folder_name)} style={{ padding: '4px 8px', fontSize: '0.75rem', color: 'var(--error)' }} title="Remove sync">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>

                        {/* Expanded file list */}
                        {expandedSync === sync.id && syncFiles[sync.id] && (
                          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                            {syncFiles[sync.id].length === 0 ? (
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', padding: 12 }}>No files synced yet</div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {syncFiles[sync.id].map(file => (
                                  <div key={file.id} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '6px 8px', fontSize: '0.78rem', borderRadius: 4,
                                    background: file.status === 'error' ? 'rgba(248,113,113,0.06)' : 'transparent',
                                  }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <FileText size={12} style={{ color: 'var(--text-muted)' }} />
                                      <span>{file.remote_name}</span>
                                    </div>
                                    <span className={`badge badge-${file.status === 'ready' ? 'ready' : file.status === 'error' ? 'error' : 'processing'}`} style={{ fontSize: '0.65rem' }}>
                                      {file.status}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {syncs.length === 0 && (
              <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                Search for a Google Drive folder above to start syncing documents.
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* MCP Connections */}
      {tab === 'tools' && (
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Globe size={16} /> Connections
            {mcpServers.length > 0 && (
              <span style={{
                fontSize: '0.65rem', fontWeight: 700, background: 'var(--cane-100)',
                color: 'var(--cane-700)', padding: '2px 8px', borderRadius: 10,
              }}>{mcpServers.reduce((sum, s) => sum + (s.tool_count || 0), 0)} tools</span>
            )}
          </h3>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost" onClick={() => { setShowMcpCustom(!showMcpCustom); setShowMcpCatalog(false) }} style={{ fontSize: '0.8rem' }}>
              <Plus size={14} /> Custom
            </button>
            <button className="btn btn-ghost" onClick={handleOpenCatalog} style={{ fontSize: '0.8rem' }}>
              <Link2 size={14} /> Browse Connectors
            </button>
          </div>
        </div>

        {/* Catalog browser */}
        {showMcpCatalog && (
          <div style={{
            padding: 16, borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--cane-200)', background: 'var(--cane-50)',
            marginBottom: 16,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>
                {mcpConnectForm ? `Connect ${mcpConnectForm.name}` : 'Pre-Built Connectors'}
              </div>
              <button className="btn btn-ghost" onClick={() => { setShowMcpCatalog(false); setMcpConnectForm(null) }} style={{ padding: '2px 6px' }}>
                <X size={14} />
              </button>
            </div>

            {/* Inline connect form */}
            {mcpConnectForm && (
              <div style={{
                padding: 16, borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--cane-200)', background: 'var(--bg-card)',
                marginBottom: 14,
              }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 }}>
                  {mcpConnectForm.setup_instructions}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      MCP Server URL
                    </label>
                    <input
                      className="form-input"
                      value={mcpConnectForm.server_url}
                      onChange={e => setMcpConnectForm({ ...mcpConnectForm, server_url: e.target.value })}
                      placeholder="https://mcp.example.com/sse"
                      style={{ fontSize: '0.84rem' }}
                    />
                  </div>
                  {mcpConnectForm.auth_type !== 'none' && (
                    <div>
                      <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {mcpConnectForm.auth_type === 'bearer' ? 'Bearer Token' : 'API Key'}
                      </label>
                      <input
                        className="form-input"
                        type="password"
                        value={mcpConnectForm.auth_value}
                        onChange={e => setMcpConnectForm({ ...mcpConnectForm, auth_value: e.target.value })}
                        placeholder="Paste your token here..."
                        style={{ fontSize: '0.84rem' }}
                      />
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-primary"
                    onClick={handleSubmitCatalogConnect}
                    disabled={mcpConnecting === mcpConnectForm.id}
                    style={{ fontSize: '0.82rem' }}
                  >
                    <Link2 size={14} /> {mcpConnecting === mcpConnectForm.id ? 'Connecting...' : `Connect ${mcpConnectForm.name}`}
                  </button>
                  <button className="btn btn-ghost" onClick={() => setMcpConnectForm(null)} style={{ fontSize: '0.82rem' }}>
                    Back
                  </button>
                </div>
              </div>
            )}

            {/* Connector grid */}
            {!mcpConnectForm && mcpCatalog.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                {mcpCatalog.map(c => {
                  const alreadyConnected = mcpServers.some(s => s.server_type === c.id)
                  return (
                    <div key={c.id} style={{
                      padding: '12px 14px', borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border)', background: 'var(--bg-card)',
                      opacity: alreadyConnected ? 0.5 : 1,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: 6, background: 'var(--cane-200)', color: 'var(--cane-700)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.6rem', letterSpacing: '0.02em', flexShrink: 0,
                        }}>{c.icon}</div>
                        <div style={{ fontWeight: 600, fontSize: '0.84rem' }}>{c.name}</div>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.4 }}>
                        {c.description.length > 90 ? c.description.slice(0, 90) + '...' : c.description}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {(c.example_tools || []).slice(0, 2).map(t => (
                            <span key={t} style={{
                              fontSize: '0.62rem', padding: '1px 5px', borderRadius: 3,
                              background: 'var(--bg)', color: 'var(--text-muted)',
                            }}>{t}</span>
                          ))}
                        </div>
                        {alreadyConnected ? (
                          <span style={{ fontSize: '0.7rem', color: 'var(--success)', fontWeight: 600 }}>Connected</span>
                        ) : (
                          <button
                            className="btn btn-primary"
                            onClick={() => handleConnectCatalog(c)}
                            style={{ fontSize: '0.72rem', padding: '4px 10px' }}
                          >
                            Connect
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : !mcpConnectForm ? (
              <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                Loading connectors...
              </div>
            ) : null}
          </div>
        )}

        {/* Custom server form */}
        {showMcpCustom && (
          <div style={{
            padding: 16, borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--cane-200)', background: 'var(--cane-50)',
            marginBottom: 16,
          }}>
            <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 14 }}>Connect Custom MCP Server</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Server Name
                </label>
                <input
                  className="form-input"
                  value={mcpCustom.name}
                  onChange={e => setMcpCustom({ ...mcpCustom, name: e.target.value })}
                  placeholder="e.g. My CRM Server"
                  style={{ fontSize: '0.84rem' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Server URL
                </label>
                <input
                  className="form-input"
                  value={mcpCustom.server_url}
                  onChange={e => setMcpCustom({ ...mcpCustom, server_url: e.target.value })}
                  placeholder="https://mcp.example.com/sse"
                  style={{ fontSize: '0.84rem' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Auth Type
                </label>
                <select
                  className="form-input"
                  value={mcpCustom.auth_type}
                  onChange={e => setMcpCustom({ ...mcpCustom, auth_type: e.target.value })}
                >
                  <option value="none">None</option>
                  <option value="bearer">Bearer Token</option>
                  <option value="api_key">API Key</option>
                  <option value="header">Custom Header</option>
                </select>
              </div>
              {mcpCustom.auth_type !== 'none' && (
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {mcpCustom.auth_type === 'bearer' ? 'Bearer Token' : mcpCustom.auth_type === 'api_key' ? 'API Key' : 'Header Value'}
                  </label>
                  <input
                    className="form-input"
                    type="password"
                    value={mcpCustom.auth_value}
                    onChange={e => setMcpCustom({ ...mcpCustom, auth_value: e.target.value })}
                    placeholder="Enter token..."
                    style={{ fontSize: '0.84rem' }}
                  />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-primary"
                onClick={handleConnectCustom}
                disabled={mcpConnecting === 'custom'}
                style={{ fontSize: '0.82rem' }}
              >
                <Link2 size={14} /> {mcpConnecting === 'custom' ? 'Connecting...' : 'Connect Server'}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowMcpCustom(false)} style={{ fontSize: '0.82rem' }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Connected servers list */}
        {mcpServers.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {mcpServers.map(server => (
              <div key={server.id} style={{
                padding: '12px 16px', borderRadius: 'var(--radius-sm)',
                border: `1px solid ${server.status === 'connected' ? 'var(--cane-200)' : server.status === 'error' ? 'rgba(248,113,113,0.3)' : 'var(--border)'}`,
                background: server.is_enabled ? 'var(--bg-card)' : 'var(--bg)',
                opacity: server.is_enabled ? 1 : 0.6,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: 7, background: 'var(--cane-200)', color: 'var(--cane-700)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.02em', flexShrink: 0,
                    }}>{server.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{server.name}</span>
                        <span style={{
                          fontSize: '0.6rem', fontWeight: 700, padding: '1px 6px', borderRadius: 8,
                          background: server.status === 'connected' ? 'rgba(74,222,128,0.08)' : server.status === 'error' ? 'rgba(248,113,113,0.08)' : 'var(--cane-100)',
                          color: server.status === 'connected' ? '#4ade80' : server.status === 'error' ? '#f87171' : 'var(--cane-700)',
                        }}>
                          {server.status === 'connected' ? `${server.tool_count} tools` : server.status}
                        </span>
                      </div>
                      {server.status === 'error' && server.status_message && (
                        <div style={{ fontSize: '0.72rem', color: '#f87171', marginTop: 3 }}>
                          {server.status_message.length > 120 ? server.status_message.slice(0, 120) + '...' : server.status_message}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {server.total_calls > 0 && (
                      <span style={{
                        fontSize: '0.68rem', color: 'var(--text-muted)', padding: '2px 8px',
                        background: 'var(--bg)', borderRadius: 8,
                      }}>{server.total_calls} calls</span>
                    )}
                    <button
                      className="btn btn-ghost"
                      onClick={() => handleSyncMcp(server.id)}
                      disabled={mcpSyncing === server.id}
                      style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                      title="Re-discover tools"
                    >
                      <RefreshCw size={12} className={mcpSyncing === server.id ? 'spinning' : ''} /> Sync
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => handleToggleMcp(server)}
                      style={{ padding: '4px 8px' }}
                      title={server.is_enabled ? 'Disable' : 'Enable'}
                    >
                      {server.is_enabled ? <ToggleRight size={16} style={{ color: 'var(--cane-600)' }} /> : <ToggleLeft size={16} />}
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => setMcpExpanded(mcpExpanded === server.id ? null : server.id)}
                      style={{ padding: '4px 8px' }}
                      title="Show tools"
                    >
                      {mcpExpanded === server.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => handleDeleteMcp(server.id)}
                      style={{ padding: '4px 8px' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Expanded: show discovered tools */}
                {mcpExpanded === server.id && server.tools && server.tools.length > 0 && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Discovered Tools
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {server.tools.map((t, i) => (
                        <div key={i} style={{
                          padding: '6px 10px', borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border)', background: 'var(--bg)',
                          fontSize: '0.76rem', maxWidth: 300,
                        }}>
                          <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>{t.name}</div>
                          {t.description && (
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.3 }}>
                              {t.description.length > 80 ? t.description.slice(0, 80) + '...' : t.description}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ marginTop: 6, display: 'flex', gap: 8, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  <span style={{ padding: '1px 6px', background: 'var(--bg)', borderRadius: 4 }}>{server.server_type}</span>
                  {server.avg_latency_ms && (
                    <span style={{ padding: '1px 6px', background: 'var(--bg)', borderRadius: 4 }}>{Math.round(server.avg_latency_ms)}ms avg</span>
                  )}
                  <span style={{
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    maxWidth: 250, padding: '1px 6px', background: 'var(--bg)', borderRadius: 4,
                  }}>{server.server_url}</span>
                </div>
              </div>
            ))}
          </div>
        ) : !showMcpCatalog && !showMcpCustom ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)' }}>
            <Globe size={24} style={{ marginBottom: 8, opacity: 0.4 }} />
            <div style={{ fontSize: '0.84rem', fontWeight: 500 }}>No connections configured</div>
            <div style={{ fontSize: '0.78rem', marginTop: 4 }}>
              Connect MCP servers to let this agent interact with external services: calendars, CRMs, email, Slack, and more.
            </div>
          </div>
        ) : null}
      </div>
      )}

      {/* Sub-Agents (Orchestration) */}
      {tab === 'tools' && (
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap size={16} /> Sub-Agents
            {agentLinks.length > 0 && (
              <span style={{
                fontSize: '0.65rem', fontWeight: 700, background: 'var(--cane-100)',
                color: 'var(--cane-700)', padding: '2px 8px', borderRadius: 10,
              }}>{agentLinks.length}</span>
            )}
          </h3>
          <button className="btn btn-ghost" onClick={() => setShowAddLink(!showAddLink)} style={{ fontSize: '0.82rem' }}>
            {showAddLink ? <X size={14} /> : <Plus size={14} />} {showAddLink ? 'Cancel' : 'Link Agent'}
          </button>
        </div>

        {showAddLink && (
          <div style={{
            background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
            borderRadius: 10, padding: 16, marginBottom: 16,
          }}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Agent</label>
              <select
                value={newLink.child_agent_id}
                onChange={e => setNewLink(prev => ({ ...prev, child_agent_id: e.target.value }))}
                style={{
                  width: '100%', padding: '8px 12px', background: 'var(--bg-card)',
                  border: '1px solid var(--border)', borderRadius: 8, color: '#fff', fontSize: '0.85rem',
                }}
              >
                <option value="">Select an agent to link...</option>
                {linkableAgents.map(a => (
                  <option key={a.id} value={a.id}>{a.agent_icon || ''} {a.name}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Tool Name</label>
              <input
                type="text" placeholder="e.g. payroll_agent" maxLength={64}
                value={newLink.tool_name}
                onChange={e => setNewLink(prev => ({ ...prev, tool_name: e.target.value }))}
                style={{
                  width: '100%', padding: '8px 12px', background: 'var(--bg-card)',
                  border: '1px solid var(--border)', borderRadius: 8, color: '#fff', fontSize: '0.85rem',
                }}
              />
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                How Claude sees this agent in its tool list. Use snake_case.
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Description</label>
              <textarea
                placeholder="Describe when Claude should delegate to this agent..."
                value={newLink.tool_description}
                onChange={e => setNewLink(prev => ({ ...prev, tool_description: e.target.value }))}
                rows={2}
                style={{
                  width: '100%', padding: '8px 12px', background: 'var(--bg-card)',
                  border: '1px solid var(--border)', borderRadius: 8, color: '#fff', fontSize: '0.85rem',
                  resize: 'vertical',
                }}
              />
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                Claude reads this to decide when to delegate. Be specific about what this sub-agent handles.
              </div>
            </div>
            <button
              className="btn btn-primary" onClick={handleAddLink}
              disabled={!newLink.child_agent_id || !newLink.tool_name || !newLink.tool_description}
              style={{ fontSize: '0.82rem' }}
            >
              <Plus size={14} /> Link Sub-Agent
            </button>
          </div>
        )}

        {agentLinks.map(link => (
          <div key={link.id} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0',
            borderBottom: '1px solid var(--border)',
          }}>
            <AgentIcon icon={link.child_agent_icon} size={32} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>
                {link.child_agent_name}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: 4, fontSize: '0.72rem' }}>
                  {link.tool_name}
                </code>
                {' '}{link.tool_description.length > 80 ? link.tool_description.slice(0, 80) + '...' : link.tool_description}
              </div>
            </div>
            <button
              onClick={() => handleToggleLink(link)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: link.is_enabled ? 'var(--accent)' : 'var(--text-muted)' }}
              title={link.is_enabled ? 'Enabled' : 'Disabled'}
            >
              {link.is_enabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
            </button>
            <button
              onClick={() => handleDeleteLink(link.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        {agentLinks.length === 0 && !showAddLink && (
          <div style={{ textAlign: 'center', padding: '20px 16px', color: 'var(--text-muted)' }}>
            <Zap size={24} style={{ marginBottom: 8, opacity: 0.4 }} />
            <div style={{ fontSize: '0.84rem', fontWeight: 500 }}>No sub-agents linked</div>
            <div style={{ fontSize: '0.78rem', marginTop: 4 }}>
              Link other agents as tools so this agent can delegate questions to specialists.
            </div>
          </div>
        )}
      </div>
      )}

      {/* Scheduled Runs */}
      {tab === 'behavior' && (
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={16} /> Scheduled Runs
            {schedule?.is_enabled && (
              <span style={{ fontSize: '0.65rem', fontWeight: 700, background: 'rgba(74,222,128,0.12)', color: '#4ade80', padding: '2px 8px', borderRadius: 10 }}>Active</span>
            )}
          </h3>
          {!schedule && (
            <button className="btn btn-ghost" onClick={() => setShowAddSchedule(v => !v)} style={{ fontSize: '0.82rem' }}>
              <Plus size={14} style={{ marginRight: 4 }} /> Add Schedule
            </button>
          )}
        </div>

        {/* Add schedule form */}
        {showAddSchedule && !schedule && (
          <div style={{ marginBottom: 16, padding: 16, background: 'var(--cane-50)', borderRadius: 8, border: '1px solid var(--rule)' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
              Prompt (what the agent should do each run)
            </label>
            <textarea
              className="form-input"
              rows={3}
              value={newSchedule.prompt}
              onChange={e => setNewSchedule(p => ({ ...p, prompt: e.target.value }))}
              placeholder="e.g. Find the top 5 AI news stories from today and summarize them."
              style={{ marginBottom: 12, width: '100%' }}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Schedule Type
                </label>
                <select
                  className="form-input"
                  value={newSchedule.schedule_type}
                  onChange={e => setNewSchedule(p => ({ ...p, schedule_type: e.target.value }))}
                >
                  <option value="interval">Interval (every N minutes)</option>
                  <option value="daily">Daily (at a specific time)</option>
                </select>
              </div>
              <div>
                {newSchedule.schedule_type === 'interval' ? (
                  <>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                      Every (minutes, min 15)
                    </label>
                    <input
                      className="form-input"
                      type="number"
                      min={15}
                      value={newSchedule.interval_minutes}
                      onChange={e => setNewSchedule(p => ({ ...p, interval_minutes: parseInt(e.target.value) || 60 }))}
                    />
                  </>
                ) : (
                  <>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                      Time (UTC, HH:MM)
                    </label>
                    <input
                      className="form-input"
                      type="time"
                      value={newSchedule.daily_time}
                      onChange={e => setNewSchedule(p => ({ ...p, daily_time: e.target.value }))}
                    />
                  </>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-primary"
                disabled={!newSchedule.prompt.trim() || scheduleSaving}
                onClick={async () => {
                  setScheduleSaving(true)
                  try {
                    const res = await createSchedule(agentId, newSchedule)
                    setSchedule(res)
                    setShowAddSchedule(false)
                    setNewSchedule({ prompt: '', schedule_type: 'interval', interval_minutes: 60, daily_time: '09:00' })
                  } catch (e) { alert(e.message) }
                  setScheduleSaving(false)
                }}
              >
                {scheduleSaving ? 'Creating...' : 'Create Schedule'}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowAddSchedule(false)}>Cancel</button>
            </div>
          </div>
        )}

        {/* Schedule display */}
        {schedule && (
          <div>
            <div style={{ padding: 14, background: 'var(--cane-50)', borderRadius: 8, border: '1px solid var(--rule)', marginBottom: 12 }}>
              <div style={{ fontSize: '0.82rem', color: 'var(--text)', marginBottom: 8, lineHeight: 1.6 }}>
                {schedule.prompt.length > 120 ? schedule.prompt.slice(0, 120) + '...' : schedule.prompt}
              </div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {schedule.schedule_type === 'daily'
                    ? `Daily at ${schedule.daily_time || '09:00'} UTC`
                    : `Every ${schedule.interval_minutes} minutes`
                  }
                </span>
                {schedule.last_run_at && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%', display: 'inline-block',
                      background: schedule.last_run_status === 'success' ? '#4ade80' : schedule.last_run_status === 'error' ? '#f87171' : '#fbbf24',
                    }} />
                    Last: {new Date(schedule.last_run_at).toLocaleString()}
                  </span>
                )}
                {schedule.run_count > 0 && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {schedule.run_count} run{schedule.run_count !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Toggle */}
              <button
                className="btn btn-ghost"
                style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={async () => {
                  try {
                    const res = await updateSchedule(agentId, schedule.id, { is_enabled: !schedule.is_enabled })
                    setSchedule(res)
                  } catch (e) { alert(e.message) }
                }}
              >
                {schedule.is_enabled
                  ? <ToggleRight size={18} style={{ color: '#4ade80' }} />
                  : <ToggleLeft size={18} style={{ color: 'var(--text-muted)' }} />
                }
                {schedule.is_enabled ? 'Enabled' : 'Disabled'}
              </button>

              {/* Run Now */}
              <button
                className="btn btn-ghost"
                style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}
                disabled={scheduleTriggering || schedule.last_run_status === 'running'}
                onClick={async () => {
                  setScheduleTriggering(true)
                  try {
                    await triggerSchedule(agentId, schedule.id)
                    // Poll for completion
                    setTimeout(async () => {
                      try {
                        const schedRes = await getSchedules(agentId)
                        const s = (schedRes.schedules || [])[0] || null
                        setSchedule(s)
                        if (s) {
                          const runsRes = await getScheduleRuns(agentId, s.id)
                          setScheduleRuns(runsRes.runs || [])
                        }
                      } catch {}
                      setScheduleTriggering(false)
                    }, 5000)
                  } catch (e) {
                    alert(e.message)
                    setScheduleTriggering(false)
                  }
                }}
              >
                {scheduleTriggering ? <RefreshCw size={14} className="spin" /> : <Play size={14} />}
                {scheduleTriggering ? 'Running...' : 'Run Now'}
              </button>

              {/* View History */}
              <button
                className="btn btn-ghost"
                style={{ fontSize: '0.82rem' }}
                onClick={async () => {
                  if (!showScheduleRuns && schedule) {
                    try {
                      const runsRes = await getScheduleRuns(agentId, schedule.id)
                      setScheduleRuns(runsRes.runs || [])
                    } catch {}
                  }
                  setShowScheduleRuns(v => !v)
                }}
              >
                {showScheduleRuns ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {' '}History ({schedule.run_count || 0})
              </button>

              {/* Delete */}
              <button
                className="btn btn-ghost"
                style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}
                onClick={async () => {
                  if (!confirm('Delete this schedule and all run history?')) return
                  try {
                    await deleteSchedule(agentId, schedule.id)
                    setSchedule(null)
                    setScheduleRuns([])
                    setShowScheduleRuns(false)
                  } catch (e) { alert(e.message) }
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>

            {/* Run History */}
            {showScheduleRuns && (
              <div style={{ marginTop: 16 }}>
                {scheduleRuns.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                    No runs yet. Click "Run Now" to trigger the first execution.
                  </div>
                )}
                {scheduleRuns.map(run => (
                  <div
                    key={run.id}
                    style={{
                      padding: '10px 14px', borderBottom: '1px solid var(--rule)',
                      cursor: 'pointer',
                    }}
                    onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          width: 7, height: 7, borderRadius: '50%', display: 'inline-block',
                          background: run.status === 'success' ? '#4ade80' : run.status === 'error' ? '#f87171' : '#fbbf24',
                        }} />
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          {new Date(run.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {run.condition_met !== null && run.condition_met !== undefined && (
                          <span style={{
                            fontSize: '0.65rem', fontWeight: 600,
                            padding: '1px 6px', borderRadius: 4,
                            background: run.condition_met ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)',
                            color: run.condition_met ? '#4ade80' : '#f87171',
                          }}>
                            {run.condition_met ? 'Condition met' : 'Condition not met'}
                          </span>
                        )}
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          {run.duration_ms > 0 ? `${(run.duration_ms / 1000).toFixed(1)}s` : ''}
                        </span>
                      </div>
                    </div>

                    {expandedRun === run.id && (
                      <div style={{ marginTop: 10 }}>
                        {run.status === 'error' && run.error_message && (
                          <div style={{ fontSize: '0.78rem', color: '#f87171', marginBottom: 8, padding: '8px 10px', background: 'rgba(248,113,113,0.08)', borderRadius: 6 }}>
                            {run.error_message}
                          </div>
                        )}
                        {run.response && (
                          <pre style={{
                            fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6,
                            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                            background: 'var(--cane-50)', padding: 12, borderRadius: 6,
                            maxHeight: 300, overflow: 'auto', margin: 0,
                          }}>
                            {run.response}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Conditional Output */}
        {schedule && (
          <div style={{
            marginTop: 16, padding: 14,
            background: 'rgba(255,255,255,0.02)', borderRadius: 8,
            border: '1px solid var(--rule)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: schedule.condition_enabled ? 12 : 0 }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700 }}>Conditional Output</div>
              <button
                className="btn btn-ghost"
                style={{ padding: 4 }}
                onClick={async () => {
                  try {
                    await updateSchedule(agentId, schedule.id, {
                      condition_enabled: !schedule.condition_enabled,
                    })
                    setSchedule(prev => ({ ...prev, condition_enabled: !prev.condition_enabled }))
                  } catch (e) { alert(e.message) }
                }}
              >
                {schedule.condition_enabled
                  ? <ToggleRight size={22} style={{ color: '#4ade80' }} />
                  : <ToggleLeft size={22} style={{ color: 'var(--text-muted)' }} />
                }
              </button>
            </div>

            {schedule.condition_enabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    Condition (when should the output be sent?)
                  </label>
                  <textarea
                    value={schedule.condition_prompt || ''}
                    onChange={e => setSchedule(prev => ({ ...prev, condition_prompt: e.target.value }))}
                    placeholder="e.g. The output contains urgent or high-priority items"
                    rows={2}
                    style={{
                      width: '100%', padding: '8px 10px', fontSize: '0.8125rem',
                      background: 'var(--paper)', border: '1px solid var(--rule)',
                      borderRadius: 6, color: 'var(--text)', resize: 'vertical',
                      fontFamily: 'var(--font-body)', lineHeight: 1.5,
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    Action when condition is met
                  </label>
                  <select
                    value={schedule.condition_action || 'store_only'}
                    onChange={e => setSchedule(prev => ({ ...prev, condition_action: e.target.value }))}
                    style={{
                      width: '100%', padding: '8px 10px', fontSize: '0.8125rem',
                      background: 'var(--paper)', border: '1px solid var(--rule)',
                      borderRadius: 6, color: 'var(--text)',
                    }}
                  >
                    <option value="store_only">Store only (no notification)</option>
                    <option value="send_webhook">Send to webhook</option>
                  </select>
                </div>

                {(schedule.condition_action === 'send_webhook') && (
                  <div>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                      Webhook URL
                    </label>
                    <input
                      type="text"
                      value={schedule.condition_webhook_url || ''}
                      onChange={e => setSchedule(prev => ({ ...prev, condition_webhook_url: e.target.value }))}
                      placeholder="https://hooks.slack.com/services/..."
                      style={{
                        width: '100%', padding: '8px 10px', fontSize: '0.8125rem',
                        background: 'var(--paper)', border: '1px solid var(--rule)',
                        borderRadius: 6, color: 'var(--text)',
                      }}
                    />
                  </div>
                )}

                <button
                  className="btn btn-primary"
                  style={{ alignSelf: 'flex-start', fontSize: '0.78rem', padding: '6px 14px' }}
                  onClick={async () => {
                    try {
                      await updateSchedule(agentId, schedule.id, {
                        condition_enabled: schedule.condition_enabled,
                        condition_prompt: schedule.condition_prompt || '',
                        condition_action: schedule.condition_action || 'store_only',
                        condition_webhook_url: schedule.condition_webhook_url || '',
                      })
                    } catch (e) { alert(e.message) }
                  }}
                >
                  Save Condition
                </button>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!schedule && !showAddSchedule && (
          <div style={{ textAlign: 'center', padding: '20px 16px', color: 'var(--text-muted)' }}>
            <Clock size={24} style={{ marginBottom: 8, opacity: 0.4 }} />
            <div style={{ fontSize: '0.84rem', fontWeight: 500 }}>No schedule configured</div>
            <div style={{ fontSize: '0.78rem', marginTop: 4 }}>
              Set up a schedule to run this agent automatically. Great for daily briefings, automated reports, or periodic data pulls.
            </div>
          </div>
        )}
      </div>
      )}

      {/* Agent Memory */}
      {tab === 'behavior' && (
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Brain size={16} /> Agent Memory
            {memories.length > 0 && (
              <span style={{
                fontSize: '0.7rem', background: 'rgba(168,85,247,0.15)', color: '#a855f7',
                padding: '2px 8px', borderRadius: 10, fontWeight: 600,
              }}>{memories.length}</span>
            )}
          </h3>
          <div style={{ display: 'flex', gap: 8 }}>
            {memories.length > 0 && (
              <button
                className="btn btn-ghost"
                style={{ fontSize: '0.78rem', color: '#ef4444' }}
                disabled={memoryClearing}
                onClick={async () => {
                  if (!confirm('Clear all memories for this agent? This cannot be undone.')) return
                  setMemoryClearing(true)
                  try {
                    await clearMemories(agentId)
                    setMemories([])
                  } catch (e) { console.error(e) }
                  setMemoryClearing(false)
                }}
              >
                <Trash2 size={13} /> {memoryClearing ? 'Clearing...' : 'Clear All'}
              </button>
            )}
            <button className="btn btn-ghost" onClick={() => setShowAddMemory(!showAddMemory)} style={{ fontSize: '0.82rem' }}>
              <Plus size={14} /> Add Memory
            </button>
          </div>
        </div>

        {/* Add memory form */}
        {showAddMemory && (
          <div style={{
            marginBottom: 16, padding: '14px 16px', borderRadius: 'var(--radius-sm)',
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <select
                value={newMemory.memory_type}
                onChange={e => setNewMemory(p => ({ ...p, memory_type: e.target.value }))}
                style={{
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 'var(--radius-sm)', color: '#fff', padding: '6px 10px',
                  fontSize: '0.82rem',
                }}
              >
                <option value="fact">Fact</option>
                <option value="preference">Preference</option>
                <option value="instruction">Instruction</option>
                <option value="context">Context</option>
              </select>
            </div>
            <textarea
              value={newMemory.content}
              onChange={e => setNewMemory(p => ({ ...p, content: e.target.value }))}
              placeholder="What should this agent remember? e.g. 'User prefers bullet point responses' or 'Company uses React and Python'"
              rows={3}
              style={{
                width: '100%', resize: 'vertical', background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 'var(--radius-sm)',
                color: '#fff', padding: '8px 12px', fontSize: '0.84rem', marginBottom: 10,
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => { setShowAddMemory(false); setNewMemory({ content: '', memory_type: 'fact' }) }}>Cancel</button>
              <button
                className="btn"
                disabled={!newMemory.content.trim() || memorySaving}
                onClick={async () => {
                  setMemorySaving(true)
                  try {
                    const res = await addMemory(agentId, newMemory)
                    setMemories(prev => [{ ...res, source_query: 'manual entry', created_at: new Date().toISOString() }, ...prev])
                    setNewMemory({ content: '', memory_type: 'fact' })
                    setShowAddMemory(false)
                  } catch (e) { console.error(e) }
                  setMemorySaving(false)
                }}
              >
                {memorySaving ? 'Saving...' : 'Save Memory'}
              </button>
            </div>
          </div>
        )}

        {/* Memory list */}
        {memories.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {memories.map(m => {
              const typeColors = {
                fact: { bg: 'rgba(59,130,246,0.12)', color: '#60a5fa' },
                preference: { bg: 'rgba(168,85,247,0.12)', color: '#a855f7' },
                instruction: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b' },
                context: { bg: 'rgba(34,197,94,0.12)', color: '#22c55e' },
              }
              const tc = typeColors[m.memory_type] || typeColors.fact
              const isEditing = editingMemory === m.id

              return (
                <div key={m.id} style={{
                  padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  {isEditing ? (
                    <div>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                        <select
                          value={editMemoryType}
                          onChange={e => setEditMemoryType(e.target.value)}
                          style={{
                            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 'var(--radius-sm)', color: '#fff', padding: '4px 8px', fontSize: '0.78rem',
                          }}
                        >
                          <option value="fact">Fact</option>
                          <option value="preference">Preference</option>
                          <option value="instruction">Instruction</option>
                          <option value="context">Context</option>
                        </select>
                      </div>
                      <textarea
                        value={editMemoryContent}
                        onChange={e => setEditMemoryContent(e.target.value)}
                        rows={2}
                        style={{
                          width: '100%', resize: 'vertical', background: 'rgba(255,255,255,0.06)',
                          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 'var(--radius-sm)',
                          color: '#fff', padding: '6px 10px', fontSize: '0.82rem', marginBottom: 8,
                        }}
                      />
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost" style={{ fontSize: '0.78rem' }} onClick={() => setEditingMemory(null)}>Cancel</button>
                        <button
                          className="btn" style={{ fontSize: '0.78rem' }}
                          onClick={async () => {
                            try {
                              await updateMemory(agentId, m.id, { content: editMemoryContent, memory_type: editMemoryType })
                              setMemories(prev => prev.map(x => x.id === m.id ? { ...x, content: editMemoryContent, memory_type: editMemoryType } : x))
                              setEditingMemory(null)
                            } catch (e) { console.error(e) }
                          }}
                        >Save</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{
                            fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase',
                            padding: '2px 7px', borderRadius: 6, background: tc.bg, color: tc.color,
                            letterSpacing: '0.03em',
                          }}>{m.memory_type}</span>
                          {m.source_query && m.source_query !== 'manual entry' && (
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>auto-extracted</span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.84rem', color: '#fff', lineHeight: 1.45 }}>{m.content}</div>
                        {m.created_at && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
                            {new Date(m.created_at).toLocaleDateString()} {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: '4px 6px' }}
                          onClick={() => {
                            setEditingMemory(m.id)
                            setEditMemoryContent(m.content)
                            setEditMemoryType(m.memory_type)
                          }}
                          title="Edit"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: '4px 6px', color: '#ef4444' }}
                          onClick={async () => {
                            try {
                              await deleteMemory(agentId, m.id)
                              setMemories(prev => prev.filter(x => x.id !== m.id))
                            } catch (e) { console.error(e) }
                          }}
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Empty state */}
        {memories.length === 0 && !showAddMemory && (
          <div style={{ textAlign: 'center', padding: '20px 16px', color: 'var(--text-muted)' }}>
            <Brain size={24} style={{ marginBottom: 8, opacity: 0.4 }} />
            <div style={{ fontSize: '0.84rem', fontWeight: 500 }}>No memories yet</div>
            <div style={{ fontSize: '0.78rem', marginTop: 4 }}>
              This agent will automatically learn from conversations. You can also add memories manually to teach it facts, preferences, or instructions.
            </div>
          </div>
        )}
      </div>
      )}

      {/* API Keys */}
      {tab === 'deploy' && (
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Key size={16} /> API Keys
          </h3>
          <button className="btn btn-ghost" onClick={handleCreateKey} style={{ fontSize: '0.82rem' }}>
            <Plus size={14} /> Generate Key
          </button>
        </div>

        {/* Newly created key banner */}
        {showNewKey && (
          <div style={{
            marginBottom: 14, padding: '12px 16px', borderRadius: 'var(--radius-sm)',
            background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.3)',
          }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#4ade80', marginBottom: 6 }}>
              New API key created. Copy it now, it won't be shown again
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <code style={{
                flex: 1, fontSize: '0.78rem', padding: '6px 10px', background: 'var(--bg-card)',
                borderRadius: 4, border: '1px solid rgba(255,255,255,0.2)', fontFamily: 'monospace',
                wordBreak: 'break-all',
              }}>{showNewKey}</code>
              <button className="btn btn-ghost" onClick={() => {
                navigator.clipboard.writeText(showNewKey)
                setCopiedKey(true)
                setTimeout(() => setCopiedKey(false), 2000)
              }} style={{ padding: '6px 10px', flexShrink: 0 }}>
                {copiedKey ? <Check size={14} style={{ color: '#4ade80' }} /> : <Copy size={14} />}
              </button>
            </div>
            <button className="btn btn-ghost" onClick={() => setShowNewKey(null)} style={{ fontSize: '0.72rem', marginTop: 8 }}>Dismiss</button>
          </div>
        )}

        {agentKeys.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {agentKeys.map(k => (
              <div key={k.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)', background: 'var(--bg-card)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Key size={13} style={{ color: 'var(--text-muted)' }} />
                  <div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 600 }}>{k.name}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {k.key_prefix}••••••••
                      {k.requests_today > 0 && <span style={{ marginLeft: 8 }}>({k.requests_today} requests today)</span>}
                    </div>
                  </div>
                </div>
                <button className="btn btn-ghost" onClick={() => handleDeleteKey(k.id)} style={{ padding: '4px 8px' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)' }}>
            <Key size={20} style={{ marginBottom: 6, opacity: 0.4 }} />
            <div style={{ fontSize: '0.84rem', fontWeight: 500 }}>No API keys yet</div>
            <div style={{ fontSize: '0.78rem', marginTop: 4 }}>Generate a key to use the widget embed or API.</div>
          </div>
        )}
      </div>
      )}

      {/* Widget Customizer + Embed */}
      {tab === 'deploy' && agent.system_prompt && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Palette size={16} /> Widget &amp; Embed
            </h3>
            {widgetDirty && (
              <button className="btn btn-primary" onClick={handleSaveWidget} disabled={widgetSaving} style={{ fontSize: '0.8rem' }}>
                <Save size={13} /> {widgetSaving ? 'Saving...' : 'Save Config'}
              </button>
            )}
          </div>

          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16 }}>
            Customize how the chat widget looks on your site. Use an API key from the section above, then copy the snippet below.
          </div>

          {/* Config grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Brand Color</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="color" value={widgetConfig.color} onChange={e => handleWidgetChange('color', e.target.value)}
                  style={{ width: 36, height: 30, padding: 0, border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }} />
                <input type="text" value={widgetConfig.color} onChange={e => handleWidgetChange('color', e.target.value)}
                  className="input" style={{ flex: 1, fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Position</label>
              <select value={widgetConfig.position} onChange={e => handleWidgetChange('position', e.target.value)}
                className="input" style={{ fontSize: '0.8rem', width: '100%' }}>
                <option value="right">Bottom Right</option>
                <option value="left">Bottom Left</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Greeting</label>
              <input type="text" value={widgetConfig.greeting} onChange={e => handleWidgetChange('greeting', e.target.value)}
                className="input" style={{ width: '100%', fontSize: '0.8rem' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Subtitle</label>
              <input type="text" value={widgetConfig.subtitle} onChange={e => handleWidgetChange('subtitle', e.target.value)}
                className="input" style={{ width: '100%', fontSize: '0.8rem' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Placeholder</label>
              <input type="text" value={widgetConfig.placeholder} onChange={e => handleWidgetChange('placeholder', e.target.value)}
                className="input" style={{ width: '100%', fontSize: '0.8rem' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Border Radius</label>
              <input type="text" value={widgetConfig.border_radius} onChange={e => handleWidgetChange('border_radius', e.target.value)}
                className="input" style={{ width: '100%', fontSize: '0.8rem' }} placeholder="16" />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Logo URL</label>
              <input type="text" value={widgetConfig.logo_url} onChange={e => handleWidgetChange('logo_url', e.target.value)}
                className="input" style={{ width: '100%', fontSize: '0.8rem' }} placeholder="https://..." />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Auto-open (seconds)</label>
              <input type="text" value={widgetConfig.auto_open} onChange={e => handleWidgetChange('auto_open', e.target.value)}
                className="input" style={{ width: '100%', fontSize: '0.8rem' }} placeholder="0 = disabled" />
            </div>
          </div>

          {/* Live preview bubble */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Preview</div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '14px 18px', background: 'var(--bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%', background: widgetConfig.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', flexShrink: 0, boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
              }}>
                <MessageSquare size={20} />
              </div>
              <div style={{
                padding: '10px 16px', borderRadius: widgetConfig.border_radius + 'px',
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                maxWidth: 280, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              }}>
                <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 2 }}>{agent.name}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 6 }}>{widgetConfig.subtitle}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{widgetConfig.greeting}</div>
              </div>
            </div>
          </div>

          {/* Embed snippet */}
          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Embed Code</div>
          <div style={{
            position: 'relative',
            background: '#1e1e2e', borderRadius: 'var(--radius-sm)',
            padding: '16px 18px', fontSize: '0.78rem',
            fontFamily: "'SF Mono', Consolas, 'Liberation Mono', monospace",
            color: '#cdd6f4', lineHeight: 1.6, overflow: 'auto',
          }}>
            <button
              onClick={() => {
                const code = `<script\n  src="${window.location.origin}/widget.js"\n  data-api-key="YOUR_API_KEY"\n  data-agent-name="${agent.name}"\n  data-workspace-id="${agentId}"\n  data-color="${widgetConfig.color}"\n  data-greeting="${widgetConfig.greeting}"\n  data-position="${widgetConfig.position}"\n  data-subtitle="${widgetConfig.subtitle}"\n  data-placeholder="${widgetConfig.placeholder}"\n  data-border-radius="${widgetConfig.border_radius}"\n${widgetConfig.logo_url ? `  data-logo-url="${widgetConfig.logo_url}"\n` : ''}${widgetConfig.auto_open !== '0' ? `  data-auto-open="${widgetConfig.auto_open}"\n` : ''}></script>`
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
            {'  '}<span style={{ color: '#a6e3a1' }}>data-color</span>=<span style={{ color: '#f9e2af' }}>"{widgetConfig.color}"</span><br />
            {'  '}<span style={{ color: '#a6e3a1' }}>data-greeting</span>=<span style={{ color: '#f9e2af' }}>"{widgetConfig.greeting}"</span><br />
            {'  '}<span style={{ color: '#a6e3a1' }}>data-position</span>=<span style={{ color: '#f9e2af' }}>"{widgetConfig.position}"</span><br />
            {'  '}<span style={{ color: '#a6e3a1' }}>data-subtitle</span>=<span style={{ color: '#f9e2af' }}>"{widgetConfig.subtitle}"</span><br />
            {'  '}<span style={{ color: '#a6e3a1' }}>data-placeholder</span>=<span style={{ color: '#f9e2af' }}>"{widgetConfig.placeholder}"</span><br />
            {'  '}<span style={{ color: '#a6e3a1' }}>data-border-radius</span>=<span style={{ color: '#f9e2af' }}>"{widgetConfig.border_radius}"</span><br />
            {widgetConfig.logo_url && <>{'  '}<span style={{ color: '#a6e3a1' }}>data-logo-url</span>=<span style={{ color: '#f9e2af' }}>"{widgetConfig.logo_url}"</span><br /></>}
            {widgetConfig.auto_open !== '0' && <>{'  '}<span style={{ color: '#a6e3a1' }}>data-auto-open</span>=<span style={{ color: '#f9e2af' }}>"{widgetConfig.auto_open}"</span><br /></>}
            <span style={{ color: '#89b4fa' }}>&gt;&lt;/script&gt;</span>
          </div>
        </div>
      )}

      {/* Publish to Marketplace */}
      {tab === 'deploy' && agent.system_prompt && (
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
                    fontFamily: 'var(--font-body)', background: 'var(--bg-card)',
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
                      cursor: 'pointer', background: pubPackType === p.id ? 'var(--paper)' : 'var(--bg-card)',
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

              {/* Evaluation (optional) */}
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
                      fontFamily: 'var(--font-body)', background: 'var(--bg-card)',
                      color: 'var(--text)', outline: 'none',
                    }}
                  >
                    <option value="">None (publish without eval scores)</option>
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
                    No evaluations found for this agent. You can still publish, but the listing won't have a performance card or re-verify capability.
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
                      fontFamily: 'var(--font-body)', background: 'var(--bg-card)',
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