import { FlaskConical, ListChecks, SlidersHorizontal, BarChart3, ArrowRight, Sparkles } from 'lucide-react'

const steps = [
  {
    icon: ListChecks,
    title: 'Define Test Cases',
    description: 'Write questions your agent should handle — or auto-generate them from your files. Add expected answers to measure accuracy.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Set Judge Criteria',
    description: 'Weight what matters most: accuracy, tone, citation quality, hallucination detection. Write custom rules in plain English.',
  },
  {
    icon: Sparkles,
    title: 'Run Evaluation',
    description: 'Your agent answers every test case. An LLM Judge scores each response against your criteria — automatically.',
  },
  {
    icon: BarChart3,
    title: 'Iterate & Ship',
    description: 'See exactly where your agent fails. Tweak the prompt or files, run again. Ship with confidence when it passes.',
  },
]

const useCases = [
  {
    title: 'QA before deploying',
    description: 'Stress-test your agent on edge cases before putting it in front of customers.',
  },
  {
    title: 'Prompt optimization',
    description: 'Compare scores across prompt versions to find what works best.',
  },
  {
    title: 'Regression testing',
    description: 'Re-run environments after updating files to make sure nothing broke.',
  },
  {
    title: 'Compliance validation',
    description: 'Verify your agent never gives incorrect info on regulated topics.',
  },
]

export default function Environments() {
  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'var(--accent-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--accent)',
          }}>
            <FlaskConical size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em' }}>Environments</h2>
              <span style={{
                fontSize: '0.6rem', fontWeight: 700,
                background: 'var(--accent)', color: 'white',
                padding: '3px 10px', borderRadius: 8,
                letterSpacing: '0.05em', textTransform: 'uppercase',
              }}>Coming Soon</span>
            </div>
            <p style={{ color: 'var(--text-secondary)', marginTop: 2 }}>
              Test, evaluate, and improve your agents before you ship them.
            </p>
          </div>
        </div>
      </div>

      {/* Hero card */}
      <div style={{
        background: 'linear-gradient(135deg, var(--accent-muted), rgba(200,150,62,0.04))',
        border: '1px solid rgba(200,150,62,0.2)',
        borderRadius: 'var(--radius-lg)',
        padding: '36px 40px',
        marginBottom: 32,
      }}>
        <h3 style={{
          fontSize: '1.2rem', fontWeight: 700, marginBottom: 8,
          letterSpacing: '-0.01em',
        }}>
          Build agents you can trust.
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6, maxWidth: 640 }}>
          Environments let you create evaluation pipelines for your AI agents. Define test cases,
          configure an LLM-as-a-Judge to score responses, and iterate until your agent consistently
          gets it right. No guessing. No surprises in production.
        </p>
      </div>

      {/* How it works */}
      <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 20 }}>How it works</h3>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16,
        marginBottom: 40,
      }}>
        {steps.map((step, i) => {
          const StepIcon = step.icon
          return (
            <div key={i} className="card" style={{ position: 'relative', padding: 24 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'var(--accent)', color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.75rem', fontWeight: 700, flexShrink: 0,
                }}>{i + 1}</div>
                <StepIcon size={18} style={{ color: 'var(--accent)' }} />
              </div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 6 }}>{step.title}</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {step.description}
              </div>
              {i < 3 && (
                <ArrowRight size={14} style={{
                  position: 'absolute', right: -14, top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--text-muted)', zIndex: 1,
                }} />
              )}
            </div>
          )
        })}
      </div>

      {/* Use cases */}
      <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 20 }}>What you'll be able to do</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 40 }}>
        {useCases.map((uc, i) => (
          <div key={i} className="card" style={{ padding: 22, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: 'var(--accent)', marginTop: 6, flexShrink: 0,
            }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 4 }}>{uc.title}</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {uc.description}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div style={{
        textAlign: 'center', padding: '32px 0',
        borderTop: '1px solid var(--border)',
      }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 6 }}>
          Environments is under active development.
        </p>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Have ideas for what you'd like to see?{' '}
          <a href="mailto:hello@cane.fyi" style={{ color: 'var(--accent)', fontWeight: 600 }}>
            Let us know
          </a>
        </p>
      </div>
    </div>
  )
}
