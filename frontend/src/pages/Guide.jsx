import { useState } from 'react'
import { ChevronDown, ChevronRight, Search, FileText, Bot, MessageSquare, Users, Upload } from 'lucide-react'

const sections = [
  {
    id: 'searching',
    icon: Search,
    title: 'Searching Your Documents',
    content: [
      {
        q: 'How do I search?',
        a: 'Go to the Search page (home). Type your question in plain English — for example, "What is our PTO policy?" or "How do I configure the API?" Cane searches across all your documents and gives you an AI-generated answer with sources cited.',
      },
      {
        q: 'Can I search a specific workspace or agent?',
        a: 'Yes. Use the dropdown below the search bar to select a workspace or agent. "All workspaces" searches everything you have access to. Agents appear under a separate "Agents" group in the dropdown.',
      },
      {
        q: 'What are follow-up questions?',
        a: 'After your first search, you can ask follow-up questions in the same session. Cane remembers the context of the conversation. Click "New chat" to start fresh.',
      },
      {
        q: 'How does Cane find answers?',
        a: 'Cane uses semantic search to find the most relevant sections of your documents, then uses AI to synthesize a clear answer. It shows which documents the answer came from so you can verify.',
      },
    ],
  },
  {
    id: 'documents',
    icon: Upload,
    title: 'Uploading Documents',
    content: [
      {
        q: 'What file types can I upload?',
        a: 'PDFs, Word documents (DOCX), spreadsheets (XLSX, CSV), images (PNG, JPG, GIF, TIFF, WEBP), audio (MP3, WAV, M4A, FLAC), and video (MP4, MKV, AVI, MOV, WEBM).',
      },
      {
        q: 'How do I upload?',
        a: 'Go to the Documents page. Drag and drop files into the upload area, or click to browse. You can upload multiple files at once. Select which workspace to upload to using the dropdown.',
      },
      {
        q: 'How long does processing take?',
        a: 'Most documents process in under a minute. Audio and video files take longer because they need to be transcribed. You\'ll see a status indicator while processing is in progress. You can keep working while files process in the background.',
      },
      {
        q: 'What happens during processing?',
        a: 'Cane extracts text from your documents, splits it into searchable chunks, and creates embeddings for semantic search. For images, it runs OCR to extract visible text. For audio and video, it generates a transcript.',
      },
      {
        q: 'Can I delete a document?',
        a: 'Yes. On the Documents page, click the trash icon next to any document. This removes the document and all its indexed content. This action cannot be undone.',
      },
    ],
  },
  {
    id: 'workspaces',
    icon: FileText,
    title: 'Workspaces',
    content: [
      {
        q: 'What is a workspace?',
        a: 'A workspace is a collection of documents grouped by topic, department, or project. When you search within a workspace, only documents in that workspace are searched.',
      },
      {
        q: 'How do I create a workspace?',
        a: 'Go to Settings and look for the Workspaces section. Click "Add Workspace" and give it a name. You can then upload documents directly to that workspace.',
      },
      {
        q: 'When should I use multiple workspaces?',
        a: 'Use separate workspaces when you have distinct document collections that shouldn\'t overlap in search results. For example: one workspace for HR policies, another for product documentation, another for training materials.',
      },
    ],
  },
  {
    id: 'agents',
    icon: Bot,
    title: 'AI Agents',
    content: [
      {
        q: 'What is an agent?',
        a: 'An agent is a specialized AI assistant trained on a specific set of documents. It has a custom prompt that tells the AI how to interpret and respond to questions about those documents. Think of it as an expert that only knows about one topic.',
      },
      {
        q: 'What templates are available?',
        a: 'Three pre-built templates: Operations Guide (for SOPs, handbooks, and procedures), Academic Tutor (for lecture materials and coursework), and Knowledge Base (for product docs, FAQs, and service guides). Each comes with an optimized prompt for its use case.',
      },
      {
        q: 'How do I create an agent?',
        a: 'Go to Agent Builder in the sidebar. Click a template or "Create Your Own." After creating the agent, upload documents and optionally customize the AI prompt. Then click "Ask this agent" to start querying.',
      },
      {
        q: 'What does "Auto-generate" do?',
        a: 'For custom agents, the Auto-generate button analyzes your uploaded documents and writes a specialized prompt based on the domain, terminology, and content it finds. You can edit the generated prompt before saving.',
      },
      {
        q: 'How do I use an agent from the Search page?',
        a: 'Agents appear in the Search page dropdown under the "Agents" group. Select one to scope your search to that agent\'s documents and specialized prompt. You can also click "Ask this agent" from the agent detail page.',
      },
    ],
  },
  {
    id: 'conversations',
    icon: MessageSquare,
    title: 'Conversations & Follow-ups',
    content: [
      {
        q: 'Does Cane remember previous questions?',
        a: 'Yes, within a single session. After your first question, you can ask follow-ups and Cane will use the context of the conversation. Click "New chat" to reset and start a fresh conversation.',
      },
      {
        q: 'How many follow-ups can I ask?',
        a: 'There\'s no hard limit. The AI keeps the conversation context for the duration of your session. If the conversation gets very long, starting a new chat can improve answer quality.',
      },
      {
        q: 'Are my conversations saved?',
        a: 'Conversation history is maintained during your active session but is not permanently stored. Starting a new chat or refreshing the page clears the conversation.',
      },
    ],
  },
  {
    id: 'team',
    icon: Users,
    title: 'Team & Settings',
    content: [
      {
        q: 'How do I invite team members?',
        a: 'Go to Settings and use the team invite section. Enter their email address and they\'ll receive access. Team members can search and upload documents to shared workspaces.',
      },
      {
        q: 'What are the different roles?',
        a: 'Owners can manage the team, workspaces, agents, and all documents. Members can upload documents and search. Everyone on the team searches the same document pool.',
      },
      {
        q: 'How do I change my password?',
        a: 'Go to Settings and look for the password section. Enter your current password and your new password to update it.',
      },
    ],
  },
]

function Section({ section, isOpen, onToggle }) {
  const Icon = section.icon
  return (
    <div style={{ marginBottom: 12 }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', cursor: 'pointer', transition: 'all 0.15s',
          borderColor: isOpen ? 'var(--accent)' : 'var(--border)',
        }}
      >
        <Icon size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <span style={{ fontWeight: 600, fontSize: '0.9375rem', flex: 1, textAlign: 'left', color: 'var(--text)' }}>
          {section.title}
        </span>
        {isOpen
          ? <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />
          : <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
        }
      </button>

      {isOpen && (
        <div style={{
          borderLeft: '2px solid var(--accent-muted)',
          marginLeft: 24, marginTop: 8, paddingLeft: 20,
        }}>
          {section.content.map((item, i) => (
            <div key={i} style={{ marginBottom: i < section.content.length - 1 ? 20 : 8 }}>
              <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 4, color: 'var(--text)' }}>
                {item.q}
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {item.a}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Guide() {
  const [openSections, setOpenSections] = useState(new Set(['searching']))

  const toggle = (id) => {
    setOpenSections(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const expandAll = () => setOpenSections(new Set(sections.map(s => s.id)))
  const collapseAll = () => setOpenSections(new Set())

  return (
    <div className="fade-in" style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4, fontFamily: 'var(--font-display)' }}>
          User Guide
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: 16 }}>
          Everything you need to know about using Cane.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" style={{ fontSize: '0.75rem' }} onClick={expandAll}>
            Expand all
          </button>
          <button className="btn btn-ghost" style={{ fontSize: '0.75rem' }} onClick={collapseAll}>
            Collapse all
          </button>
        </div>
      </div>

      {sections.map(section => (
        <Section
          key={section.id}
          section={section}
          isOpen={openSections.has(section.id)}
          onToggle={() => toggle(section.id)}
        />
      ))}

      <div style={{
        marginTop: 32, padding: 20, background: 'var(--accent-muted)',
        borderRadius: 'var(--radius)', fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.6,
      }}>
        <strong style={{ color: 'var(--text)' }}>Need help?</strong> If you can't find what you're looking for, 
        reach out to your team administrator. They can help with workspace setup, permissions, and account issues.
      </div>
    </div>
  )
}