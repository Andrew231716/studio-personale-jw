import { useEffect, useMemo } from 'react'
import {
  BookOpenText,
  Compass,
  Home,
  MessageSquareText,
  NotebookPen,
  Settings2,
} from 'lucide-react'
import type { AppView } from './types'
import { useAppStore, VIEW_LABELS } from './store/useAppStore'
import { HomeView } from './views/HomeView'
import { ArgomentiView } from './views/ArgomentiView'
import { StudioView } from './views/StudioView'
import { DecisioniView } from './views/DecisioniView'
import { AssistenteView } from './views/AssistenteView'
import { ImpostazioniView } from './views/ImpostazioniView'

const ICONS: Record<AppView, typeof Home> = {
  home: Home,
  argomenti: BookOpenText,
  studio: NotebookPen,
  decisioni: Compass,
  assistente: MessageSquareText,
  impostazioni: Settings2,
}

function applyTheme(theme: ReturnType<typeof useAppStore.getState>['settings']['theme']) {
  const root = document.documentElement
  root.style.setProperty('--primary', theme.primary)
  root.style.setProperty('--secondary', theme.secondary)
  root.style.setProperty('--accent', theme.accent)
  root.style.setProperty('--bg', theme.background)
  root.style.setProperty('--surface', theme.surface)
  root.style.setProperty('--text', theme.text)
  root.style.setProperty('--muted', theme.muted)
  root.style.setProperty('--radius', `${theme.radius}px`)
  root.style.setProperty('--font-display', theme.fontDisplay)
  root.style.setProperty('--font-body', theme.fontBody)
  document.body.classList.remove('density-comoda', 'density-media', 'density-compatta')
  document.body.classList.add(`density-${theme.density}`)
}

export default function App() {
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const settings = useAppStore((s) => s.settings)

  useEffect(() => {
    applyTheme(settings.theme)
    document.title = settings.brandName
  }, [settings.theme, settings.brandName])

  const navItems = useMemo(
    () =>
      settings.navOrder.filter((key) => {
        if (key === 'home') return settings.features.home
        if (key === 'argomenti') return settings.features.argomenti
        if (key === 'studio') return settings.features.studio
        if (key === 'decisioni') return settings.features.decisioni
        if (key === 'assistente') return settings.features.assistente
        if (key === 'impostazioni') return settings.features.impostazioni
        return true
      }),
    [settings.navOrder, settings.features],
  )

  useEffect(() => {
    if (!navItems.includes(view) && navItems[0]) setView(navItems[0])
  }, [navItems, view, setView])

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">{settings.brandName}</div>
          <div className="brand-tag">{settings.tagline}</div>
        </div>
        <nav className="nav" aria-label="Sezioni">
          {navItems.map((key) => {
            const Icon = ICONS[key]
            return (
              <button
                key={key}
                type="button"
                className={view === key ? 'active' : ''}
                onClick={() => setView(key)}
              >
                <Icon size={18} />
                {VIEW_LABELS[key]}
              </button>
            )
          })}
        </nav>
        <div className="muted" style={{ marginTop: 'auto', fontSize: '0.78rem', opacity: 0.8 }}>
          Contenuti collegati a jw.org · dati salvati in locale
        </div>
      </aside>
      <main className="main">
        {view === 'home' && <HomeView />}
        {view === 'argomenti' && <ArgomentiView />}
        {view === 'studio' && <StudioView />}
        {view === 'decisioni' && <DecisioniView />}
        {view === 'assistente' && <AssistenteView />}
        {view === 'impostazioni' && <ImpostazioniView />}
      </main>
    </div>
  )
}
