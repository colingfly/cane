import { useState, useEffect, useMemo } from 'react'
import { Loader2, AlertTriangle, Download } from 'lucide-react'
import Plot from 'react-plotly.js'
import { getRunProfile } from '../api/eval'

const TRAIT_COLORS = {
  overconfidence: '#ef4444',
  calibration: '#22c55e',
  verbosity: '#eab308',
  hedging: '#f97316',
  groundedness: '#6366f1',
  completeness: '#14b8a6',
}

const STATUS_COLORS = { pass: '#22c55e', warn: '#eab308', fail: '#ef4444' }

function TraitBar({ name, score, isRisk, isDominant }) {
  const color = TRAIT_COLORS[name] || '#6366f1'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
      <div style={{ width: 130, textAlign: 'right', fontSize: 13, color: '#aaa' }}>
        {name}
        {isRisk && <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: '#3d1111', color: '#ff6b6b' }}>RISK</span>}
        {isDominant && !isRisk && <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: '#1a1a2e', color: '#748ffc' }}>TOP</span>}
      </div>
      <div style={{ flex: 1, height: 8, background: '#222', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.5s' }} />
      </div>
      <div style={{ width: 36, fontSize: 13, fontWeight: 600, color }}>{score}</div>
    </div>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || '#fff' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{label}</div>
    </div>
  )
}

export default function PersonalityProfile({ envId, runs }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selectedRunId, setSelectedRunId] = useState(null)

  const completedRuns = useMemo(
    () => (runs || []).filter(r => r.status === 'completed').sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [runs]
  )

  useEffect(() => {
    if (completedRuns.length > 0 && !selectedRunId) {
      setSelectedRunId(completedRuns[0].id)
    }
  }, [completedRuns, selectedRunId])

  const loadProfile = async () => {
    if (!selectedRunId) return
    setLoading(true)
    setError(null)
    try {
      const data = await getRunProfile(envId, selectedRunId)
      setProfile(data)
    } catch (err) {
      setError(err.message || 'Failed to generate profile')
    } finally {
      setLoading(false)
    }
  }

  // Scatter plot data
  const scatterTraces = useMemo(() => {
    if (!profile?.results) return []
    return ['pass', 'warn', 'fail'].map(status => {
      const filtered = profile.results.filter(r => r.status === status)
      return {
        x: filtered.map(r => r.x),
        y: filtered.map(r => r.y),
        mode: 'markers',
        type: 'scatter',
        name: status,
        marker: {
          color: STATUS_COLORS[status],
          size: filtered.map(r => 6 + (r.score / 20)),
          opacity: 0.7,
        },
        text: filtered.map(r =>
          `Score: ${r.score}<br>Q: ${(r.question || '').substring(0, 60)}...<br>Cluster: ${r.cluster_id}<br>Overconfidence: ${r.traits?.overconfidence || 'N/A'}`
        ),
        hoverinfo: 'text',
      }
    })
  }, [profile])

  // Radar chart data
  const radarData = useMemo(() => {
    if (!profile?.personality?.trait_scores) return null
    const traits = Object.keys(profile.personality.trait_scores)
    const values = traits.map(t => profile.personality.trait_scores[t])
    return {
      type: 'scatterpolar',
      r: [...values, values[0]],
      theta: [...traits, traits[0]],
      fill: 'toself',
      fillcolor: 'rgba(116, 143, 252, 0.2)',
      line: { color: '#748ffc' },
      marker: { color: '#748ffc', size: 6 },
    }
  }, [profile])

  if (completedRuns.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>
        <AlertTriangle size={24} style={{ marginBottom: 8 }} />
        <div>No completed runs. Run an evaluation first to generate a personality profile.</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Run selector + generate button */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <select
          value={selectedRunId || ''}
          onChange={e => { setSelectedRunId(e.target.value); setProfile(null) }}
          style={{ padding: '8px 12px', background: '#141414', border: '1px solid #333', borderRadius: 8, color: '#fff', fontSize: 13 }}
        >
          {completedRuns.map(r => (
            <option key={r.id} value={r.id}>
              Run {r.id.slice(0, 8)} | Score: {r.overall_score?.toFixed(1)} | {new Date(r.created_at).toLocaleDateString()}
            </option>
          ))}
        </select>
        <button
          className="btn btn-primary btn-sm"
          onClick={loadProfile}
          disabled={loading || !selectedRunId}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : null}
          {loading ? 'Profiling...' : 'Generate Profile'}
        </button>
        {profile && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `personality-${selectedRunId?.slice(0, 8)}.json`
              a.click()
              URL.revokeObjectURL(url)
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <Download size={14} /> Export JSON
          </button>
        )}
      </div>

      {error && (
        <div style={{ padding: 16, background: '#2d1111', border: '1px solid #5c2020', borderRadius: 8, color: '#ff6b6b', fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{ padding: 60, textAlign: 'center', color: '#888' }}>
          <Loader2 size={24} className="animate-spin" style={{ marginBottom: 12 }} />
          <div>Embedding responses and computing personality profile...</div>
          <div style={{ fontSize: 12, marginTop: 4, color: '#666' }}>This may take a moment on first run</div>
        </div>
      )}

      {profile && !loading && (
        <>
          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            <StatCard label="Responses" value={profile.total_results} />
            <StatCard label="Clusters" value={Object.keys(profile.clusters || {}).length} />
            <StatCard label="Steering Vectors" value={profile.steering_vectors?.length || 0} />
            <StatCard label="Contrastive Pairs" value={profile.contrastive_pairs?.length || 0} />
          </div>

          {/* Scatter plot */}
          <div style={{ background: '#141414', border: '1px solid #222', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: '#fff' }}>Embedding Space</div>
            <Plot
              data={scatterTraces}
              layout={{
                paper_bgcolor: '#141414',
                plot_bgcolor: '#141414',
                font: { color: '#e0e0e0' },
                xaxis: { showgrid: false, zeroline: false, title: 'Dimension 1' },
                yaxis: { showgrid: false, zeroline: false, title: 'Dimension 2' },
                legend: { x: 0, y: 1 },
                margin: { l: 40, r: 20, t: 10, b: 40 },
                height: 450,
              }}
              config={{ responsive: true, displayModeBar: false }}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Radar chart */}
            <div style={{ background: '#141414', border: '1px solid #222', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: '#fff' }}>Personality Radar</div>
              {radarData && (
                <Plot
                  data={[radarData]}
                  layout={{
                    polar: {
                      bgcolor: '#141414',
                      radialaxis: { visible: true, range: [0, 100], color: '#444', gridcolor: '#222' },
                      angularaxis: { color: '#aaa', gridcolor: '#222' },
                    },
                    paper_bgcolor: '#141414',
                    font: { color: '#e0e0e0', size: 12 },
                    margin: { l: 60, r: 60, t: 20, b: 20 },
                    showlegend: false,
                    height: 350,
                  }}
                  config={{ responsive: true, displayModeBar: false }}
                  style={{ width: '100%' }}
                />
              )}
            </div>

            {/* Trait bars */}
            <div style={{ background: '#141414', border: '1px solid #222', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: '#fff' }}>Trait Scores</div>
              {profile.personality?.trait_scores && Object.entries(profile.personality.trait_scores).map(([trait, score]) => (
                <TraitBar
                  key={trait}
                  name={trait}
                  score={score}
                  isRisk={(profile.personality.risk_traits || []).includes(trait)}
                  isDominant={(profile.personality.dominant_traits || []).slice(0, 2).includes(trait)}
                />
              ))}
            </div>

            {/* Steering vectors */}
            <div style={{ background: '#141414', border: '1px solid #222', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: '#fff' }}>Steering Vectors</div>
              {(profile.steering_vectors || []).length === 0 ? (
                <div style={{ color: '#888', fontSize: 13 }}>Not enough contrastive data to compute steering vectors.</div>
              ) : (
                profile.steering_vectors.map((sv, i) => (
                  <div key={i} style={{ padding: 12, background: '#1a1a1a', borderRadius: 8, marginBottom: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#fff' }}>{sv.name}</div>
                    <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{sv.description}</div>
                    <div style={{ fontSize: 13, color: '#aaa', marginTop: 4 }}>
                      Magnitude: <span style={{ color: sv.magnitude > 0.5 ? '#22c55e' : sv.magnitude > 0.2 ? '#eab308' : '#888', fontWeight: 600 }}>{sv.magnitude.toFixed(3)}</span>
                      {' | '}{sv.negative_label} ({sv.n_negative}) {'<->'} {sv.positive_label} ({sv.n_positive})
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Cluster labels */}
            <div style={{ background: '#141414', border: '1px solid #222', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: '#fff' }}>Behavioral Clusters</div>
              {Object.entries(profile.clusters || {}).map(([id, label]) => (
                <div key={id} style={{ padding: 12, background: '#1a1a1a', borderRadius: 8, marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#6366f1' }}>Cluster {id}</div>
                  <div style={{ fontSize: 13, color: '#aaa', marginTop: 4 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Contrastive pairs */}
          {(profile.contrastive_pairs || []).length > 0 && (
            <div style={{ background: '#141414', border: '1px solid #222', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: '#fff' }}>
                Contrastive Pairs ({profile.contrastive_pairs.length})
              </div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>
                Confidently right vs. confidently wrong responses. These define the overconfidence steering vector.
              </div>
              {profile.contrastive_pairs.slice(0, 5).map((cp, i) => (
                <div key={i} style={{ padding: 12, background: '#1a1a1a', borderRadius: 8, marginBottom: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 600, marginBottom: 4 }}>CONFIDENT RIGHT (score: {cp.right_score})</div>
                    <div style={{ fontSize: 12, color: '#ccc', lineHeight: 1.4 }}>{(cp.confident_right || '').substring(0, 200)}...</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#ef4444', fontWeight: 600, marginBottom: 4 }}>CONFIDENT WRONG (score: {cp.wrong_score})</div>
                    <div style={{ fontSize: 12, color: '#ccc', lineHeight: 1.4 }}>{(cp.confident_wrong || '').substring(0, 200)}...</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
