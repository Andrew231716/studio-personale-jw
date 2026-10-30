import { useState } from 'react'
import { BookmarkPlus } from 'lucide-react'
import { JwOpenButtons } from '../components/JwOpenButtons'
import { askAi, buildDecisionContext, buildStudyContext, createMessage } from '../lib/ai'
import { searchJwDeep } from '../lib/jwApi'
import { uid } from '../lib/id'
import { SECTION_LABELS } from '../lib/jwSections'
import { useAppStore } from '../store/useAppStore'
import type { JwResultSection } from '../types'

const QUICK = [
  'Aiutami a trovare articoli e video su jw.org per rafforzare la mia fede',
  'Elabora i miei pensieri e trasformali in obiettivi di studio pratici',
  'Come posso prendere una decisione grande secondo i principi spiegati su jw.org?',
  'Dammi domande di riflessione e cose pratiche da provare questa settimana',
]

export function AssistenteView() {
  const messages = useAppStore((s) => s.aiMessages)
  const pushAiMessage = useAppStore((s) => s.pushAiMessage)
  const clearAi = useAppStore((s) => s.clearAi)
  const topics = useAppStore((s) => s.topics)
  const decisions = useAppStore((s) => s.decisions)
  const activeTopicId = useAppStore((s) => s.activeTopicId)
  const activeDecisionId = useAppStore((s) => s.activeDecisionId)
  const language = useAppStore((s) => s.settings.language)
  const saveResource = useAppStore((s) => s.saveResource)
  const saveSearch = useAppStore((s) => s.saveSearch)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [sections, setSections] = useState<JwResultSection[]>([])
  const [queriesUsed, setQueriesUsed] = useState<string[]>([])
  const [saveHint, setSaveHint] = useState('')

  const topic = topics.find((t) => t.id === activeTopicId) || topics[0]
  const decision = decisions.find((d) => d.id === activeDecisionId) || decisions[0]

  async function send(text = input) {
    const prompt = text.trim()
    if (!prompt || busy) return
    setBusy(true)
    setInput('')
    pushAiMessage(createMessage('user', prompt))

    let flat: Awaited<ReturnType<typeof searchJwDeep>>['flat'] = []
    let deepSections: JwResultSection[] = []
    let used: string[] = []
    try {
      const deep = await searchJwDeep(prompt, { language, perSection: 5 })
      flat = deep.flat
      deepSections = deep.sections
      used = deep.queriesUsed
      setSections(deepSections)
      setQueriesUsed(used)
    } catch {
      setSections([])
      setQueriesUsed([])
      flat = []
      deepSections = []
    }

    const sectionBlock = deepSections.length
      ? 'Risultati jw.org per sezione (uniche fonti citabili):\n' +
        deepSections
          .map(
            (s) =>
              `### ${s.label}\n` +
              s.items
                .map((r) => {
                  const snip = r.snippet ? ` — ${r.snippet.slice(0, 160)}` : ''
                  const ctx = r.context ? ` (${r.context})` : ''
                  return `- ${r.title}${ctx}${snip}\n  URL: ${r.url}`
                })
                .join('\n'),
          )
          .join('\n\n')
      : 'Nessun risultato jw.org trovato per questa richiesta: non inventare titoli né URL.'

    const context = [
      buildStudyContext(topic, []),
      buildDecisionContext(decision, []),
      used.length ? `Query tematiche usate: ${used.join(' | ')}` : '',
      sectionBlock,
    ]
      .filter(Boolean)
      .join('\n\n')

    try {
      const answer = await askAi({
        prompt,
        history: useAppStore.getState().aiMessages,
        context,
        allowedUrls: flat.map((r) => r.url),
      })
      pushAiMessage(createMessage('assistant', answer))
    } catch (e) {
      pushAiMessage(
        createMessage(
          'assistant',
          e instanceof Error ? e.message : 'Assistente non disponibile al momento.',
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="split">
      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Assistente AI gratuito</h2>
            <p className="muted" style={{ margin: '0.35rem 0 0' }}>
              Ricerca approfondita su jw.org per tema e contesto, con risultati divisi per sezione
              (libri, opuscoli, articoli, video, guida alle ricerche…).
            </p>
          </div>
          <button className="btn secondary" type="button" onClick={clearAi}>
            Pulisci chat
          </button>
        </div>

        <div className="chat">
          {messages.length === 0 && (
            <div className="empty">
              Scrivi una richiesta oppure usa un suggerimento rapido.
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`bubble ${m.role === 'user' ? 'user' : 'assistant'}`}>
              {m.content}
            </div>
          ))}
        </div>

        <div className="chip-row" style={{ marginTop: '0.8rem' }}>
          {QUICK.map((q) => (
            <button key={q} className="chip" type="button" onClick={() => void send(q)}>
              {q.slice(0, 48)}…
            </button>
          ))}
        </div>

        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="ai-input">Il tuo messaggio</label>
          <textarea
            id="ai-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Es. Aiutami a elaborare cosa sto imparando sulla pazienza…"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
          />
        </div>
        <button className="btn" type="button" disabled={busy} onClick={() => void send()}>
          {busy ? 'Sto pensando…' : 'Invia'}
        </button>
      </section>

      <section className="panel">
        <h3>Collegamenti per sezione</h3>
        <p className="muted">
          Risultati tematici da jw.org, apribili anche in JW Library.
        </p>
        {queriesUsed.length > 0 && (
          <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: '0.5rem' }}>
            <p className="muted search-meta" style={{ margin: 0, flex: 1 }}>
              Ricerche: {queriesUsed.map((q) => `«${q}»`).join(' · ')}
            </p>
            <button
              className="btn secondary"
              type="button"
              onClick={() => {
                const q = queriesUsed[0] || input
                if (!q.trim()) return
                saveSearch(q)
                setSaveHint(`Ricerca salvata in Da studiare: «${q}»`)
              }}
            >
              <span className="row" style={{ gap: 6 }}>
                <BookmarkPlus size={14} /> Salva ricerca
              </span>
            </button>
          </div>
        )}
        {saveHint && <p className="muted">{saveHint}</p>}
        <div className="search-sections">
          {sections.map((sec) => (
            <section key={sec.id} className="search-section">
              <header className="search-section-head">
                <h4>{sec.label || SECTION_LABELS[sec.id]}</h4>
                <span className="badge">{sec.items.length}</span>
              </header>
              <div className="list">
                {sec.items.map((l) => (
                  <div key={`${sec.id}-${l.url}-${l.lank || l.docid || ''}`} className="list-item">
                    <strong>{l.title}</strong>
                    {l.context && (
                      <p className="muted result-context" style={{ margin: 0 }}>
                        {l.context}
                      </p>
                    )}
                    <JwOpenButtons
                      url={l.url}
                      wolUrl={l.wolUrl}
                      lank={l.lank}
                      docid={l.docid}
                      language={language}
                      compact
                    />
                    <button
                      className="btn secondary"
                      type="button"
                      onClick={() => {
                        const saved = saveResource(
                          {
                            id: uid('res'),
                            title: l.title,
                            url: l.url,
                            kind: l.kind,
                            notes: l.context || l.snippet,
                            lank: l.lank,
                            docid: l.docid,
                            wolUrl: l.wolUrl,
                          },
                          queriesUsed[0],
                        )
                        setSaveHint(
                          saved
                            ? `Salvato per dopo: ${l.title}`
                            : 'Già presente in Da studiare',
                        )
                      }}
                    >
                      <span className="row" style={{ gap: 6 }}>
                        <BookmarkPlus size={14} /> Salva per dopo
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}
          {sections.length === 0 && (
            <div className="empty">I collegamenti appariranno dopo la prossima richiesta.</div>
          )}
        </div>
        <div className="footnote">
          Contesto attuale: studio “{topic?.title || 'nessuno'}”, decisione “{decision?.title || 'nessuna'}”.
        </div>
      </section>
    </div>
  )
}
