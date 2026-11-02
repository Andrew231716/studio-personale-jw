import { useEffect, useRef, useState } from 'react'
import { Bell, BookOpen, Download, Square, Upload } from 'lucide-react'
import { CloudSyncPanel } from '../components/CloudSyncPanel'
import { ICloudSyncPanel } from '../components/ICloudSyncPanel'
import {
  applyBackup,
  downloadBackup,
  mergeBackup,
  readBackupFile,
} from '../lib/backup'
import {
  TOTAL_BIBLE_CHAPTERS,
  clearOfflineBible,
  downloadFullOfflineBible,
  downloadOfflineBiblePack,
  getCachedChapterCount,
  getCachedVerseCount,
  getOfflineBibleStats,
} from '../lib/bibleText'
import {
  notificationPermission,
  requestNotificationPermission,
} from '../lib/reminders'
import type { AppView, FeatureFlags } from '../types'
import { useAppStore, VIEW_LABELS } from '../store/useAppStore'

const FEATURE_KEYS: Array<keyof FeatureFlags> = [
  'home',
  'argomenti',
  'sessione',
  'studio',
  'diario',
  'pdfJwpub',
  'videoStudio',
  'salvati',
  'lettureBibbia',
  'ministero',
  'discorso',
  'decisioni',
  'obiettiviDecisioni',
  'assistente',
  'impostazioni',
  'recentJwFeed',
  'schedule',
]

export function ImpostazioniView() {
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const updateTheme = useAppStore((s) => s.updateTheme)
  const resetTheme = useAppStore((s) => s.resetTheme)
  const fileRef = useRef<HTMLInputElement>(null)
  const [backupMsg, setBackupMsg] = useState('')
  const [backupBusy, setBackupBusy] = useState(false)
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge')
  const [notifMsg, setNotifMsg] = useState('')
  const [notifPerm, setNotifPerm] = useState(() => notificationPermission())
  const [packBusy, setPackBusy] = useState(false)
  const [packMsg, setPackMsg] = useState('')
  const [fullBusy, setFullBusy] = useState(false)
  const [fullMsg, setFullMsg] = useState('')
  const [fullProgress, setFullProgress] = useState(0)
  const [bibleStats, setBibleStats] = useState({
    chaptersIndexed: 0,
    chaptersLocal: 0,
    versesCached: 0,
    totalChapters: TOTAL_BIBLE_CHAPTERS,
    complete: false,
  })
  const fullAbortRef = useRef<AbortController | null>(null)
  const language = settings.language

  async function refreshBibleStats() {
    const stats = await getOfflineBibleStats(language)
    setBibleStats(stats)
  }

  useEffect(() => {
    void refreshBibleStats()
  }, [language])

  function moveNav(view: AppView, dir: -1 | 1) {
    const order = [...settings.navOrder]
    const idx = order.indexOf(view)
    const next = idx + dir
    if (idx < 0 || next < 0 || next >= order.length) return
    ;[order[idx], order[next]] = [order[next], order[idx]]
    updateSettings({ navOrder: order })
  }

  function exportBackup() {
    setBackupMsg('')
    try {
      const name = downloadBackup()
      setBackupMsg(`Backup scaricato: ${name}`)
    } catch (e) {
      setBackupMsg(e instanceof Error ? e.message : 'Esportazione non riuscita')
    }
  }

  async function importBackup(file: File | null) {
    if (!file) return
    setBackupBusy(true)
    setBackupMsg('')
    try {
      const backup = await readBackupFile(file)
      const when = backup.exportedAt
        ? new Date(backup.exportedAt).toLocaleString('it-IT')
        : 'data sconosciuta'
      if (importMode === 'replace') {
        const ok = window.confirm(
          `Sostituire tutti i dati locali con il backup del ${when}?\n\nI dati attuali di questo dispositivo verranno cancellati.`,
        )
        if (!ok) {
          setBackupMsg('Importazione annullata.')
          return
        }
        applyBackup(backup)
        setBackupMsg('Backup importato. I dati sono stati sostituiti.')
      } else {
        const ok = window.confirm(
          `Unire il backup del ${when} con i dati di questo dispositivo?\n\nGli elementi con lo stesso id restano nella versione più recente; il resto si somma.`,
        )
        if (!ok) {
          setBackupMsg('Importazione annullata.')
          return
        }
        mergeBackup(backup)
        setBackupMsg('Backup unito. I dati locali e quelli del file sono stati combinati.')
      }
    } catch (e) {
      setBackupMsg(e instanceof Error ? e.message : 'Importazione non riuscita')
    } finally {
      setBackupBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function enableNotifications() {
    setNotifMsg('')
    const perm = await requestNotificationPermission()
    setNotifPerm(perm)
    if (perm === 'granted') {
      setNotifMsg('Promemoria di sistema attivati per studi e obiettivi in scadenza.')
    } else if (perm === 'denied') {
      setNotifMsg('Permesso negato dal browser. Puoi riattivarlo nelle impostazioni del sito.')
    } else if (perm === 'unsupported') {
      setNotifMsg('Questo browser non supporta le notifiche.')
    } else {
      setNotifMsg('Permesso non ancora concesso.')
    }
  }

  return (
    <div className="stack">
      <CloudSyncPanel />
      <ICloudSyncPanel />

      <section className="panel">
        <h2>Identità dell’app</h2>
        <div className="grid-2">
          <div className="field">
            <label>Nome brand</label>
            <input
              value={settings.brandName}
              onChange={(e) => updateSettings({ brandName: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Lingua jw.org</label>
            <select
              value={settings.language}
              onChange={(e) => updateSettings({ language: e.target.value as 'I' | 'E' })}
            >
              <option value="I">Italiano</option>
              <option value="E">English</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label>Tagline</label>
          <input
            value={settings.tagline}
            onChange={(e) => updateSettings({ tagline: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Note sul metodo di studio</label>
          <textarea
            value={settings.studyMethodNotes}
            onChange={(e) => updateSettings({ studyMethodNotes: e.target.value })}
          />
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>Colori e aspetto</h2>
          <button className="btn secondary" type="button" onClick={resetTheme}>
            Ripristina tema
          </button>
        </div>
        <div className="color-grid">
          {(
            [
              ['primary', 'Primario'],
              ['secondary', 'Secondario'],
              ['accent', 'Accento'],
              ['background', 'Sfondo'],
              ['surface', 'Superficie'],
              ['text', 'Testo'],
              ['muted', 'Testo soft'],
            ] as const
          ).map(([key, label]) => (
            <div className="field" key={key}>
              <label>{label}</label>
              <input
                type="color"
                value={settings.theme[key]}
                onChange={(e) => updateTheme({ [key]: e.target.value })}
              />
            </div>
          ))}
        </div>
        <div className="grid-3" style={{ marginTop: '0.5rem' }}>
          <div className="field">
            <label>Raggio angoli ({settings.theme.radius}px)</label>
            <input
              type="range"
              min={0}
              max={32}
              value={settings.theme.radius}
              onChange={(e) => updateTheme({ radius: Number(e.target.value) })}
            />
          </div>
          <div className="field">
            <label>Densità</label>
            <select
              value={settings.theme.density}
              onChange={(e) =>
                updateTheme({ density: e.target.value as typeof settings.theme.density })
              }
            >
              <option value="comoda">Comoda</option>
              <option value="media">Media</option>
              <option value="compatta">Compatta</option>
            </select>
          </div>
          <div className="field">
            <label>Stile hero</label>
            <select
              value={settings.theme.heroStyle}
              onChange={(e) =>
                updateTheme({ heroStyle: e.target.value as typeof settings.theme.heroStyle })
              }
            >
              <option value="pieno">Pieno</option>
              <option value="morbido">Morbido</option>
            </select>
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label>Font titoli</label>
            <input
              value={settings.theme.fontDisplay}
              onChange={(e) => updateTheme({ fontDisplay: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Font testo</label>
            <input
              value={settings.theme.fontBody}
              onChange={(e) => updateTheme({ fontBody: e.target.value })}
            />
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Funzionalità attive</h2>
        <div className="grid-2">
          {FEATURE_KEYS.map((key) => (
            <label
              key={key}
              className="row list-item"
              style={{ cursor: key === 'impostazioni' ? 'default' : 'pointer' }}
            >
              <input
                type="checkbox"
                checked={key === 'impostazioni' ? true : settings.features[key]}
                disabled={key === 'impostazioni'}
                onChange={(e) => {
                  if (key === 'impostazioni') return
                  updateSettings({
                    features: { ...settings.features, [key]: e.target.checked },
                  })
                }}
              />
              <span>
                {featureLabel(key)}
                {key === 'impostazioni' ? ' (sempre attiva)' : ''}
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Struttura navigazione</h2>
        <p className="muted">Riordina le sezioni dell’app</p>
        <div className="list">
          {settings.navOrder.map((view) => (
            <div className="list-item row" key={view} style={{ justifyContent: 'space-between' }}>
              <strong>{VIEW_LABELS[view]}</strong>
              <div className="row">
                <button className="btn secondary" type="button" onClick={() => moveNav(view, -1)}>
                  Su
                </button>
                <button className="btn secondary" type="button" onClick={() => moveNav(view, 1)}>
                  Giù
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Promemoria</h2>
        <p className="lede">
          L’app mostra già un avviso interno per studi programmati e obiettivi in scadenza. Puoi
          anche attivare le notifiche del sistema (quando la scheda è aperta).
        </p>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <button
            className="btn accent"
            type="button"
            disabled={notifPerm === 'granted' || notifPerm === 'unsupported'}
            onClick={() => void enableNotifications()}
          >
            <Bell size={16} />{' '}
            {notifPerm === 'granted' ? 'Notifiche attive' : 'Attiva notifiche di sistema'}
          </button>
        </div>
        {notifMsg && (
          <p className="muted" style={{ margin: '0.65rem 0 0' }}>
            {notifMsg}
          </p>
        )}
      </section>

      <section className="panel">
        <h2>Bibbia offline</h2>
        <p className="lede">
          Testo TNM (edizione studio) da wol.jw.org, per i popup dei versetti anche senza rete.
          Puoi scaricare tutta la Bibbia (tutti i libri, capitoli e versetti) oppure un pacchetto
          ridotto dei libri più usati.
        </p>
        <p className="muted">
          Salvati: {bibleStats.chaptersIndexed} / {bibleStats.totalChapters} capitoli
          {bibleStats.complete ? ' · completa' : ''} · cache rapida {getCachedChapterCount()} cap. ·{' '}
          {getCachedVerseCount()} versetti aperti di recente.
        </p>
        {fullBusy && (
          <div className="bible-download-progress" aria-live="polite">
            <div className="bible-download-bar">
              <span style={{ width: `${Math.round(fullProgress * 100)}%` }} />
            </div>
            <p className="muted" style={{ margin: '0.45rem 0 0' }}>
              {fullMsg || 'Scarico…'}
            </p>
          </div>
        )}
        <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: '0.75rem' }}>
          <button
            className="btn accent"
            type="button"
            disabled={fullBusy || packBusy || !navigator.onLine}
            onClick={() => {
              void (async () => {
                const ctrl = new AbortController()
                fullAbortRef.current = ctrl
                setFullBusy(true)
                setFullProgress(0)
                setFullMsg('Collegamento a wol.jw.org…')
                try {
                  const result = await downloadFullOfflineBible({
                    language,
                    concurrency: 2,
                    signal: ctrl.signal,
                    onProgress: (info) => {
                      setFullProgress(info.ratio)
                      setFullMsg(
                        `${Math.round(info.ratio * 100)}% · ${info.done}/${info.total} · ${info.label}`,
                      )
                    },
                  })
                  await refreshBibleStats()
                  if (ctrl.signal.aborted) {
                    setFullMsg(
                      `Interrotto: ${result.chapters} nuovi, ${result.skipped} già presenti, ${result.failed} errori.`,
                    )
                  } else {
                    setFullMsg(
                      `Bibbia salvata: ${result.chapters} nuovi capitoli · ${result.skipped} già presenti · ${result.failed} errori · obiettivo ${TOTAL_BIBLE_CHAPTERS} capitoli.`,
                    )
                  }
                } catch (e) {
                  setFullMsg(e instanceof Error ? e.message : 'Download non riuscito')
                } finally {
                  fullAbortRef.current = null
                  setFullBusy(false)
                  void refreshBibleStats()
                }
              })()
            }}
          >
            <Download size={16} />{' '}
            {fullBusy
              ? 'Scarico tutta la Bibbia…'
              : bibleStats.complete
                ? 'Aggiorna tutta la Bibbia'
                : 'Scarica tutta la Bibbia'}
          </button>
          {fullBusy && (
            <button
              className="btn secondary"
              type="button"
              onClick={() => fullAbortRef.current?.abort()}
            >
              <Square size={16} /> Interrompi
            </button>
          )}
          <button
            className="btn secondary"
            type="button"
            disabled={packBusy || fullBusy || !navigator.onLine}
            onClick={() => {
              void (async () => {
                setPackBusy(true)
                setPackMsg('Scarico…')
                try {
                  const { chapters } = await downloadOfflineBiblePack({
                    language,
                    maxChaptersPerBook: 8,
                    onProgress: (r, label) =>
                      setPackMsg(`${Math.round(r * 100)}% · ${label}`),
                  })
                  setPackMsg(`Pacchetto frequente: ${chapters} capitoli salvati.`)
                  await refreshBibleStats()
                } catch (e) {
                  setPackMsg(e instanceof Error ? e.message : 'Download non riuscito')
                } finally {
                  setPackBusy(false)
                }
              })()
            }}
          >
            <BookOpen size={16} /> {packBusy ? 'Scarico…' : 'Solo pacchetto frequente'}
          </button>
          <button
            className="btn ghost"
            type="button"
            disabled={fullBusy || packBusy || bibleStats.chaptersIndexed === 0}
            onClick={() => {
              if (
                !window.confirm(
                  'Eliminare la Bibbia offline salvata su questo dispositivo? I popup richiederanno di nuovo la rete.',
                )
              ) {
                return
              }
              void (async () => {
                await clearOfflineBible(language)
                setFullMsg('Bibbia offline eliminata.')
                setPackMsg('')
                await refreshBibleStats()
              })()
            }}
          >
            Elimina Bibbia offline
          </button>
        </div>
        {!navigator.onLine && (
          <p className="network-need-hint" style={{ marginTop: '0.65rem' }}>
            Serve connessione per scaricare da wol.jw.org / jw.org.
          </p>
        )}
        {!fullBusy && fullMsg && (
          <p className="muted" style={{ margin: '0.65rem 0 0' }}>
            {fullMsg}
          </p>
        )}
        {packMsg && (
          <p className="muted" style={{ margin: '0.65rem 0 0' }}>
            {packMsg}
          </p>
        )}
        <p className="muted" style={{ margin: '0.75rem 0 0', fontSize: '0.85rem' }}>
          Fonte: wol.jw.org (Traduzione del Nuovo Mondo, edizione per lo studio). Circa{' '}
          {TOTAL_BIBLE_CHAPTERS} capitoli; il download completo può richiedere alcuni minuti.
        </p>
      </section>

      <section className="panel">
        <h2>Backup JSON</h2>
        <p className="lede">
          Salva una copia completa dei tuoi studi (argomenti, sessioni, decisioni, salvati,
          impostazioni e chiave sync). Utile come cassaforte o per passare a un altro dispositivo.
        </p>
        <div className="field">
          <label>Modalità importazione</label>
          <select
            value={importMode}
            onChange={(e) => setImportMode(e.target.value as 'merge' | 'replace')}
          >
            <option value="merge">Unisci (consigliato) — somma senza cancellare il locale</option>
            <option value="replace">Sostituisci — cancella i dati attuali e ripristina il file</option>
          </select>
        </div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <button className="btn accent" type="button" onClick={exportBackup}>
            <Download size={16} /> Esporta backup JSON
          </button>
          <button
            className="btn secondary"
            type="button"
            disabled={backupBusy}
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={16} />{' '}
            {backupBusy
              ? 'Importo…'
              : importMode === 'merge'
                ? 'Importa e unisci'
                : 'Importa e sostituisci'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => void importBackup(e.target.files?.[0] || null)}
          />
        </div>
        {backupMsg && (
          <p className="muted" style={{ margin: '0.65rem 0 0' }}>
            {backupMsg}
          </p>
        )}
      </section>

      <section className="panel">
        <h2>Dati locali</h2>
        <p className="muted">
          Tutto resta nel tuo browser (localStorage). Nessun account richiesto.
        </p>
        <button
          className="btn danger"
          type="button"
          onClick={() => {
            if (
              !window.confirm(
                'Cancellare tutti i dati locali di questo dispositivo? L’operazione non si può annullare (usa prima un backup JSON se ti serve).',
              )
            ) {
              return
            }
            void (async () => {
              await clearOfflineBible()
              localStorage.removeItem('studio-personale-jw-v1')
              localStorage.removeItem('jw-studio-bible-verse-cache-v2')
              localStorage.removeItem('jw-studio-bible-chapter-cache-v1')
              for (const key of Object.keys(localStorage)) {
                if (key.startsWith('jw-studio-bible-')) localStorage.removeItem(key)
              }
              window.location.reload()
            })()
          }}
        >
          Cancella tutti i dati locali
        </button>
        <p className="muted" style={{ margin: '0.55rem 0 0' }}>
          Include anche IndexedDB e cache della Bibbia offline salvate sul dispositivo.
        </p>
      </section>
    </div>
  )
}

function featureLabel(key: keyof FeatureFlags) {
  switch (key) {
    case 'home':
      return 'Home'
    case 'argomenti':
      return 'Argomenti'
    case 'sessione':
      return 'Sessione guidata'
    case 'studio':
      return 'Quaderno'
    case 'diario':
      return 'Diario studi'
    case 'pdfJwpub':
      return 'PDF → EPUB'
    case 'videoStudio':
      return 'Video → studio (trascrizione)'
    case 'salvati':
      return 'Da studiare (salvati)'
    case 'lettureBibbia':
      return 'Letture della Bibbia'
    case 'ministero':
      return 'Ministero'
    case 'discorso':
      return 'Discorso (appunti + microfono)'
    case 'decisioni':
      return 'Decisioni'
    case 'obiettiviDecisioni':
      return 'Obiettivi decisioni'
    case 'assistente':
      return 'Assistente AI'
    case 'impostazioni':
      return 'Impostazioni'
    case 'recentJwFeed':
      return 'Feed video recenti jw.org'
    case 'schedule':
      return 'Programma di studio'
  }
}
