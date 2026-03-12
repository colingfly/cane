import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { getConversations, getConversation, deleteConversation, clearConversations } from '../api/client'

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

export default function ConversationHistory() {
  const { agentId } = useParams()
  const [conversations, setConversations] = useState([])
  const [selectedConv, setSelectedConv] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [msgLoading, setMsgLoading] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    loadConversations()
  }, [agentId])

  const loadConversations = async () => {
    setLoading(true)
    try {
      const res = await getConversations(agentId)
      setConversations(res.conversations || [])
    } catch (e) {
      console.error('Failed to load conversations:', e)
    } finally {
      setLoading(false)
    }
  }

  const openConversation = async (conv) => {
    setSelectedConv(conv)
    setMsgLoading(true)
    try {
      const res = await getConversation(agentId, conv.id)
      setMessages(res.messages || [])
    } catch (e) {
      console.error('Failed to load conversation:', e)
    } finally {
      setMsgLoading(false)
    }
  }

  const handleDelete = async (convId) => {
    try {
      await deleteConversation(agentId, convId)
      setConversations(prev => prev.filter(c => c.id !== convId))
      if (selectedConv?.id === convId) {
        setSelectedConv(null)
        setMessages([])
      }
    } catch (e) {
      console.error('Failed to delete conversation:', e)
    }
  }

  const handleClearAll = async () => {
    try {
      await clearConversations(agentId)
      setConversations([])
      setSelectedConv(null)
      setMessages([])
      setConfirmClear(false)
    } catch (e) {
      console.error('Failed to clear conversations:', e)
    }
  }

  // Thread view
  if (selectedConv) {
    return (
      <div className="fade-in" style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px 60px' }}>
        <div style={{ paddingTop: 16, marginBottom: 24 }}>
          <button
            onClick={() => { setSelectedConv(null); setMessages([]) }}
            style={{
              color: 'var(--text-muted)', fontSize: '0.8125rem',
              display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16,
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back to conversations
          </button>

          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-display)', margin: 0 }}>
            {selectedConv.title || 'Untitled'}
          </h2>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            {selectedConv.message_count} messages · {timeAgo(selectedConv.updated_at)}
            {selectedConv.channel !== 'internal' && (
              <span className="badge" style={{ marginLeft: 8, fontSize: '0.65rem' }}>
                {selectedConv.channel}
              </span>
            )}
          </div>
        </div>

        {msgLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" /></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {messages.map((msg, i) => (
              <div key={msg.id || i} style={{
                padding: '12px 16px',
                borderRadius: 'var(--radius)',
                background: msg.role === 'user'
                  ? 'rgba(255,255,255,0.06)'
                  : 'var(--paper)',
                border: msg.role === 'user'
                  ? '1px solid rgba(255,255,255,0.08)'
                  : '1px solid var(--rule)',
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '90%',
              }}>
                <div style={{
                  fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)',
                  marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em',
                }}>
                  {msg.role === 'user' ? 'You' : 'Agent'}
                  {msg.response_time_ms && (
                    <span style={{ marginLeft: 8, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                      {msg.response_time_ms}ms
                    </span>
                  )}
                </div>
                {msg.role === 'assistant' ? (
                  <div className="summary-text" style={{ fontSize: '0.8125rem', lineHeight: 1.6 }}>
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.8125rem', lineHeight: 1.6 }}>
                    {msg.content}
                  </div>
                )}
                {msg.role === 'assistant' && msg.sources && msg.sources !== '[]' && (
                  <div style={{
                    marginTop: 8, fontSize: '0.72rem', color: 'var(--text-muted)',
                    borderTop: '1px solid var(--rule)', paddingTop: 6,
                  }}>
                    Sources: {(() => {
                      try { return JSON.parse(msg.sources).join(' · ') }
                      catch { return msg.sources }
                    })()}
                  </div>
                )}
              </div>
            ))}

            {messages.length === 0 && (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                No messages in this conversation.
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // List view
  return (
    <div className="fade-in" style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px 60px' }}>
      <div style={{ paddingTop: 16, marginBottom: 24 }}>
        <Link
          to={`/agents/${agentId}`}
          style={{
            color: 'var(--text-muted)', fontSize: '0.8125rem',
            display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16, textDecoration: 'none',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back to agent
        </Link>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--font-display)', margin: 0 }}>
              Conversation History
            </h2>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 4 }}>
              {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
            </div>
          </div>

          {conversations.length > 0 && (
            confirmClear ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost" style={{ fontSize: '0.78rem' }} onClick={() => setConfirmClear(false)}>
                  Cancel
                </button>
                <button className="btn" style={{
                  fontSize: '0.78rem', background: 'rgba(248,113,113,0.15)', color: '#f87171',
                  border: '1px solid rgba(248,113,113,0.2)',
                }} onClick={handleClearAll}>
                  Confirm clear all
                </button>
              </div>
            ) : (
              <button className="btn btn-ghost" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}
                onClick={() => setConfirmClear(true)}>
                Clear all
              </button>
            )
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" /></div>
      ) : conversations.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12, opacity: 0.5 }}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            No conversations yet. Start chatting with your agent to see history here.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {conversations.map(conv => (
            <div key={conv.id} className="card" style={{
              padding: '14px 18px', cursor: 'pointer',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              transition: 'all 0.15s',
            }}
              onClick={() => openConversation(conv)}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '0.875rem', fontWeight: 600,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  marginBottom: 4,
                }}>
                  {conv.title || 'Untitled'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  <span>{conv.message_count} messages</span>
                  <span>·</span>
                  <span>{timeAgo(conv.updated_at)}</span>
                  {conv.channel !== 'internal' && (
                    <>
                      <span>·</span>
                      <span className="badge" style={{ fontSize: '0.6rem', padding: '1px 6px' }}>
                        {conv.channel}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <button
                className="btn btn-ghost"
                style={{ padding: 4, color: 'var(--text-muted)', flexShrink: 0 }}
                onClick={(e) => { e.stopPropagation(); handleDelete(conv.id) }}
                title="Delete conversation"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
