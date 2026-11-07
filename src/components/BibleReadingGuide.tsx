import type { BibleReadingProgress } from '../types'
import type { buildBibleReadingGuide } from '../lib/bibleReadingGuide'
import { JwOpenButtons } from './JwOpenButtons'

interface Props {
  guide: ReturnType<typeof buildBibleReadingGuide>
  progress?: BibleReadingProgress
  language: string
  onProgress: (patch: BibleReadingProgress) => void
}

export function BibleReadingGuide({ guide, progress, language, onProgress }: Props) {
  const { intro, readings, questions, practice } = guide
  const completed = progress?.completedReadings || []
  const answers = progress?.answers || {}
  const action = progress?.action || ''
  const actionDone = Boolean(action.trim() && progress?.actionDone)
  const readCount = readings.filter(({ text }) => completed.includes(text)).length
  const answerCount = questions.filter((question) => Object.hasOwn(answers, question) && answers[question].trim()).length
  const total = readings.length + questions.length + 1
  const done = readCount + answerCount + Number(actionDone)

  return (
    <section className="bible-study stack" aria-label="Studio guidato">
      <header className="bible-study-header stack">
        <div className="row bible-study-heading">
          <h4>Studio guidato</h4>
          <span className="badge">{done} di {total} completati</span>
        </div>
        <progress aria-label="Avanzamento dello studio guidato" max={total} value={done} />
        <p className="muted">
          {done === total
            ? 'Percorso completato. Puoi ritrovare qui le tue risposte.'
            : 'Spunta le letture e scrivi le tue risposte. I progressi si salvano mentre studi.'}
        </p>
        {intro && <p>{intro}</p>}
      </header>

      <div className="bible-study-stage">
        <h4>1. Leggi e osserva</h4>
        {readings.length ? (
          <ul className="bible-study-list">
            {readings.map(({ text, scripture }) => {
              const checked = completed.includes(text)
              return (
                <li key={text}>
                  <label className="bible-study-check">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => onProgress({
                        completedReadings: event.target.checked
                          ? [...completed, text]
                          : completed.filter((item) => item !== text),
                      })}
                    />
                    <span>{text}</span>
                  </label>
                  {scripture && (
                    <JwOpenButtons
                      url={scripture.url}
                      bible={scripture.bible}
                      webLabel={scripture.label}
                      language={language}
                      compact
                    />
                  )}
                </li>
              )
            })}
          </ul>
        ) : <p className="muted">Scegli un brano collegato al tema e leggilo prima di riflettere.</p>}
      </div>

      <div className="bible-study-stage">
        <h4>2. Rifletti e rispondi</h4>
        <div className="stack">
          {questions.map((question) => (
            <label className="field" key={question}>
              <span>{question}</span>
              <textarea
                rows={2}
                placeholder="Scrivi la tua risposta"
                value={Object.hasOwn(answers, question) ? answers[question] : ''}
                onChange={(event) => onProgress({
                  answers: { ...answers, [question]: event.target.value },
                })}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="bible-study-stage">
        <h4>3. Metti in pratica</h4>
        {practice && (
          <div className="stack bible-study-suggestion">
            <p><strong>Spunto</strong> {practice}</p>
            <button
              type="button"
              className="btn secondary"
              disabled={Boolean(action.trim())}
              onClick={() => onProgress({ action: practice, actionDone: false })}
            >
              Usa questo spunto
            </button>
          </div>
        )}
        <label className="field">
          <span>La mia azione per questa settimana</span>
          <textarea
            rows={2}
            placeholder="Che cosa farò, e quando?"
            value={action}
            onChange={(event) => onProgress({ action: event.target.value, actionDone: false })}
          />
        </label>
        <label className="bible-study-check">
          <input
            type="checkbox"
            checked={actionDone}
            disabled={!action.trim()}
            onChange={(event) => onProgress({ actionDone: event.target.checked })}
          />
          <span>Ho messo in pratica la mia azione</span>
        </label>
      </div>
    </section>
  )
}
