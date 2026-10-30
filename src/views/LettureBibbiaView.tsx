import { useState } from 'react'
import { BookmarkPlus, BookMarked, NotebookPen, Trash2 } from 'lucide-react'
import { JwOpenButtons } from '../components/JwOpenButtons'
import {
  BIBLE_KIND_LABELS,
  BIBLE_READING_SUGGESTIONS,
  buildBibleReadingPlan,
} from '../lib/bibleReading'
import { useAppStore } from '../store/useAppStore'
import type { BibleReadingKind } from '../types'

export function LettureBibbiaView() {
  const language = useAppStore((s) => s.settings.language)
  const plans = useAppStore((s) => s.bibleReadingPlans)
  const pushBiblePlan = useAppStore((s) => s.pushBibleReadingPlan)
  const removeBiblePlan = useAppStore((s) => s.removeBibleReadingPlan)
  const saveResource = useAppStore((s) => s.saveResource)
  const addTopic = useAppStore((s) => s.addTopic)
  const updateTopic = useAppStore((s) => s.updateTopic)
  const setView = useAppStore((s) => s.setView)

  const [kind, setKind] = useState<BibleReadingKind>('personaggio')
  const [query, setQuery] = useState('Abramo')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)

  const active = plans.find((p) => p.id === activeId) || plans[0] || null

  async function generate(q = query) {
    const text = q.trim()
    if (!text || busy) return
    setBusy(true)
    setError('')
    try {
      const plan = await buildBibleReadingPlan({ kind, query: text, language })
      pushBiblePlan(plan)
      setActiveId(plan.id)
      setQuery(text)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossibile preparare la proposta')
    } finally {
      setBusy(false)
    }
  }

  function savePlanAsStudy() {
    if (!active) return
    const id = addTopic(active.title, `Percorso di lettura (${BIBLE_KIND_LABELS[active.kind]}): ${active.query}`)
    updateTopic(id, {
      interest: active.plan.slice(0, 500),
      resources: active.resources,
      status: 'da_iniziare',
    })
    setView('studio')
  }

  return (
    <div className="split">
      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Letture della Bibbia</h2>
            <p className="muted" style={{ margin: '0.35rem 0 0' }}>
              Proposte di lettura per personaggi, racconti, libri o temi, basate su materiali di
              jw.org.
            </p>
          </div>
        </div>

        <div className="chip-row">
          {(Object.keys(BIBLE_KIND_LABELS) as BibleReadingKind[]).map((k) => (
            <button
              key={k}
              type="button"
              className={`chip ${kind === k ? 'active' : ''}`}
              onClick={() => {
                setKind(k)
                const first = BIBLE_READING_SUGGESTIONS[k][0]
                if (first) setQuery(first.label)
              }}
            >
              {BIBLE_KIND_LABELS[k]}
            </button>
          ))}
        </div>

        <div className="field">
          <label htmlFor="bible-q">Cosa vuoi approfondire?</label>
          <div className="row">
            <input
              id="bible-q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Es. Rut, parabola del figlio prodigo, Salmi…"
              onKeyDown={(e) => e.key === 'Enter' && void generate()}
              style={{ flex: 1, minWidth: 160 }}
            />
            <button className="btn" type="button" disabled={busy} onClick={() => void generate()}>
              <span className="row" style={{ gap: 6 }}>
                <BookMarked size={16} />
                {busy ? 'Cerco su jw.org…' : 'Prepara percorso'}
              </span>
            </button>
          </div>
        </div>

        <div className="chip-row">
          {BIBLE_READING_SUGGESTIONS[kind].map((s) => (
            <button
              key={s.label}
              type="button"
              className="chip"
              onClick={() => {
                setQuery(s.label)
                void generate(s.query)
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {error && <p className="muted">{error}</p>}

        {active && (
          <div className="stack" style={{ marginTop: '1rem' }}>
            <div className="section-head">
              <div>
                <span className="badge">{BIBLE_KIND_LABELS[active.kind]}</span>
                <h3 style={{ margin: '0.4rem 0 0' }}>{active.title}</h3>
              </div>
            </div>
            <pre
              className="bubble assistant"
              style={{ maxWidth: '100%', whiteSpace: 'pre-wrap', margin: 0 }}
            >
              {active.plan}
            </pre>
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              <button className="btn" type="button" onClick={savePlanAsStudy}>
                <span className="row" style={{ gap: 6 }}>
                  <NotebookPen size={14} /> Salva nel Quaderno
                </span>
              </button>
              {active.resources[0] && (
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => {
                    for (const r of active.resources.slice(0, 5)) saveResource(r, active.query)
                  }}
                >
                  <span className="row" style={{ gap: 6 }}>
                    <BookmarkPlus size={14} /> Salva materiali per dopo
                  </span>
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <h3>Fonti jw.org</h3>
        <p className="muted">Articoli e video trovati per il percorso attivo.</p>
        <div className="list">
          {(active?.resources || []).map((r) => (
            <div className="list-item" key={r.id}>
              <strong>{r.title}</strong>
              {r.notes && (
                <p className="muted" style={{ margin: 0 }}>
                  {r.notes.slice(0, 160)}
                </p>
              )}
              <JwOpenButtons
                url={r.url}
                lank={r.lank}
                docid={r.docid}
                language={language}
                compact
              />
            </div>
          ))}
          {!active?.resources.length && (
            <div className="empty">Scegli un personaggio, un racconto o un libro e genera il percorso.</div>
          )}
        </div>

        <h3 style={{ marginTop: '1.25rem' }}>Percorsi salvati ({plans.length})</h3>
        <div className="list">
          {plans.length === 0 && <div className="empty">Nessun percorso ancora.</div>}
          {plans.map((p) => (
            <div
              className={`list-item ${active?.id === p.id ? 'active' : ''}`}
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => setActiveId(p.id)}
              onKeyDown={(e) => e.key === 'Enter' && setActiveId(p.id)}
            >
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>{p.title}</strong>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeBiblePlan(p.id)
                    if (activeId === p.id) setActiveId(null)
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <span className="badge">{BIBLE_KIND_LABELS[p.kind]}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
