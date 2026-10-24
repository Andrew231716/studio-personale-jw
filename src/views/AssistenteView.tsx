import { useState } from 'react'
import { JwOpenButtons } from '../components/JwOpenButtons'
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
  const [foundLinks, setFoundLinks] = useState<
    Array<{ title: string; url: string; lank?: string; docid?: string }>
  >([])

  const topic = topics.find((t) => t.id === activeTopicId) || topics[0]
  const decision = decisions.find((d) => d.id === activeDecisionId) || decisions[0]

  async function send(text = input) {
    const prompt = text.trim()
    if (!prompt || busy) return
    setBusy(true)
    setInput('')
    pushAiMessage(createMessage('user', prompt))

    let topResults: Awaited<ReturnType<typeof searchJw>> = []
    try {
      const results = await searchJw(prompt, { language })
      topResults = results.slice(0, 8)
      setFoundLinks(
        topResults.map((r) => ({ title: r.title, url: r.url, lank: r.lank, docid: r.docid })),
      )
    } catch {
      setFoundLinks([])
      topResults = []
    }

    const context = [
      buildStudyContext(topic, topResults),
      buildDecisionContext(decision, []),
      topResults.length
        ? ''
        : 'Nessun risultato jw.org trovato per questa richiesta: non inventare titoli né URL.',
    ]
      .filter(Boolean)
      .join('\n\n')

    try {
      const answer = await askAi({
        prompt,
        history: useAppStore.getState().aiMessages,
        context,
        allowedUrls: topResults.map((r) => r.url),
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
              Usa i risultati di jw.org e un linguaggio tipico delle pubblicazioni. Non inventa
              articoli né termini estranei. Se la rete AI non è disponibile, usa un coach locale.
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
        <h3>Collegamenti trovati</h3>
        <p className="muted">
          Risultati da jw.org, apribili anche in JW Library quando l’app è installata.
        </p>
        <div className="list">
          {foundLinks.map((l) => (
            <div key={`${l.url}-${l.lank || l.docid || ''}`} className="list-item">
              <strong>{l.title}</strong>
              <JwOpenButtons
                url={l.url}
                lank={l.lank}
                docid={l.docid}
                language={language}
                compact
              />
            </div>
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
