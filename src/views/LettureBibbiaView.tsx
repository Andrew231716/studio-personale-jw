import { useMemo, useState } from 'react'
import {
  BookmarkPlus,
  BookMarked,
  NotebookPen,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { JwOpenButtons } from '../components/JwOpenButtons'
import {
  BIBLE_KIND_LABELS,
  BIBLE_READING_SUGGESTIONS,
  buildBibleReadingPlan,
  filterCatalog,
  searchBibleTopic,
  type BibleCatalogEntry,
} from '../lib/bibleReading'
import { uid } from '../lib/id'
import { useAppStore } from '../store/useAppStore'
import type { BibleReadingKind, BibleScriptureRef, StudyResource } from '../types'

export function LettureBibbiaView() {
  const language = useAppStore((s) => s.settings.language)
  const plans = useAppStore((s) => s.bibleReadingPlans)
  const pushBiblePlan = useAppStore((s) => s.pushBibleReadingPlan)
  const updateBiblePlan = useAppStore((s) => s.updateBibleReadingPlan)
  const removeBiblePlan = useAppStore((s) => s.removeBibleReadingPlan)
  const saveResource = useAppStore((s) => s.saveResource)
  const addTopic = useAppStore((s) => s.addTopic)
  const updateTopic = useAppStore((s) => s.updateTopic)
  const setView = useAppStore((s) => s.setView)

  const [kind, setKind] = useState<BibleReadingKind>('personaggio')
  const [catalogFilter, setCatalogFilter] = useState('')
  const [query, setQuery] = useState('Abramo')
  const [busy, setBusy] = useState(false)
  const [searchBusy, setSearchBusy] = useState(false)
  const [error, setError] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [reflectionDraft, setReflectionDraft] = useState('')
  const [searchVerses, setSearchVerses] = useState<BibleScriptureRef[]>([])
  const [searchResources, setSearchResources] = useState<StudyResource[]>([])
  const [tab, setTab] = useState<'catalogo' | 'ricerca' | 'piano'>('catalogo')

  const active = plans.find((p) => p.id === activeId) || plans[0] || null
  const catalog = useMemo(
    () => filterCatalog(kind, catalogFilter),
    [kind, catalogFilter],
  )

  async function generate(q = query, entry?: BibleCatalogEntry) {
    const text = (entry?.label || q).trim()
    if (!text || busy) return
    setBusy(true)
    setError('')
    try {
      const plan = await buildBibleReadingPlan({
        kind,
        query: entry?.query || text,
        language,
        entry,
      })
      // Se generato da entry, usa label come query leggibile
      if (entry) plan.query = entry.label
      pushBiblePlan(plan)
      setActiveId(plan.id)
      setQuery(entry?.label || text)
      setTab('piano')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossibile preparare la proposta')
    } finally {
      setBusy(false)
    }
  }

  async function runSearch(q = query) {
    const text = q.trim()
    if (!text || searchBusy) return
    setSearchBusy(true)
    setError('')
    setTab('ricerca')
    try {
      const res = await searchBibleTopic({ query: text, language })
      setSearchVerses(res.verses)
      setSearchResources(res.resources)
      if (!res.verses.length && !res.resources.length) {
        setError('Nessun risultato su jw.org. Prova un altro termine.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ricerca jw.org non riuscita')
    } finally {
      setSearchBusy(false)
    }
  }

  function addReflection() {
    if (!active || !reflectionDraft.trim()) return
    const reflections = [
      {
        id: uid('bref'),
        text: reflectionDraft.trim(),
        createdAt: new Date().toISOString(),
      },
      ...(active.reflections || []),
    ]
    updateBiblePlan(active.id, { reflections })
    setReflectionDraft('')
  }

  function removeReflection(id: string) {
    if (!active) return
    updateBiblePlan(active.id, {
      reflections: (active.reflections || []).filter((r) => r.id !== id),
    })
  }

  function savePlanAsStudy() {
    if (!active) return
    const reflectionBlock = (active.reflections || [])
      .map((r, i) => `${i + 1}. ${r.text}`)
      .join('\n')
    const scriptureBlock = (active.scriptures || [])
      .map((s) => `• ${s.label}`)
      .join('\n')
    const interest = [
      active.blurb || '',
      active.plan.slice(0, 400),
      scriptureBlock ? `\nScritture:\n${scriptureBlock}` : '',
      reflectionBlock ? `\nLe mie riflessioni:\n${reflectionBlock}` : '',
    ]
      .filter(Boolean)
      .join('\n')
      .slice(0, 2000)

    const id = addTopic(
      active.title,
      `Percorso di lettura (${BIBLE_KIND_LABELS[active.kind]}): ${active.query}`,
    )
    updateTopic(id, {
      interest,
      resources: active.resources,
      objectives: [
        `Completare il percorso: ${active.query}`,
        ...(active.reflections || []).slice(0, 3).map((r) => r.text.slice(0, 120)),
      ],
      reflections: (active.reflections || []).map((r) => ({
        id: uid('ref'),
        prompt: 'Dal percorso di lettura Bibbia',
        response: r.text,
      })),
      status: 'da_iniziare',
    })
    setView('studio')
  }

  return (
    <div className="stack">
      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Letture della Bibbia</h2>
            <p className="muted" style={{ margin: '0.35rem 0 0' }}>
              Catalogo ampio per personaggi, racconti, libri e temi. Cerca sempre su jw.org, apri
              versetti e libri, annota riflessioni e trasformale in un piano di studio.
            </p>
          </div>
        </div>

        <div className="seg-tabs" role="tablist" aria-label="Sezioni letture">
          {(
            [
              ['catalogo', 'Catalogo'],
              ['ricerca', 'Cerca su jw.org'],
              ['piano', 'Il mio percorso'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`chip ${tab === id ? 'active' : ''}`}
              onClick={() => {
                setError('')
                setTab(id)
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="chip-row" style={{ marginBottom: '0.75rem' }}>
          {(Object.keys(BIBLE_KIND_LABELS) as BibleReadingKind[]).map((k) => (
            <button
              key={k}
              type="button"
              className={`chip ${kind === k ? 'active' : ''}`}
              onClick={() => {
                setKind(k)
                setCatalogFilter('')
                const first = BIBLE_READING_SUGGESTIONS[k][0]
                if (first) setQuery(first.label)
                setTab('catalogo')
              }}
            >
              {BIBLE_KIND_LABELS[k]}
            </button>
          ))}
        </div>

        <div className="field">
          <label htmlFor="bible-q">Cosa vuoi leggere?</label>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <input
              id="bible-q"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setCatalogFilter(e.target.value)
              }}
              placeholder="Es. Rut, Salmi, fede, figlio prodigo…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (tab === 'ricerca') void runSearch()
                  else void generate()
                }
              }}
              style={{ flex: 1, minWidth: 180 }}
            />
            {tab === 'ricerca' ? (
              <button
                className="btn"
                type="button"
                disabled={searchBusy || !query.trim()}
                onClick={() => void runSearch()}
              >
                <Search size={16} />
                {searchBusy ? 'Cerco…' : 'Cerca'}
              </button>
            ) : (
              <button
                className="btn"
                type="button"
                disabled={busy || !query.trim()}
                onClick={() => void generate()}
              >
                <BookMarked size={16} />
                {busy ? 'Preparo…' : 'Prepara percorso'}
              </button>
            )}
          </div>
        </div>

        {error && <p className="muted">{error}</p>}
      </section>

      {tab === 'catalogo' && (
        <section className="panel">
          <h3>
            {BIBLE_KIND_LABELS[kind]} — {catalog.length} voci
          </h3>
          <p className="muted">
            Tocca una voce per preparare il percorso con scritture apribili e materiali jw.org.
          </p>
          <div className="list">
            {catalog.map((entry) => (
              <div className="list-item" key={entry.label}>
                <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <strong>{entry.label}</strong>
                    <p className="muted" style={{ margin: '0.25rem 0' }}>
                      {entry.blurb}
                    </p>
                    {entry.scriptures && entry.scriptures.length > 0 && (
                      <div
                        className="stack"
                        style={{ gap: 6, marginTop: 6 }}
                      >
                        {entry.scriptures.slice(0, 4).map((scr) => (
                          <JwOpenButtons
                            key={scr.bible + scr.label}
                            bible={scr.bible}
                            language={language}
                            compact
                            webLabel={scr.label}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    className="btn"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setQuery(entry.label)
                      void generate(entry.query, entry)
                    }}
                  >
                    Percorso
                  </button>
                </div>
              </div>
            ))}
            {catalog.length === 0 && (
              <div className="empty">Nessuna voce del catalogo corrisponde al filtro.</div>
            )}
          </div>
        </section>
      )}

      {tab === 'ricerca' && (
        <div className="split">
          <section className="panel">
            <h3>Versetti e libri (jw.org)</h3>
            <p className="muted">Apri direttamente in JW Library o sul sito.</p>
            <div className="list">
              {searchVerses.map((v) => (
                <div className="list-item" key={v.id}>
                  <strong>{v.label}</strong>
                  {v.note && (
                    <p className="muted" style={{ margin: 0 }}>
                      {v.note}
                    </p>
                  )}
                  <JwOpenButtons
                    url={v.url}
                    bible={v.bible}
                    language={language}
                    webLabel={v.label}
                  />
                </div>
              ))}
              {searchVerses.length === 0 && (
                <div className="empty">Cerca un personaggio, un racconto o un tema su jw.org.</div>
              )}
            </div>
          </section>
          <section className="panel">
            <h3>Articoli e video collegati</h3>
            <div className="list">
              {searchResources.map((r) => (
                <div className="list-item" key={r.id}>
                  <strong>{r.title}</strong>
                  {r.notes && (
                    <p className="muted" style={{ margin: 0 }}>
                      {r.notes.slice(0, 140)}
                    </p>
                  )}
                  <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                    <JwOpenButtons
                      url={r.url}
                      wolUrl={r.wolUrl}
                      lank={r.lank}
                      docid={r.docid}
                      bible={r.bible}
                      pub={r.pub}
                      language={language}
                      compact
                    />
                    <button
                      className="chip"
                      type="button"
                      onClick={() => saveResource(r, query)}
                    >
                      <BookmarkPlus size={14} /> Salva
                    </button>
                  </div>
                </div>
              ))}
              {searchResources.length === 0 && (
                <div className="empty">I materiali pubblicati appariranno qui dopo la ricerca.</div>
              )}
            </div>
            {(searchVerses.length > 0 || searchResources.length > 0) && (
              <button
                className="btn"
                type="button"
                style={{ marginTop: '0.75rem' }}
                disabled={busy}
                onClick={() => void generate(query)}
              >
                Crea percorso di lettura da questa ricerca
              </button>
            )}
          </section>
        </div>
      )}

      {tab === 'piano' && (
        <div className="split">
          <section className="panel">
            {active ? (
              <div className="stack">
                <div className="section-head">
                  <div>
                    <span className="badge">{BIBLE_KIND_LABELS[active.kind]}</span>
                    <h3 style={{ margin: '0.4rem 0 0' }}>{active.title}</h3>
                    {active.blurb && <p className="muted">{active.blurb}</p>}
                  </div>
                </div>
                <pre
                  className="bubble assistant"
                  style={{ maxWidth: '100%', whiteSpace: 'pre-wrap', margin: 0 }}
                >
                  {active.plan}
                </pre>

                <h4>Scritture da aprire</h4>
                <div className="list">
                  {(active.scriptures || []).map((scr) => (
                    <div className="list-item" key={scr.id}>
                      <JwOpenButtons
                        url={scr.url}
                        bible={scr.bible}
                        language={language}
                        webLabel={scr.label}
                      />
                    </div>
                  ))}
                  {!active.scriptures?.length && (
                    <div className="empty">Nessuna scrittura collegata ancora.</div>
                  )}
                </div>

                <h4>Le mie riflessioni</h4>
                <div className="field">
                  <textarea
                    value={reflectionDraft}
                    onChange={(e) => setReflectionDraft(e.target.value)}
                    placeholder="Cosa imparo su Geova? Cosa posso applicare questa settimana?"
                    rows={3}
                  />
                </div>
                <button
                  className="btn secondary"
                  type="button"
                  disabled={!reflectionDraft.trim()}
                  onClick={addReflection}
                >
                  <span className="row" style={{ gap: 6 }}>
                    <Plus size={14} /> Aggiungi riflessione
                  </span>
                </button>
                <div className="list">
                  {(active.reflections || []).map((r) => (
                    <div className="list-item" key={r.id}>
                      <div className="row" style={{ justifyContent: 'space-between' }}>
                        <p style={{ margin: 0, flex: 1 }}>{r.text}</p>
                        <button
                          className="btn secondary"
                          type="button"
                          onClick={() => removeReflection(r.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {!active.reflections?.length && (
                    <div className="empty">Annota qui le tue riflessioni per il piano di studio.</div>
                  )}
                </div>

                <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <button className="btn" type="button" onClick={savePlanAsStudy}>
                    <span className="row" style={{ gap: 6 }}>
                      <NotebookPen size={14} /> Salva come piano di studio
                    </span>
                  </button>
                  {active.resources[0] && (
                    <button
                      className="btn secondary"
                      type="button"
                      onClick={() => {
                        for (const r of active.resources.slice(0, 5)) {
                          saveResource(r, active.query)
                        }
                      }}
                    >
                      <span className="row" style={{ gap: 6 }}>
                        <BookmarkPlus size={14} /> Salva materiali
                      </span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="empty">
                Scegli una voce dal <strong>Catalogo</strong> oppure scrivi un tema e tocca{' '}
                <strong>Prepara percorso</strong>.
              </div>
            )}
          </section>

          <section className="panel">
            <h3>Fonti jw.org</h3>
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
                    wolUrl={r.wolUrl}
                    lank={r.lank}
                    docid={r.docid}
                    bible={r.bible}
                    pub={r.pub}
                    language={language}
                    compact
                  />
                </div>
              ))}
              {!active?.resources.length && (
                <div className="empty">I materiali del percorso attivo compariranno qui.</div>
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
                  onClick={() => {
                    setActiveId(p.id)
                    setTab('piano')
                  }}
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
                  {(p.reflections?.length || 0) > 0 && (
                    <span className="muted"> · {p.reflections!.length} riflessioni</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
