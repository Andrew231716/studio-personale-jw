import { useEffect, useState } from 'react'
import { Download, RefreshCw, X } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** Guida installazione PWA + aggiornamento service worker. */
export function PwaInstallHint() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem('jw-pwa-hint-dismissed') === '1'
    } catch {
      return false
    }
  })
  const [updateReady, setUpdateReady] = useState(false)
  const [iosHint, setIosHint] = useState(false)

  useEffect(() => {
    const isIos =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // @ts-expect-error iOS safari
      Boolean(navigator.standalone)
    setIosHint(isIos && !standalone)

    const onBip = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBip)

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (!reg) return
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing
          if (!worker) return
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              setUpdateReady(true)
            }
          })
        })
        void reg.update()
      })
    }

    return () => window.removeEventListener('beforeinstallprompt', onBip)
  }, [])

  if (dismissed && !updateReady) return null
  if (!deferred && !iosHint && !updateReady) return null

  return (
    <div className="pwa-hint" role="status">
      <div style={{ flex: 1 }}>
        {updateReady ? (
          <p style={{ margin: 0 }}>
            È disponibile un aggiornamento dell’app. Ricarica per usarlo (anche offline).
          </p>
        ) : deferred ? (
          <p style={{ margin: 0 }}>
            Installa JW Studio sulla Home: funziona meglio offline e si apre come app.
          </p>
        ) : (
          <p style={{ margin: 0 }}>
            Su iPhone/iPad: Condividi → <strong>Aggiungi a Home</strong> per usarla offline.
          </p>
        )}
      </div>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {updateReady && (
          <button
            className="btn accent small"
            type="button"
            onClick={() => window.location.reload()}
          >
            <RefreshCw size={14} /> Aggiorna
          </button>
        )}
        {deferred && !updateReady && (
          <button
            className="btn accent small"
            type="button"
            onClick={async () => {
              await deferred.prompt()
              await deferred.userChoice
              setDeferred(null)
            }}
          >
            <Download size={14} /> Installa
          </button>
        )}
        <button
          className="btn secondary small"
          type="button"
          aria-label="Chiudi"
          onClick={() => {
            setDismissed(true)
            try {
              sessionStorage.setItem('jw-pwa-hint-dismissed', '1')
            } catch {
              /* ignore */
            }
            setUpdateReady(false)
          }}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
