import { useEffect, useState } from 'react'
import { Cloud, RefreshCw } from 'lucide-react'
import {
  getICloudSyncState,
  isICloudConfigured,
  resolveICloudConfig,
  startICloudSync,
  subscribeICloudSync,
  syncICloudNow,
} from '../lib/icloud'
import { useAppStore } from '../store/useAppStore'

function statusLabel(status: string): string {
  switch (status) {
    case 'ready':
      return 'Sincronizzato con iCloud'
    case 'syncing':
      return 'Sincronizzazione in corso…'
    case 'signed_out':
      return 'Accedi con il tuo Apple ID'
    case 'unconfigured':
      return 'Configura Container e API Token'
    case 'error':
      return 'Errore di sincronizzazione'
    default:
      return status
  }
}

export function ICloudSyncPanel() {
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const iCloud = settings.iCloud || {
    enabled: true,
    containerId: '',
    apiToken: '',
    environment: 'development' as const,
  }

  const [sync, setSync] = useState(getICloudSyncState)
  const [busy, setBusy] = useState(false)

  useEffect(() => subscribeICloudSync(() => setSync(getICloudSyncState())), [])

  const config = resolveICloudConfig(settings)
  const configured = isICloudConfigured(config)

  function patchICloud(patch: Partial<typeof iCloud>) {
    updateSettings({
      iCloud: { ...iCloud, ...patch },
    })
  }

  async function connect() {
    setBusy(true)
    try {
      await startICloudSync()
      setSync(getICloudSyncState())
    } finally {
      setBusy(false)
    }
  }

  async function syncNow() {
    setBusy(true)
    try {
      await syncICloudNow()
      setSync(getICloudSyncState())
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <p className="section-kicker">iCloud</p>
          <h2>Sincronizzazione</h2>
        </div>
        <span className="badge">{statusLabel(sync.status)}</span>
      </div>
      <p className="lede">
        Argomenti, sessioni, diario, decisioni e impostazioni restano nel tuo database privato
        iCloud (CloudKit) e si aggiornano su tutti i dispositivi dove accedi con lo stesso Apple ID.
      </p>

      <div className="field">
        <label className="row" style={{ gap: '0.5rem' }}>
          <input
            type="checkbox"
            checked={iCloud.enabled}
            onChange={(e) => patchICloud({ enabled: e.target.checked })}
          />
          Abilita sync iCloud
        </label>
      </div>

      <div className="grid-2">
        <div className="field">
          <label htmlFor="ck-container">Container ID</label>
          <input
            id="ck-container"
            placeholder="iCloud.com.tuodominio.jwstudio"
            value={iCloud.containerId}
            onChange={(e) => patchICloud({ containerId: e.target.value })}
            autoComplete="off"
          />
        </div>
        <div className="field">
          <label htmlFor="ck-env">Ambiente</label>
          <select
            id="ck-env"
            value={iCloud.environment}
            onChange={(e) =>
              patchICloud({
                environment: e.target.value as 'development' | 'production',
              })
            }
          >
            <option value="development">Development</option>
            <option value="production">Production</option>
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="ck-token">API Token CloudKit</label>
        <input
          id="ck-token"
          type="password"
          placeholder="Token da CloudKit Dashboard"
          value={iCloud.apiToken}
          onChange={(e) => patchICloud({ apiToken: e.target.value })}
          autoComplete="off"
        />
      </div>

      <div className="list-item">
        <strong>Come attivarlo (una volta)</strong>
        <ol style={{ margin: '0.35rem 0 0', paddingLeft: '1.2rem' }}>
          <li>
            Su{' '}
            <a href="https://icloud.developer.apple.com" target="_blank" rel="noreferrer">
              CloudKit Dashboard
            </a>{' '}
            crea un container (es. <code>iCloud.com.tuonome.jwstudio</code>).
          </li>
          <li>
            In Schema → Record Types crea <code>StudioData</code> con campi{' '}
            <code>payload</code> (String), <code>revision</code> (Int64),{' '}
            <code>updatedAt</code> (String).
          </li>
          <li>
            In API Access crea un API Token e autorizza il dominio{' '}
            <code>studio-personale-jw.vercel.app</code> (e <code>localhost</code> per prove).
          </li>
          <li>Incolla Container ID e Token qui, poi accedi con Apple ID.</li>
        </ol>
      </div>

      <div className="row" style={{ marginTop: '0.5rem', alignItems: 'center' }}>
        <div id="apple-sign-in-button" />
        <div id="apple-sign-out-button" />
        <button
          className="btn"
          type="button"
          disabled={busy || !configured || !iCloud.enabled}
          onClick={() => void connect()}
        >
          <Cloud size={16} /> {busy ? 'Connetto…' : 'Collega iCloud'}
        </button>
        <button
          className="btn secondary"
          type="button"
          disabled={busy || sync.status === 'signed_out' || sync.status === 'unconfigured'}
          onClick={() => void syncNow()}
        >
          <RefreshCw size={16} /> Sincronizza ora
        </button>
      </div>

      {sync.userLabel && (
        <p className="muted" style={{ margin: '0.5rem 0 0' }}>
          Account: {sync.userLabel}
          {sync.lastSyncedAt
            ? ` · Ultima sync: ${new Date(sync.lastSyncedAt).toLocaleString('it-IT')}`
            : ''}
        </p>
      )}
      {sync.lastError && (
        <p className="muted" style={{ margin: '0.35rem 0 0', color: '#8b3a3a' }}>
          {sync.lastError}
        </p>
      )}
      {!configured && (
        <p className="footnote" style={{ marginTop: '0.75rem' }}>
          Finché non inserisci Container e Token, i dati restano solo su questo dispositivo
          (memoria del browser).
        </p>
      )}
    </section>
  )
}
