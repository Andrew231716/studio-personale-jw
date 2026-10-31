import { useEffect, useMemo, useState } from 'react'
import {
  BookMarked,
  BookOpenText,
  Bookmark,
  Captions,
  Compass,
  Ellipsis,
  FileUp,
  History,
  Home,
  MessageSquareText,
  MessagesSquare,
  NotebookPen,
  PlayCircle,
  Settings2,
  X,
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

/** Percorso principale su mobile (ordine fisso). Home sempre per prima. */
const PRIMARY_MOBILE: AppView[] = ['home', 'argomenti', 'sessione', 'studio', 'diario']

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
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    applyTheme(settings.theme)
    document.title = settings.brandName
  }, [settings.theme, settings.brandName])

  useEffect(() => {
    const boot = () => {
      void startCloudSync()
    }
    const persistor = useAppStore.persist
    if (persistor.hasHydrated()) boot()
    else return persistor.onFinishHydration(boot)
  }, [])

  useEffect(() => {
    setMoreOpen(false)
  }, [view])

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

  const primaryMobile = useMemo(
    () => PRIMARY_MOBILE.filter((k) => navItems.includes(k)),
    [navItems],
  )

  const moreMobile = useMemo(
    () => navItems.filter((k) => !PRIMARY_MOBILE.includes(k)),
    [navItems],
  )

  const moreActive = moreMobile.includes(view)

  useEffect(() => {
    if (!navItems.includes(view) && navItems[0]) setView(navItems[0])
  }, [navItems, view, setView])

  function renderNavButton(key: AppView) {
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
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <BrandLogo size={44} withWordmark brandName={settings.brandName} />
          <div className="brand-tag">{settings.tagline}</div>
        </div>

        {/* Desktop / tablet largo: tutte le voci */}
        <nav className="nav nav-desktop" aria-label="Sezioni">
          {navItems.map((key) => renderNavButton(key))}
        </nav>

        {/* Mobile: Home + percorso studio + Altro (in alto) */}
        <nav className="nav nav-mobile" aria-label="Sezioni principali">
          {primaryMobile.map((key) => renderNavButton(key))}
          {moreMobile.length > 0 && (
            <button
              type="button"
              className={moreOpen || moreActive ? 'active' : ''}
              aria-expanded={moreOpen}
              aria-controls="nav-more-panel"
              onClick={() => setMoreOpen((v) => !v)}
            >
              {moreOpen ? <X size={17} strokeWidth={2.1} /> : <Ellipsis size={17} strokeWidth={2.1} />}
              Altro
            </button>
          )}
        </nav>

        {moreOpen && moreMobile.length > 0 && (
          <div id="nav-more-panel" className="nav-more-panel" role="dialog" aria-label="Altre sezioni">
            <p className="nav-more-title">Altre sezioni</p>
            <div className="nav-more-grid">
              {moreMobile.map((key) => {
                const Icon = ICONS[key]
                return (
                  <button
                    key={key}
                    type="button"
                    className={view === key ? 'active' : ''}
                    onClick={() => {
                      setView(key)
                      setMoreOpen(false)
                    }}
                  >
                    <Icon size={16} strokeWidth={2.1} />
                    {VIEW_LABELS[key]}
                  </button>
                )
              })}
            </div>
          </div>
        )}

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
