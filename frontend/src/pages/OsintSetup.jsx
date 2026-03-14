import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deployOsintAgent } from '../api/client'
import { Shield, ChevronRight, ChevronLeft, Check, Newspaper, MessageSquare, Bug, AlertTriangle, Rss, Bell, Clock, Rocket } from 'lucide-react'

const STEPS = ['Sources', 'Focus', 'Alerts', 'Schedule', 'Deploy']

const SOURCE_OPTIONS = [
  { id: 'news', label: 'News', desc: 'NewsAPI -- breaking news and articles', icon: Newspaper, needsKey: 'NEWSAPI_KEY' },
  { id: 'reddit', label: 'Reddit', desc: 'Security subreddits (no API key needed)', icon: MessageSquare, needsKey: null },
  { id: 'cve', label: 'CVE / NVD', desc: 'National Vulnerability Database', icon: Bug, needsKey: null },
  { id: 'threatfeed', label: 'Threat Feeds', desc: 'abuse.ch, AlienVault OTX', icon: AlertTriangle, needsKey: 'OTX_API_KEY (optional)' },
  { id: 'rss', label: 'RSS Feeds', desc: 'Any custom RSS/Atom feed', icon: Rss, needsKey: null },
]

const INTERVALS = [
  { value: 15, label: 'Every 15 min' },
  { value: 30, label: 'Every 30 min' },
  { value: 60, label: 'Every hour' },
  { value: 240, label: 'Every 4 hours' },
  { value: 1440, label: 'Daily' },
]

export default function OsintSetup() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [deploying, setDeploying] = useState(false)
  const [error, setError] = useState('')

  // Config state
  const [sources, setSources] = useState(['news', 'reddit', 'cve', 'threatfeed'])
  const [keywords, setKeywords] = useState('cybersecurity, data breach, ransomware')
  const [subreddits, setSubreddits] = useState('cybersecurity, netsec')
  const [rssUrls, setRssUrls] = useState('')
  const [alertWebhook, setAlertWebhook] = useState('')
  const [alertSeverity, setAlertSeverity] = useState('high')
  const [interval, setInterval] = useState(30)
  const [agentName, setAgentName] = useState('OSINT Intelligence Agent')

  const toggleSource = (id) => {
    setSources(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id])
  }

  const handleDeploy = async () => {
    setDeploying(true)
    setError('')
    try {
      const result = await deployOsintAgent({
        name: agentName,
        sources,
        keywords: keywords.split(',').map(k => k.trim()).filter(Boolean),
        subreddits: subreddits.split(',').map(s => s.trim()).filter(Boolean),
        rss_urls: rssUrls.split('\n').map(u => u.trim()).filter(Boolean),
        alert_webhook: alertWebhook,
        alert_severity: alertSeverity,
        interval_minutes: interval,
      })
      navigate(`/agents/${result.agent_id}/osint`)
    } catch (e) {
      setError(e.message || 'Deploy failed')
    }
    setDeploying(false)
  }

  const canNext = () => {
    if (step === 0) return sources.length > 0
    return true
  }

  const renderStep = () => {
    switch (step) {
      case 0: // Sources
        return (
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 4 }}>Choose OSINT Sources</h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 20 }}>
              Select which intelligence sources your agent should monitor.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {SOURCE_OPTIONS.map(src => {
                const active = sources.includes(src.id)
                const Icon = src.icon
                return (
                  <div
                    key={src.id}
                    onClick={() => toggleSource(src.id)}
                    style={{
                      padding: '14px 16px',
                      borderRadius: 10,
                      border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                      background: active ? 'rgba(99,102,241,0.06)' : 'var(--bg-secondary)',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 12,
                    }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: 8,
                      background: active ? 'var(--accent)' : 'var(--bg)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon size={18} style={{ color: active ? '#fff' : 'var(--text-muted)' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{src.label}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{src.desc}</div>
                    </div>
                    <div style={{
                      width: 20, height: 20, borderRadius: 4,
                      border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                      background: active ? 'var(--accent)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {active && <Check size={14} style={{ color: '#fff' }} />}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )

      case 1: // Focus
        return (
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 4 }}>Monitoring Focus</h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 20 }}>
              Define what your agent should watch for.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: '0.8125rem', fontWeight: 500, display: 'block', marginBottom: 6 }}>Agent Name</label>
                <input
                  value={agentName}
                  onChange={e => setAgentName(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--bg)',
                    color: 'var(--text)', fontSize: '0.8125rem',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.8125rem', fontWeight: 500, display: 'block', marginBottom: 6 }}>Keywords (comma-separated)</label>
                <input
                  value={keywords}
                  onChange={e => setKeywords(e.target.value)}
                  placeholder="cybersecurity, data breach, ransomware"
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--bg)',
                    color: 'var(--text)', fontSize: '0.8125rem',
                  }}
                />
                <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  Topics to search across news, CVE, and social sources
                </div>
              </div>
              {sources.includes('reddit') && (
                <div>
                  <label style={{ fontSize: '0.8125rem', fontWeight: 500, display: 'block', marginBottom: 6 }}>Subreddits (comma-separated)</label>
                  <input
                    value={subreddits}
                    onChange={e => setSubreddits(e.target.value)}
                    placeholder="cybersecurity, netsec, blueteamsec"
                    style={{
                      width: '100%', padding: '10px 12px', borderRadius: 8,
                      border: '1px solid var(--border)', background: 'var(--bg)',
                      color: 'var(--text)', fontSize: '0.8125rem',
                    }}
                  />
                </div>
              )}
              {sources.includes('rss') && (
                <div>
                  <label style={{ fontSize: '0.8125rem', fontWeight: 500, display: 'block', marginBottom: 6 }}>RSS Feed URLs (one per line)</label>
                  <textarea
                    value={rssUrls}
                    onChange={e => setRssUrls(e.target.value)}
                    placeholder="https://feeds.feedburner.com/TheHackersNews"
                    rows={3}
                    style={{
                      width: '100%', padding: '10px 12px', borderRadius: 8,
                      border: '1px solid var(--border)', background: 'var(--bg)',
                      color: 'var(--text)', fontSize: '0.8125rem', resize: 'vertical',
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        )

      case 2: // Alerts
        return (
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 4 }}>Alert Configuration</h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 20 }}>
              Get notified when high-severity intelligence is detected. Leave blank to skip alerts.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: '0.8125rem', fontWeight: 500, display: 'block', marginBottom: 6 }}>
                  <Bell size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                  Slack or Discord Webhook URL
                </label>
                <input
                  value={alertWebhook}
                  onChange={e => setAlertWebhook(e.target.value)}
                  placeholder="https://hooks.slack.com/services/... or https://discord.com/api/webhooks/..."
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--bg)',
                    color: 'var(--text)', fontSize: '0.8125rem',
                  }}
                />
                <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  Alerts fire when briefings meet the severity threshold below
                </div>
              </div>
              {alertWebhook && (
                <div>
                  <label style={{ fontSize: '0.8125rem', fontWeight: 500, display: 'block', marginBottom: 6 }}>
                    Minimum Severity for Alerts
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['critical', 'high', 'medium', 'low'].map(sev => (
                      <button
                        key={sev}
                        onClick={() => setAlertSeverity(sev)}
                        style={{
                          padding: '6px 14px', borderRadius: 6,
                          border: `1px solid ${alertSeverity === sev ? 'var(--accent)' : 'var(--border)'}`,
                          background: alertSeverity === sev ? 'var(--accent)' : 'var(--bg-secondary)',
                          color: alertSeverity === sev ? '#fff' : 'var(--text)',
                          fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer',
                          textTransform: 'uppercase',
                        }}
                      >
                        {sev}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )

      case 3: // Schedule
        return (
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 4 }}>Monitoring Schedule</h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 20 }}>
              How often should the agent scan for new intelligence?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {INTERVALS.map(opt => (
                <div
                  key={opt.value}
                  onClick={() => setInterval(opt.value)}
                  style={{
                    padding: '14px 16px', borderRadius: 10,
                    border: `1px solid ${interval === opt.value ? 'var(--accent)' : 'var(--border)'}`,
                    background: interval === opt.value ? 'rgba(99,102,241,0.06)' : 'var(--bg-secondary)',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}
                >
                  <Clock size={16} style={{ color: interval === opt.value ? 'var(--accent)' : 'var(--text-muted)' }} />
                  <span style={{ fontSize: '0.875rem', fontWeight: interval === opt.value ? 500 : 400 }}>{opt.label}</span>
                </div>
              ))}
            </div>
          </div>
        )

      case 4: // Deploy
        return (
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 4 }}>Review and Deploy</h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 20 }}>
              Your OSINT agent is ready to deploy.
            </p>
            <div style={{
              background: 'var(--bg-secondary)', borderRadius: 10,
              border: '1px solid var(--border)', padding: 16,
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Name</span>
                <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{agentName}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Sources</span>
                <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{sources.length} active</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Keywords</span>
                <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{keywords.split(',').length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Schedule</span>
                <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>
                  {INTERVALS.find(i => i.value === interval)?.label}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Alerts</span>
                <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>
                  {alertWebhook ? `Slack/Discord (${alertSeverity}+)` : 'Disabled'}
                </span>
              </div>
            </div>
            {error && (
              <div style={{
                marginTop: 12, padding: '10px 14px', borderRadius: 8,
                background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                fontSize: '0.8125rem',
              }}>
                {error}
              </div>
            )}
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: 'var(--accent)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Shield size={20} style={{ color: '#fff' }} />
        </div>
        <div>
          <h1 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>Deploy OSINT Agent</h1>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
            Autonomous intelligence monitoring
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
        {STEPS.map((s, i) => (
          <div key={i} style={{ flex: 1 }}>
            <div style={{
              height: 3, borderRadius: 2,
              background: i <= step ? 'var(--accent)' : 'var(--border)',
              transition: 'background 0.2s',
            }} />
            <div style={{
              fontSize: '0.625rem', color: i <= step ? 'var(--accent)' : 'var(--text-muted)',
              marginTop: 4, textAlign: 'center', fontWeight: i === step ? 600 : 400,
            }}>
              {s}
            </div>
          </div>
        ))}
      </div>

      {/* Step content */}
      <div style={{ marginBottom: 24 }}>
        {renderStep()}
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '8px 16px', borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--bg-secondary)',
            color: 'var(--text)', fontSize: '0.8125rem', cursor: 'pointer',
            opacity: step === 0 ? 0.4 : 1,
          }}
        >
          <ChevronLeft size={14} /> Back
        </button>

        {step < STEPS.length - 1 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canNext()}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '8px 16px', borderRadius: 8,
              background: 'var(--accent)', color: '#fff', border: 'none',
              fontSize: '0.8125rem', fontWeight: 500, cursor: 'pointer',
              opacity: canNext() ? 1 : 0.4,
            }}
          >
            Next <ChevronRight size={14} />
          </button>
        ) : (
          <button
            onClick={handleDeploy}
            disabled={deploying}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 20px', borderRadius: 8,
              background: '#10b981', color: '#fff', border: 'none',
              fontSize: '0.8125rem', fontWeight: 500, cursor: 'pointer',
              opacity: deploying ? 0.6 : 1,
            }}
          >
            <Rocket size={14} />
            {deploying ? 'Deploying...' : 'Deploy Agent'}
          </button>
        )}
      </div>
    </div>
  )
}
