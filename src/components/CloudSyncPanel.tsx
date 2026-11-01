import { useEffect, useState } from 'react'
import { Check, Cloud, Copy, KeyRound, RefreshCw } from 'lucide-react'
import {
  adoptSyncKey,
  getCloudSyncState,
  isValidSyncKey,
  startCloudSync,
  subscribeCloudSync,
  syncCloudNow,
} from '../lib/cloudSync'
import { useAppStore } from '../store/useAppStore'

function statusLabel(status: string, error?: string | null): string {
  switch (status) {
    case 'ready':
      return 'Sincronizzato'
    case 'syncing':
      return 'Sincronizzazione…'
    case 'offline':
      return 'Offline'
    case 'error':
      if (error && /non configurata|API non disponibile|anteprima/i.test(error)) {
        return 'Non disponibile qui'
      }
      return 'Errore'
    default:
      return 'In attesa'
  }
}

function maskKey(key: string): string {
  if (key.length < 16) return key
  return `${key.slice(0, 8)}…${key.slice(-6)}`
}

/** Pannello sync: chiave salvata + un solo tocco «Sincronizza». */
export function CloudSyncPanel({ compact = false }: { compact?: boolean }) {
  const cloudSync = useAppStore((s) => s.settings.cloudSync)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const [sync, setSync] = useState(getCloudSyncState)
  const [adoptKey, setAdoptKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [message, setMessage] = useState('')
  const [showChangeKey, setShowChangeKey] = useState(false)

  useEffect(() => subscribeCloudSync(() => setSync(getCloudSyncState())), [])

  const key = cloudSync?.syncKey || ''
  const hasSavedKey = isValidSyncKey(key)
  const enabled = cloudSync?.enabled !== false

  async function copyKey() {
    if (!key) return
    try {
      await navigator.clipboard.writeText(key)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setMessage('Copia non riuscita: seleziona la chiave manualmente.')
    }
  }

  async function runSync() {
    if (!hasSavedKey) {
      setMessage('Prima collega o genera una chiave sync.')
      setShowChangeKey(true)
      return
    }
    setBusy(true)
    setMessage('')
    try {
      // Assicura che resti abilitata e salvata
      updateSettings({ cloudSync: { enabled: true, syncKey: key } })
      await syncCloudNow()
      setMessage('Dati aggiornati tra i dispositivi.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Sync non riuscita')
    } finally {
      setBusy(false)
      setSync(getCloudSyncState())
    }
  }

  async function linkOtherDevice() {
    setBusy(true)
    setMessage('')
    try {
      await adoptSyncKey(adoptKey)
      setAdoptKey('')
      setShowChangeKey(false)
      setMessage('Chiave salvata su questo dispositivo. Tocca Sincronizza quando vuoi.')
      await startCloudSync()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Collegamento non riuscito')
    } finally {
      setBusy(false)
      setSync(getCloudSyncState())
    }
  }

  if (compact) {
    return (
      <div className="sync-compact">
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <strong>Sync cloud</strong>
            <p className="muted" style={{ margin: '0.15rem 0 0' }}>
              {hasSavedKey
                ? `Chiave salvata · ${statusLabel(sync.status, sync.lastError)}`
                : 'Nessuna chiave salvata'}
            </p>
          </div>
          <button
            className="btn"
            type="button"
            disabled={busy || !hasSavedKey || !enabled}
            onClick={() => void runSync()}
          >
            <RefreshCw size={16} />
            {busy ? 'Sync…' : 'Sincronizza'}
          </button>
        </div>
        {message && (
          <p className="muted" style={{ margin: '0.45rem 0 0' }}>
            {message}
          </p>
        )}
      </div>
    )
  }

  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <p className="section-kicker">Cloud</p>
          <h2>Sincronizzazione tra dispositivi</h2>
        </div>
        <span className="badge">{statusLabel(sync.status, sync.lastError)}</span>
      </div>
      <p className="lede">
        Inserisci una volta la chiave di backup: resta salvata qui. Poi basta toccare
        <strong> Sincronizza</strong> per aggiornare i dati da un dispositivo all’altro.
      </p>

      {hasSavedKey ? (
        <>
          <div className="sync-saved">
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <KeyRound size={18} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>Chiave salvata su questo dispositivo</strong>
                <p
                  className="muted"
                  style={{
                    margin: '0.2rem 0 0',
                    fontFamily: 'ui-monospace, monospace',
                    fontSize: '0.85rem',
                    wordBreak: 'break-all',
                  }}
                >
                  {maskKey(key)}
                </p>
              </div>
              <button className="btn secondary small" type="button" onClick={() => void copyKey()}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copiata' : 'Copia'}
              </button>
            </div>
          </div>

          <div className="field" style={{ marginTop: '0.85rem' }}>
            <label className="row" style={{ gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) =>
                  updateSettings({
                    cloudSync: {
                      enabled: e.target.checked,
                      syncKey: key,
                    },
                  })
                }
              />
              Sync automatica attiva
            </label>
          </div>

          <button
            className="btn"
            type="button"
            style={{ width: '100%', marginTop: '0.35rem' }}
            disabled={busy || !enabled}
            onClick={() => void runSync()}
          >
            <RefreshCw size={16} />
            {busy ? 'Sincronizzazione…' : 'Sincronizza'}
          </button>

          {sync.lastSyncedAt && (
            <p className="muted" style={{ margin: '0.55rem 0 0' }}>
              Ultima sync: {new Date(sync.lastSyncedAt).toLocaleString('it-IT')}
            </p>
          )}

          <button
            className="btn ghost"
            type="button"
            style={{ marginTop: '0.75rem', color: 'inherit' }}
            onClick={() => setShowChangeKey((v) => !v)}
          >
            {showChangeKey ? 'Nascondi' : 'Cambia / collega un’altra chiave'}
          </button>
        </>
      ) : (
        <div className="sync-saved">
          <p style={{ margin: 0 }}>
            Nessuna chiave ancora. Generane una nuova (si crea automaticamente) oppure collega
            quella di un altro dispositivo.
          </p>
          <button
            className="btn"
            type="button"
            style={{ marginTop: '0.75rem' }}
            disabled={busy}
            onClick={() => {
              setShowChangeKey(true)
              void startCloudSync().then(() => setSync(getCloudSyncState()))
            }}
          >
            <Cloud size={16} /> Attiva sync su questo dispositivo
          </button>
        </div>
      )}

      {(showChangeKey || !hasSavedKey) && (
        <div style={{ marginTop: '1rem' }}>
          <div className="field">
            <label htmlFor="adopt-key">Incolla la chiave di backup (JWS-…)</label>
            <input
              id="adopt-key"
              placeholder="JWS-…"
              value={adoptKey}
              onChange={(e) => setAdoptKey(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <button
            className="btn secondary"
            type="button"
            disabled={busy || !adoptKey.trim()}
            onClick={() => void linkOtherDevice()}
          >
            <Cloud size={16} /> Salva questa chiave e collega
          </button>
          <p className="muted" style={{ margin: '0.45rem 0 0' }}>
            Dopo il salvataggio non serve più reincollarla: userai solo «Sincronizza».
          </p>
        </div>
      )}

      {(message || sync.lastError) && (
        <p className="muted" style={{ margin: '0.65rem 0 0' }}>
          {message || sync.lastError}
        </p>
      )}
    </section>
  )
}
