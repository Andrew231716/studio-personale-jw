import { useEffect, useMemo } from 'react'
import {
  BookMarked,
  BookOpenText,
  Bookmark,
  Captions,
  Compass,
  FileUp,
  History,
  Home,
  MessageSquareText,
  MessagesSquare,
  NotebookPen,
  PlayCircle,
  Settings2,
} from 'lucide-react'
import { startCloudSync } from './lib/cloudSync'
import type { AppView } from './types'
import { useAppStore, VIEW_LABELS } from './store/useAppStore'
import { HomeView } from './views/HomeView'
import { ArgomentiView } from './views/ArgomentiView'
import { SessioneView } from './views/SessioneView'
import { StudioView } from './views/StudioView'
import { DiarioView } from './views/DiarioView'
import { PdfJwpubView } from './views/PdfJwpubView'
import { VideoStudioView } from './views/VideoStudioView'
import { SalvatiView } from './views/SalvatiView'
import { LettureBibbiaView } from './views/LettureBibbiaView'
import { MinisteroView } from './views/MinisteroView'
import { DecisioniView } from './views/DecisioniView'
import { AssistenteView } from './views/AssistenteView'
import { ImpostazioniView } from './views/ImpostazioniView'
import { BrandLogo } from './components/BrandLogo'

const ICONS: Record<AppView, typeof Home> = {
  home: Home,
  argomenti: BookOpenText,
  sessione: PlayCircle,
  studio: NotebookPen,
  diario: History,
  pdfJwpub: FileUp,
  videoStudio: Captions,
  salvati: Bookmark,
  lettureBibbia: BookMarked,
  ministero: MessagesSquare,
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

  useEffect(() => {
    // Avvia sync cloud dopo l’idratazione dello store locale
    const boot = () => {
      void startCloudSync()
    }
    const persistor = useAppStore.persist
    if (persistor.hasHydrated()) boot()
    else return persistor.onFinishHydration(boot)
  }, [])

  const navItems = useMemo(
    () =>
      settings.navOrder.filter((key) => {
        if (key === 'home') return settings.features.home
        if (key === 'argomenti') return settings.features.argomenti
        if (key === 'sessione') return settings.features.sessione !== false
        if (key === 'studio') return settings.features.studio
        if (key === 'diario') return settings.features.diario !== false
        if (key === 'pdfJwpub') return settings.features.pdfJwpub !== false
        if (key === 'videoStudio') return settings.features.videoStudio !== false
        if (key === 'salvati') return settings.features.salvati !== false
        if (key === 'lettureBibbia') return settings.features.lettureBibbia !== false
        if (key === 'ministero') return settings.features.ministero !== false
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
          <BrandLogo size={44} withWordmark brandName={settings.brandName} />
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
                <Icon size={17} strokeWidth={2.1} />
                {VIEW_LABELS[key]}
              </button>
            )
          })}
        </nav>
        <div className="sidebar-foot">Contenuti da jw.org · salvati in locale</div>
      </aside>
      <main className="main">
        <div className="main-inner">
          {view === 'home' && <HomeView />}
          {view === 'argomenti' && <ArgomentiView />}
          {view === 'sessione' && <SessioneView />}
          {view === 'studio' && <StudioView />}
          {view === 'diario' && <DiarioView />}
          {view === 'pdfJwpub' && <PdfJwpubView />}
          {view === 'videoStudio' && <VideoStudioView />}
          {view === 'salvati' && <SalvatiView />}
          {view === 'lettureBibbia' && <LettureBibbiaView />}
          {view === 'ministero' && <MinisteroView />}
          {view === 'decisioni' && <DecisioniView />}
          {view === 'assistente' && <AssistenteView />}
          {view === 'impostazioni' && <ImpostazioniView />}
        </div>
      </main>
    </div>
  )
}
