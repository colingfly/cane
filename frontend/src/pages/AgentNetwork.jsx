import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { getAgentNetwork } from '../api/client'

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

// Simple force-directed layout (no external libs)
function computeLayout(nodes, edges, width, height) {
  if (nodes.length === 0) return []
  if (nodes.length === 1) return [{ ...nodes[0], x: width / 2, y: height / 2 }]

  const positioned = nodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / nodes.length
    const rx = Math.min(width, height) * 0.3
    return {
      ...n,
      x: width / 2 + rx * Math.cos(angle),
      y: height / 2 + rx * Math.sin(angle),
      vx: 0, vy: 0,
    }
  })

  const idxMap = {}
  positioned.forEach((n, i) => { idxMap[n.id] = i })

  for (let iter = 0; iter < 120; iter++) {
    const damping = 0.85
    // Repulsion between all pairs
    for (let i = 0; i < positioned.length; i++) {
      for (let j = i + 1; j < positioned.length; j++) {
        let dx = positioned[j].x - positioned[i].x
        let dy = positioned[j].y - positioned[i].y
        let dist = Math.sqrt(dx * dx + dy * dy) || 1
        const force = 8000 / (dist * dist)
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        positioned[i].vx -= fx
        positioned[i].vy -= fy
        positioned[j].vx += fx
        positioned[j].vy += fy
      }
    }
    // Attraction along edges
    for (const e of edges) {
      const si = idxMap[e.source]
      const ti = idxMap[e.target]
      if (si == null || ti == null) continue
      let dx = positioned[ti].x - positioned[si].x
      let dy = positioned[ti].y - positioned[si].y
      let dist = Math.sqrt(dx * dx + dy * dy) || 1
      const force = (dist - 150) * 0.02
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      positioned[si].vx += fx
      positioned[si].vy += fy
      positioned[ti].vx -= fx
      positioned[ti].vy -= fy
    }
    // Center gravity
    for (const n of positioned) {
      n.vx += (width / 2 - n.x) * 0.002
      n.vy += (height / 2 - n.y) * 0.002
    }
    // Apply velocity with damping
    for (const n of positioned) {
      n.vx *= damping
      n.vy *= damping
      n.x += n.vx
      n.y += n.vy
      // Clamp to bounds
      n.x = Math.max(50, Math.min(width - 50, n.x))
      n.y = Math.max(50, Math.min(height - 50, n.y))
    }
  }

  return positioned
}

export default function AgentNetwork() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null) // node or edge
  const [selType, setSelType] = useState(null) // 'node' | 'edge'
  const [hoveredNode, setHoveredNode] = useState(null)
  const svgRef = useRef(null)
  const [dims, setDims] = useState({ w: 700, h: 500 })

  useEffect(() => {
    loadNetwork()
  }, [])

  useEffect(() => {
    function handleResize() {
      const el = svgRef.current?.parentElement
      if (el) {
        setDims({ w: el.clientWidth, h: Math.max(400, window.innerHeight - 180) })
      }
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const loadNetwork = async () => {
    setLoading(true)
    try {
      const res = await getAgentNetwork()
      setData(res)
    } catch (e) {
      console.error('Failed to load network:', e)
    } finally {
      setLoading(false)
    }
  }

  const nodes = data?.nodes || []
  const edges = data?.edges || []
  const stats = data?.stats || {}

  const positioned = computeLayout(nodes, edges, dims.w * 0.68, dims.h)
  const posMap = {}
  positioned.forEach(n => { posMap[n.id] = n })

  const selectNode = (node) => {
    setSelected(node)
    setSelType('node')
  }

  const selectEdge = (edge) => {
    setSelected(edge)
    setSelType('edge')
  }

  // Node size based on communication count
  const getNodeRadius = (nodeId) => {
    let total = 0
    edges.forEach(e => {
      if (e.source === nodeId || e.target === nodeId) total += (e.comm_count || 0)
    })
    return Math.max(24, Math.min(40, 24 + total * 0.5))
  }

  // Edge width based on communication count
  const getEdgeWidth = (edge) => Math.max(1, Math.min(5, 1 + (edge.comm_count || 0) * 0.3))

  if (loading) {
    return (
      <div className="fade-in" style={{ padding: 40, textAlign: 'center' }}>
        <div className="spinner" />
      </div>
    )
  }

  if (nodes.length === 0) {
    return (
      <div className="fade-in" style={{ maxWidth: 600, margin: '0 auto', padding: '60px 24px', textAlign: 'center' }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16, opacity: 0.4 }}>
          <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
        </svg>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 8 }}>No agents yet</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: 20 }}>
          Create agents and link them together to see your agent network.
        </p>
        <Link to="/" className="btn" style={{ fontSize: '0.8125rem' }}>Create an Agent</Link>
      </div>
    )
  }

  return (
    <div className="fade-in" style={{ display: 'flex', height: 'calc(100vh - 60px)', overflow: 'hidden' }}>
      {/* SVG Graph */}
      <div style={{ flex: '1 1 68%', position: 'relative', minWidth: 0 }}>
        <div style={{
          position: 'absolute', top: 16, left: 24, zIndex: 2,
          fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-display)',
        }}>
          Agent Network
        </div>
        <div style={{
          position: 'absolute', top: 44, left: 24, zIndex: 2,
          fontSize: '0.75rem', color: 'var(--text-muted)',
        }}>
          {nodes.length} agent{nodes.length !== 1 ? 's' : ''} · {edges.length} connection{edges.length !== 1 ? 's' : ''}
        </div>

        <svg
          ref={svgRef}
          width={dims.w * 0.68}
          height={dims.h}
          style={{ display: 'block' }}
          onClick={() => { setSelected(null); setSelType(null) }}
        >
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="rgba(255,255,255,0.25)" />
            </marker>
          </defs>

          {/* Edges */}
          {edges.map(edge => {
            const s = posMap[edge.source]
            const t = posMap[edge.target]
            if (!s || !t) return null
            const sr = getNodeRadius(edge.source)
            const tr = getNodeRadius(edge.target)
            // Shorten line to not overlap nodes
            const dx = t.x - s.x
            const dy = t.y - s.y
            const dist = Math.sqrt(dx * dx + dy * dy) || 1
            const sx = s.x + (dx / dist) * sr
            const sy = s.y + (dy / dist) * sr
            const tx = t.x - (dx / dist) * (tr + 8)
            const ty = t.y - (dy / dist) * (tr + 8)
            const isSelected = selType === 'edge' && selected?.id === edge.id
            return (
              <line
                key={edge.id}
                x1={sx} y1={sy} x2={tx} y2={ty}
                stroke={isSelected ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)'}
                strokeWidth={getEdgeWidth(edge)}
                markerEnd="url(#arrowhead)"
                style={{ cursor: 'pointer' }}
                onClick={e => { e.stopPropagation(); selectEdge(edge) }}
              />
            )
          })}

          {/* Nodes */}
          {positioned.map(node => {
            const r = getNodeRadius(node.id)
            const isSelected = selType === 'node' && selected?.id === node.id
            const isHovered = hoveredNode === node.id
            const isOrch = node.orchestrator_mode
            return (
              <g
                key={node.id}
                style={{ cursor: 'pointer' }}
                onClick={e => { e.stopPropagation(); selectNode(node) }}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                {/* Glow ring for orchestrators */}
                {isOrch && (
                  <circle
                    cx={node.x} cy={node.y} r={r + 6}
                    fill="none"
                    stroke="rgba(255,255,255,0.12)"
                    strokeWidth="2"
                    strokeDasharray="4 3"
                  />
                )}
                {/* Main circle */}
                <circle
                  cx={node.x} cy={node.y} r={r}
                  fill={isSelected ? 'rgba(255,255,255,0.12)' : isHovered ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'}
                  stroke={isSelected ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.12)'}
                  strokeWidth={isSelected ? 2 : 1}
                />
                {/* Icon text */}
                <text
                  x={node.x} y={node.y}
                  textAnchor="middle" dominantBaseline="central"
                  fill="rgba(255,255,255,0.7)"
                  fontSize="11" fontWeight="700"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {node.icon || node.name?.slice(0, 2).toUpperCase() || '??'}
                </text>
                {/* Name label */}
                <text
                  x={node.x} y={node.y + r + 14}
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.5)"
                  fontSize="10"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {node.name?.length > 16 ? node.name.slice(0, 14) + '..' : node.name}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      {/* Sidebar */}
      <div style={{
        flex: '0 0 32%', borderLeft: '1px solid var(--rule)',
        padding: '20px 20px', overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        {/* Stats */}
        <div>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 10 }}>
            Network Stats
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="card" style={{ padding: '12px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.total_communications || 0}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Communications</div>
            </div>
            <div className="card" style={{ padding: '12px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.avg_response_ms || 0}<span style={{ fontSize: '0.7rem', fontWeight: 400 }}>ms</span></div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Avg Response</div>
            </div>
          </div>
        </div>

        {/* Selected detail */}
        {selType === 'node' && selected && (
          <div>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 10 }}>
              Agent Details
            </div>
            <div className="card" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.75rem', fontWeight: 700,
                }}>
                  {selected.icon || selected.name?.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{selected.name}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {selected.agent_type}
                    {selected.orchestrator_mode && (
                      <span className="badge" style={{ marginLeft: 6, fontSize: '0.55rem' }}>Orchestrator</span>
                    )}
                  </div>
                </div>
              </div>
              {selected.description && (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 10 }}>
                  {selected.description}
                </div>
              )}
              {/* Connections for this node */}
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                Connections:
              </div>
              {edges.filter(e => e.source === selected.id || e.target === selected.id).map(e => {
                const otherId = e.source === selected.id ? e.target : e.source
                const other = nodes.find(n => n.id === otherId)
                const direction = e.source === selected.id ? 'calls' : 'called by'
                return (
                  <div key={e.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    fontSize: '0.75rem', padding: '4px 0', borderBottom: '1px solid var(--rule)',
                  }}>
                    <span>{direction} <strong>{other?.name || 'Unknown'}</strong></span>
                    <span style={{ color: 'var(--text-muted)' }}>{e.comm_count || 0} calls</span>
                  </div>
                )
              })}
              <Link
                to={`/agents/${selected.id}`}
                style={{ display: 'block', marginTop: 12, fontSize: '0.78rem', color: 'var(--text-muted)', textDecoration: 'none' }}
              >
                View agent details →
              </Link>
            </div>
          </div>
        )}

        {selType === 'edge' && selected && (
          <div>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 10 }}>
              Connection Details
            </div>
            <div className="card" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: '0.85rem' }}>
                <strong>{nodes.find(n => n.id === selected.source)?.name || 'Unknown'}</strong>
                <span style={{ color: 'var(--text-muted)' }}>→</span>
                <strong>{nodes.find(n => n.id === selected.target)?.name || 'Unknown'}</strong>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.78rem' }}>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>Tool Name</div>
                  <div>{selected.tool_name}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>Communications</div>
                  <div>{selected.comm_count || 0}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>Avg Duration</div>
                  <div>{selected.avg_duration_ms || 0}ms</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {!selected && (
          <div>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 10 }}>
              All Agents
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {nodes.map(node => {
                const conns = edges.filter(e => e.source === node.id || e.target === node.id)
                const totalComms = conns.reduce((sum, e) => sum + (e.comm_count || 0), 0)
                return (
                  <div
                    key={node.id}
                    className="card"
                    style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                    onClick={() => selectNode(node)}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: 6,
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.65rem', fontWeight: 700, flexShrink: 0,
                    }}>
                      {node.icon || node.name?.slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {node.name}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                        {conns.length} connection{conns.length !== 1 ? 's' : ''} · {totalComms} call{totalComms !== 1 ? 's' : ''}
                        {node.orchestrator_mode && (
                          <span className="badge" style={{ marginLeft: 6, fontSize: '0.5rem' }}>Orchestrator</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
