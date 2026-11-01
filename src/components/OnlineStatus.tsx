import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'

/** Banner sottile quando l’app è offline. */
export function OnlineStatus() {
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    setOnline(navigator.onLine)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  if (online) return null

  return (
    <div className="offline-banner" role="status">
      <WifiOff size={14} />
      <span>
        Sei offline. Disponibili: Discorso, Quaderno, Diario, Decisioni, appunti e versetti già
        in cache/pacchetto. Richiedono rete: AI, ricerca jw.org, sync e nuovi capitoli Bibbia.
      </span>
    </div>
  )
}
