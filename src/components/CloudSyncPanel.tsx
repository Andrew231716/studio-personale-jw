import { useEffect, useState } from 'react'
import { Check, Cloud, Copy, RefreshCw } from 'lucide-react'
import {
  adoptSyncKey,
  getCloudSyncState,
  startCloudSync,
  subscribeCloudSync,
  syncCloudNow,
} from '../lib/cloudSync'
import { useAppStore } from '../store/useAppStore'

function statusLabel(status: string): string {
  switch (status) {
    case 'ready':
      return 'Sincronizzato'
    case 'syncing':
      return 'Sincronizzazione…'
    case 'offline':
      return 'Offline'
    case 'error':
      return 'Errore'
    default:
      return 'In attesa'
  }
}

export function CloudSyncPanel() {
  const cloudSync = useAppStore((s) => s.settings.cloudSync)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const [sync, setSync] = useState(getCloudSyncState)
  const [adoptKey, setAdoptKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => subscribeCloudSync(() => setSync(getCloudSyncState())), [])

  const key = cloudSync?.syncKey || ''

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
    setBusy(true)
    setMessage('')
    try {
      await syncCloudNow()
      setMessage('Dati aggiornati sul cloud.')
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
      setMessage('Dispositivo collegato. I dati sono stati uniti.')
      await startCloudSync()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Collegamento non riuscito')
    } finally {
      setBusy(false)
      setSync(getCloudSyncState())
    }
  }

  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <p className="section-kicker">Cloud</p>
          <h2>Sincronizzazione tra dispositivi</h2>
        </div>
        <span className="badge">{statusLabel(sync.status)}</span>
      </div>
      <p className="lede">
        I tuoi studi non restano solo in questo browser: vengono salvati in cloud e si
        aggiornano automaticamente. Su iPhone/iPad usa la stessa chiave qui sotto.
      </p>

      <div className="field">
        <label className="row" style={{ gap: '0.5rem' }}>
          <input
            type="checkbox"
            checked={cloudSync?.enabled !== false}
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

      <div className="field">
        <label htmlFor="sync-key">La tua chiave sync</label>
        <div className="row" style={{ alignItems: 'stretch' }}>
          <input
            id="sync-key"
            value={key}
            readOnly
            style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.85rem' }}
          />
          <button className="btn secondary" type="button" onClick={() => void copyKey()} disabled={!key}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copiata' : 'Copia'}
          </button>
        </div>
        <p className="muted" style={{ margin: '0.35rem 0 0' }}>
          Conservala: è la password dei tuoi dati. Chi la ha può leggere e aggiornare il
          tuo studio.
        </p>
      </div>

      <div className="field">
        <label htmlFor="adopt-key">Ho già una chiave (altro dispositivo)</label>
        <input
          id="adopt-key"
          placeholder="JWS-…"
          value={adoptKey}
          onChange={(e) => setAdoptKey(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="row">
        <button
          className="btn"
          type="button"
          disabled={busy || !adoptKey.trim()}
          onClick={() => void linkOtherDevice()}
        >
          <Cloud size={16} /> Collega questa chiave
        </button>
        <button className="btn secondary" type="button" disabled={busy} onClick={() => void runSync()}>
          <RefreshCw size={16} /> {busy ? 'Sync…' : 'Sincronizza ora'}
        </button>
      </div>

      {sync.lastSyncedAt && (
        <p className="muted" style={{ margin: '0.55rem 0 0' }}>
          Ultima sync: {new Date(sync.lastSyncedAt).toLocaleString('it-IT')}
        </p>
      )}
      {(message || sync.lastError) && (
        <p className="muted" style={{ margin: '0.35rem 0 0' }}>
          {message || sync.lastError}
        </p>
      )}
    </section>
  )
}
