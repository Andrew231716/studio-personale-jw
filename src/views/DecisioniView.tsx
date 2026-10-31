import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Link2, NotebookPen, Plus, Scale, Trash2 } from 'lucide-react'
import { ExpandableField } from '../components/ExpandableField'
import { JwSearch } from '../components/JwSearch'
import { JwOpenButtons } from '../components/JwOpenButtons'
import { ProsConsEditor } from '../components/ProsConsEditor'
import { SectionProgress } from '../components/SectionProgress'
import { askAi, buildDecisionContext, createMessage } from '../lib/ai'
import { bibleOpenUrl, parseScriptureLabel } from '../lib/bibleRefs'
import { analyzeDecisionLucidity } from '../lib/decisionLucidity'
import { normalizeJwItalian } from '../lib/jwItalianTerms'
import { DECISION_STEPS } from '../lib/studyMethod'
import { uid } from '../lib/id'
import { useAppStore } from '../store/useAppStore'
import type { JwResult, StudyResource } from '../types'

export function DecisioniView() {
  const decisions = useAppStore((s) => s.decisions)
  const topics = useAppStore((s) => s.topics)
  const activeDecisionId = useAppStore((s) => s.activeDecisionId)
  const addDecision = useAppStore((s) => s.addDecision)
  const updateDecision = useAppStore((s) => s.updateDecision)
  const removeDecision = useAppStore((s) => s.removeDecision)
  const setActiveDecision = useAppStore((s) => s.setActiveDecision)
  const recompute = useAppStore((s) => s.recomputeDecisionConclusion)
  const createTopic = useAppStore((s) => s.createTopic)
  const setActiveTopic = useAppStore((s) => s.setActiveTopic)
  const setView = useAppStore((s) => s.setView)
  const language = useAppStore((s) => s.settings.language)
  const pushAiMessage = useAppStore((s) => s.pushAiMessage)

  const [title, setTitle] = useState('')
  const [scale, setScale] = useState<'piccola' | 'grande'>('piccola')
  const [aiText, setAiText] = useState('')
  const [busy, setBusy] = useState(false)
  const [lucidityBusy, setLucidityBusy] = useState(false)
  const [lucidityError, setLucidityError] = useState('')
  const [luciditySources, setLuciditySources] = useState<JwResult[]>([])
  const [newTopicTitle, setNewTopicTitle] = useState('')
  const [verseDraft, setVerseDraft] = useState('')
  const [materialFilter, setMaterialFilter] = useState<'tutti' | 'bible' | 'video' | 'article'>('tutti')

  const decision = useMemo(
    () => decisions.find((d) => d.id === activeDecisionId) || decisions[0] || null,
    [decisions, activeDecisionId],
  )

  useEffect(() => {
    setLuciditySources([])
    setLucidityError('')
    setAiText('')
  }, [decision?.id])

  const linkedIds = decision?.linkedTopicIds || []
  const linkedTopics = useMemo(
    () => topics.filter((t) => linkedIds.includes(t.id)),
    [topics, linkedIds],
  )
  const availableTopics = useMemo(
    () => topics.filter((t) => !linkedIds.includes(t.id)),
    [topics, linkedIds],
  )

  const filteredResources = useMemo(() => {
    const list = decision?.relatedResources || []
    if (materialFilter === 'tutti') return list
    if (materialFilter === 'bible') {
      return list.filter((r) => r.kind === 'bible' || Boolean(r.bible))
    }
    if (materialFilter === 'video') return list.filter((r) => r.kind === 'video')
    return list.filter((r) => r.kind !== 'video' && r.kind !== 'bible' && !r.bible)
  }, [decision?.relatedResources, materialFilter])

  function linkTopic(topicId: string) {
    if (!decision) return
    if (linkedIds.includes(topicId)) return
    updateDecision(decision.id, { linkedTopicIds: [...linkedIds, topicId] })
  }

  function unlinkTopic(topicId: string) {
    if (!decision) return
    updateDecision(decision.id, {
      linkedTopicIds: linkedIds.filter((id) => id !== topicId),
    })
  }

  function createAndLinkTopic() {
    if (!decision || !newTopicTitle.trim()) return
    const id = createTopic(
      newTopicTitle.trim(),
      `Collegato alla decisione: ${decision.title}`,
    )
    linkTopic(id)
    setNewTopicTitle('')
  }

  function addResource(res: StudyResource) {
    if (!decision) return
    const exists = decision.relatedResources.some(
      (r) =>
        r.id === res.id ||
        (r.url && res.url && r.url === res.url) ||
        (r.bible && res.bible && r.bible === res.bible),
    )
    if (exists) return
    updateDecision(decision.id, {
      relatedResources: [res, ...decision.relatedResources],
    })
  }

  function removeResource(id: string) {
    if (!decision) return
    updateDecision(decision.id, {
      relatedResources: decision.relatedResources.filter((r) => r.id !== id),
    })
  }

  function addVerse() {
    if (!decision || !verseDraft.trim()) return
    const parsed = parseScriptureLabel(verseDraft)
    const bible = parsed.bible
    const label = verseDraft.trim()
    addResource({
      id: uid('verse'),
      title: label,
      url: bible ? bibleOpenUrl(bible, language) : `https://www.jw.org/finder?prefer=lang&wtlocale=${language}&q=${encodeURIComponent(label)}`,
      kind: 'bible',
      bible,
      notes: 'Scrittura per soppesare la decisione',
    })
    setVerseDraft('')
  }

  async function askDecisionAi() {
    if (!decision) return
    setBusy(true)
    const prompt =
      'Elabora i miei pensieri su questa decisione. Usa gli argomenti di studio collegati e i materiali jw.org (articoli, video, scritture) già elencati. Proponi una lettura dei pro/contro e delle priorità, e una conclusione prudente. Non inventare articoli o versetti non presenti nel contesto.'
    const context = buildDecisionContext(
      decision,
      [],
      linkedTopics.map((t) => ({
        title: t.title,
        interest: t.interest,
        status: t.status,
      })),
    )
    try {
      const answer = await askAi({ prompt, context })
      setAiText(answer)
      pushAiMessage(createMessage('user', prompt))
      pushAiMessage(createMessage('assistant', answer))
    } catch (e) {
      setAiText(e instanceof Error ? e.message : 'Errore AI')
    } finally {
      setBusy(false)
    }
  }

  async function runLucidityAnalysis() {
    if (!decision) return
    setLucidityBusy(true)
    setLucidityError('')
    try {
      const { analysis, sources } = await analyzeDecisionLucidity({
        decision,
        language,
        linkedTopics,
      })
      setLuciditySources(sources)
      updateDecision(decision.id, {
        lucidityAnalysis: analysis,
        lucidityAnalyzedAt: new Date().toISOString(),
        status: 'decisa',
      })
      pushAiMessage(
        createMessage(
          'user',
          `Analizza la lucidità della mia decisione «${decision.title}» con materiali di jw.org.`,
        ),
      )
      pushAiMessage(createMessage('assistant', analysis))
      requestAnimationFrame(() => {
        document
          .getElementById('decision-lucidity-result')
          ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      })
    } catch (e) {
      setLucidityError(e instanceof Error ? e.message : 'Analisi non riuscita')
    } finally {
      setLucidityBusy(false)
    }
  }

  return (
    <div className="stack">
      <SectionProgress section="decisioni" />
      <div className="split">
      <div className="stack">
        <section className="panel">
          <h2>Decisioni</h2>
          <p className="muted">
            Collega argomenti di studio, scritture e video di jw.org per soppesare meglio la scelta.
          </p>
          <div className="field">
            <label>Nuova decisione</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Es. Accettare un nuovo impegno"
            />
          </div>
          <div className="field">
            <label>Scala</label>
            <select value={scale} onChange={(e) => setScale(e.target.value as typeof scale)}>
              <option value="piccola">Piccola</option>
              <option value="grande">Grande</option>
            </select>
          </div>
          <button
            className="btn"
            type="button"
            onClick={() => {
              if (!title.trim()) return
              addDecision(title, scale)
              setTitle('')
            }}
          >
            Crea
          </button>
          <div className="list" style={{ marginTop: '1rem' }}>
            {decisions.map((d) => (
              <div
                key={d.id}
                className={`list-item ${decision?.id === d.id ? 'active' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => setActiveDecision(d.id)}
                onKeyDown={(e) => e.key === 'Enter' && setActiveDecision(d.id)}
              >
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <strong>{d.title}</strong>
                  <span className="badge">
                    {d.scale === 'grande' ? 'Grande' : 'Piccola'} ·{' '}
                    {d.status === 'decisa'
                      ? 'Decisa'
                      : d.status === 'in_valutazione'
                        ? 'In valutazione'
                        : 'Aperta'}
                  </span>
                </div>
                {(d.linkedTopicIds?.length || 0) > 0 && (
                  <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                    {d.linkedTopicIds!.length} argoment
                    {d.linkedTopicIds!.length === 1 ? 'o' : 'i'} collegat
                    {d.linkedTopicIds!.length === 1 ? 'o' : 'i'}
                  </p>
                )}
              </div>
            ))}
            {decisions.length === 0 && <div className="empty">Nessuna decisione ancora.</div>}
          </div>
        </section>

        <section className="panel">
          <h3>Metodo basato su jw.org</h3>
          <div className="steps">
            {DECISION_STEPS.map((s, i) => (
              <div className="step" key={s.id}>
                <div className="step-num">{i + 1}</div>
                <div>
                  <strong>{s.title}</strong>
                  <p className="muted" style={{ margin: '0.2rem 0 0' }}>
                    {s.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="stack">
        {!decision ? (
          <div className="panel empty">Seleziona o crea una decisione.</div>
        ) : (
          <>
            <section className="panel">
              <div className="section-head">
                <h2>{decision.title}</h2>
                <button
                  className="btn danger"
                  type="button"
                  onClick={() => removeDecision(decision.id)}
                >
                  Elimina
                </button>
              </div>
              <ExpandableField
                label="Contesto"
                value={decision.context}
                onChange={(value) => updateDecision(decision.id, { context: value })}
                placeholder="Cosa sto decidendo e perché ora?"
              />
              <ExpandableField
                label="Appunti di preghiera"
                value={decision.prayerNotes}
                onChange={(value) => updateDecision(decision.id, { prayerNotes: value })}
              />
              <div className="row">
                <select
                  value={decision.scale}
                  onChange={(e) =>
                    updateDecision(decision.id, { scale: e.target.value as typeof decision.scale })
                  }
                >
                  <option value="piccola">Piccola</option>
                  <option value="grande">Grande</option>
                </select>
                <select
                  value={decision.status}
                  onChange={(e) =>
                    updateDecision(decision.id, {
                      status: e.target.value as typeof decision.status,
                    })
                  }
                >
                  <option value="aperta">Aperta</option>
                  <option value="in_valutazione">In valutazione</option>
                  <option value="decisa">Decisa</option>
                </select>
              </div>
            </section>

            <section className="panel">
              <div className="section-head">
                <div>
                  <h3>
                    <span className="row" style={{ gap: 8 }}>
                      <Link2 size={18} /> Argomenti di studio
                    </span>
                  </h3>
                  <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                    Collega uno o più argomenti che stai studiando, oppure creane uno nuovo come base
                    per decidere.
                  </p>
                </div>
              </div>

              <div className="list">
                {linkedTopics.map((t) => (
                  <div className="list-item" key={t.id}>
                    <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong>{t.title}</strong>
                        <div className="row" style={{ gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                          <span className="badge">{t.status.replace('_', ' ')}</span>
                          {t.interest && (
                            <span className="muted" style={{ fontSize: '0.85rem' }}>
                              {t.interest.slice(0, 100)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="row" style={{ gap: 6 }}>
                        <button
                          className="btn secondary small"
                          type="button"
                          onClick={() => {
                            setActiveTopic(t.id)
                            setView('studio')
                          }}
                        >
                          <NotebookPen size={14} /> Quaderno
                        </button>
                        <button
                          className="btn secondary small"
                          type="button"
                          onClick={() => unlinkTopic(t.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {linkedTopics.length === 0 && (
                  <div className="empty">Nessun argomento collegato ancora.</div>
                )}
              </div>

              {availableTopics.length > 0 && (
                <div className="field" style={{ marginTop: '0.85rem' }}>
                  <label>Collega un argomento esistente</label>
                  <div className="chip-row">
                    {availableTopics.slice(0, 12).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className="chip"
                        onClick={() => linkTopic(t.id)}
                      >
                        + {t.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="field" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
                <label>Nuovo argomento per questa decisione</label>
                <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <input
                    value={newTopicTitle}
                    onChange={(e) => setNewTopicTitle(e.target.value)}
                    placeholder="Es. Equilibrio ministero e famiglia"
                    onKeyDown={(e) => e.key === 'Enter' && createAndLinkTopic()}
                    style={{ flex: 1, minWidth: 160 }}
                  />
                  <button
                    className="btn"
                    type="button"
                    disabled={!newTopicTitle.trim()}
                    onClick={createAndLinkTopic}
                  >
                    <Plus size={16} /> Crea e collega
                  </button>
                </div>
              </div>
            </section>

            <section className="panel">
              <h3>Priorità</h3>
              <div className="stack">
                {decision.priorities.map((p, idx) => (
                  <div className="list-item" key={p.id}>
                    <ExpandableField
                      label={`Priorità ${idx + 1}`}
                      value={p.label}
                      onChange={(value) =>
                        updateDecision(decision.id, {
                          priorities: decision.priorities.map((x) =>
                            x.id === p.id ? { ...x, label: value } : x,
                          ),
                        })
                      }
                    />
                    <div className="slider-row">
                      <input
                        type="range"
                        min={1}
                        max={10}
                        value={p.weight}
                        onChange={(e) =>
                          updateDecision(decision.id, {
                            priorities: decision.priorities.map((x) =>
                              x.id === p.id ? { ...x, weight: Number(e.target.value) } : x,
                            ),
                          })
                        }
                      />
                      <strong>{p.weight}/10</strong>
                    </div>
                    <ExpandableField
                      label={`Nota priorità ${idx + 1}`}
                      value={p.note}
                      placeholder="Nota"
                      onChange={(value) =>
                        updateDecision(decision.id, {
                          priorities: decision.priorities.map((x) =>
                            x.id === p.id ? { ...x, note: value } : x,
                          ),
                        })
                      }
                    />
                  </div>
                ))}
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() =>
                    updateDecision(decision.id, {
                      priorities: [
                        ...decision.priorities,
                        { id: uid('pri'), label: 'Nuova priorità', weight: 5, note: '' },
                      ],
                    })
                  }
                >
                  Aggiungi priorità
                </button>
              </div>
            </section>

            <div className="grid-2 proscons-grid">
              <ProsConsEditor
                title="Pro"
                accent="pro"
                items={decision.pros}
                placeholder="Un vantaggio onesto…"
                onChange={(pros) => updateDecision(decision.id, { pros })}
              />
              <ProsConsEditor
                title="Contro"
                accent="contro"
                items={decision.cons}
                placeholder="Un rischio o svantaggio…"
                onChange={(cons) => updateDecision(decision.id, { cons })}
              />
            </div>

            <section className="panel">
              <div className="section-head">
                <div>
                  <h3>Materiali per soppesare</h3>
                  <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                    Aggiungi versetti, articoli e video da jw.org che illuminano aspetti della
                    decisione.
                  </p>
                </div>
              </div>

              <div className="field">
                <label htmlFor="dec-verse">
                  <span className="row" style={{ gap: 6 }}>
                    <BookOpen size={14} /> Aggiungi una scrittura
                  </span>
                </label>
                <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <input
                    id="dec-verse"
                    value={verseDraft}
                    onChange={(e) => setVerseDraft(e.target.value)}
                    placeholder="Es. Proverbi 3:5-6, Matteo 6:33…"
                    onKeyDown={(e) => e.key === 'Enter' && addVerse()}
                    style={{ flex: 1, minWidth: 160 }}
                  />
                  <button
                    className="btn secondary"
                    type="button"
                    disabled={!verseDraft.trim()}
                    onClick={addVerse}
                  >
                    Aggiungi versetto
                  </button>
                </div>
              </div>

              <h4 style={{ margin: '0.5rem 0' }}>Cerca su jw.org</h4>
              <JwSearch
                compact
                language={language}
                seedQuery={decision.title}
                onAddResource={addResource}
              />

              <div className="chip-row" style={{ marginTop: '0.85rem' }}>
                {(
                  [
                    ['tutti', 'Tutti'],
                    ['bible', 'Scritture'],
                    ['article', 'Articoli'],
                    ['video', 'Video'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`chip ${materialFilter === id ? 'active' : ''}`}
                    onClick={() => setMaterialFilter(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="list" style={{ marginTop: '0.6rem' }}>
                {filteredResources.map((r) => (
                  <div className="list-item" key={r.id}>
                    <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong>{r.title}</strong>
                        <div className="row" style={{ gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                          <span className="badge">
                            {r.bible || r.kind === 'bible'
                              ? 'Scrittura'
                              : r.kind === 'video'
                                ? 'Video'
                                : 'Articolo'}
                          </span>
                          {r.notes && (
                            <span className="muted" style={{ fontSize: '0.85rem' }}>
                              {r.notes.slice(0, 90)}
                            </span>
                          )}
                        </div>
                        <div style={{ marginTop: 6 }}>
                          <JwOpenButtons
                            url={r.url}
                            wolUrl={r.wolUrl}
                            lank={r.lank}
                            docid={r.docid}
                            bible={r.bible}
                            pub={r.pub}
                            language={language}
                            compact
                            webLabel={r.bible || r.kind === 'bible' ? r.title : undefined}
                          />
                        </div>
                      </div>
                      <button
                        className="btn secondary small"
                        type="button"
                        onClick={() => removeResource(r.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                {filteredResources.length === 0 && (
                  <div className="empty">
                    Aggiungi scritture o cerca articoli/video da collegare a questa decisione.
                  </div>
                )}
              </div>
            </section>

            <section className="panel">
              <div className="section-head">
                <h3>Conclusione dai dati</h3>
                <div className="row">
                  <button className="btn" type="button" onClick={() => recompute(decision.id)}>
                    Genera conclusione
                  </button>
                  <button
                    className="btn secondary"
                    type="button"
                    disabled={busy}
                    onClick={() => void askDecisionAi()}
                  >
                    {busy ? 'AI in corso…' : 'AI: elabora decisione'}
                  </button>
                </div>
              </div>
              <ExpandableField
                label="Conclusione"
                value={decision.conclusion}
                onChange={(value) => updateDecision(decision.id, { conclusion: value })}
                rows={8}
              />
              {aiText && (
                <div className="analysis-box" role="region" aria-label="Elaborazione AI">
                  {normalizeJwItalian(aiText)}
                </div>
              )}
            </section>

            <section className="panel">
              <div className="section-head">
                <div>
                  <p className="section-kicker">Onestà e lucidità</p>
                  <h3>La decisione che ho preso</h3>
                  <p className="lede">
                    Scrivi con onestà cosa hai scelto e perché. Poi l’analisi usa solo materiali di
                    jw.org per capire se la scelta risulta ragionevole e lucida, senza lasciarsi
                    guidare troppo dalle emozioni.
                  </p>
                </div>
              </div>

              <ExpandableField
                label="Decisione presa"
                value={decision.chosenDecision || ''}
                onChange={(value) =>
                  updateDecision(decision.id, {
                    chosenDecision: value,
                    status: value.trim() ? 'decisa' : decision.status,
                  })
                }
                placeholder="Es. Ho deciso di accettare / rifiutare / rimandare…"
                rows={3}
              />
              <ExpandableField
                label="Motivazioni oneste"
                value={decision.honestMotivations || ''}
                onChange={(value) =>
                  updateDecision(decision.id, { honestMotivations: value })
                }
                placeholder="Scrivi davvero perché l’hai scelta: anche paure, desideri, stanchezza o pressioni. L’onestà aiuta l’analisi."
                rows={8}
              />

              <div className="row" style={{ marginTop: '0.75rem', flexWrap: 'wrap', gap: 8 }}>
                <button
                  className="btn accent"
                  type="button"
                  disabled={
                    lucidityBusy ||
                    !(decision.chosenDecision || '').trim() ||
                    !(decision.honestMotivations || '').trim()
                  }
                  onClick={() => void runLucidityAnalysis()}
                >
                  <Scale size={16} />
                  {lucidityBusy
                    ? 'Analisi con jw.org…'
                    : 'Analizza lucidità e buon senso (jw.org)'}
                </button>
                {(decision.chosenDecision || '').trim() && (
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => updateDecision(decision.id, { status: 'decisa' })}
                  >
                    Segna come decisa
                  </button>
                )}
              </div>

              {lucidityError && (
                <p className="error-text" style={{ marginTop: '0.65rem' }}>
                  {lucidityError}
                </p>
              )}

              {decision.lucidityAnalysis && (
                <div
                  id="decision-lucidity-result"
                  className="analysis-result"
                  style={{ marginTop: '1rem', minWidth: 0 }}
                >
                  <div className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <strong>Analisi di lucidità</strong>
                    {decision.lucidityAnalyzedAt && (
                      <span className="muted" style={{ fontSize: '0.85rem' }}>
                        {new Date(decision.lucidityAnalyzedAt).toLocaleString('it-IT')}
                      </span>
                    )}
                  </div>
                  <div
                    className="analysis-box"
                    role="region"
                    aria-label="Analisi di lucidità"
                  >
                    {normalizeJwItalian(decision.lucidityAnalysis)}
                  </div>
                </div>
              )}

              {luciditySources.length > 0 && (
                <div style={{ marginTop: '1rem', minWidth: 0 }}>
                  <strong>Fonti jw.org usate per l’analisi</strong>
                  <div className="list" style={{ marginTop: '0.5rem' }}>
                    {luciditySources.slice(0, 8).map((r) => (
                      <div className="list-item" key={`${r.id}-${r.url}`}>
                        <strong style={{ overflowWrap: 'anywhere' }}>{r.title}</strong>
                        {r.snippet && (
                          <p
                            className="muted"
                            style={{ margin: '0.25rem 0 0', overflowWrap: 'anywhere' }}
                          >
                            {r.snippet.slice(0, 140)}
                          </p>
                        )}
                        <div style={{ marginTop: 6 }}>
                          <JwOpenButtons
                            url={r.url}
                            lank={r.lank}
                            docid={r.docid}
                            language={language}
                            compact
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>
      </div>
    </div>
  )
}
