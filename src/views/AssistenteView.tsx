import { useState } from 'react'
import { askAi, buildDecisionContext, buildStudyContext, createMessage } from '../lib/ai'
import { searchJw } from '../lib/jwApi'
import { useAppStore } from '../store/useAppStore'

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
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [foundLinks, setFoundLinks] = useState<Array<{ title: string; url: string }>>([])

  const topic = topics.find((t) => t.id === activeTopicId) || topics[0]
  const decision = decisions.find((d) => d.id === activeDecisionId) || decisions[0]

  async function send(text = input) {
    const prompt = text.trim()
    if (!prompt || busy) return
    setBusy(true)
    setInput('')
    pushAiMessage(createMessage('user', prompt))

    let resultsSnippet = ''
    try {
      const results = await searchJw(prompt, { language })
      const top = results.slice(0, 6)
      setFoundLinks(top.map((r) => ({ title: r.title, url: r.url })))
      resultsSnippet = top.map((r) => `- [${r.kind}] ${r.title}: ${r.url}`).join('\n')
    } catch {
      setFoundLinks([])
    }

    const context = [
      buildStudyContext(topic, []),
      buildDecisionContext(decision, []),
      resultsSnippet ? `Risultati ricerca jw.org correlati:\n${resultsSnippet}` : '',
    ]
      .filter(Boolean)
      .join('\n\n')

    try {
      const answer = await askAi({
        prompt,
        history: useAppStore.getState().aiMessages,
        context,
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
              Cerca su jw.org e ti aiuta a elaborare pensieri, azioni e decisioni. Se la rete AI non è disponibile, usa un coach locale.
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
        <h3>Collegamenti jw.org trovati</h3>
        <p className="muted">
          L’assistente cerca prima su jw.org e usa i risultati come base, senza inventare pubblicazioni.
        </p>
        <div className="list">
          {foundLinks.map((l) => (
            <a key={l.url} className="list-item result-link" href={l.url} target="_blank" rel="noreferrer">
              <strong>{l.title}</strong>
              <span className="muted">Apri su jw.org</span>
            </a>
          ))}
          {foundLinks.length === 0 && (
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
