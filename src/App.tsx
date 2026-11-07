import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
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
  ListChecks,
  MessageSquareText,
  MessagesSquare,
  Mic,
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
import { VideoStudioView } from './views/VideoStudioView'
import { SalvatiView } from './views/SalvatiView'
import { LettureBibbiaView } from './views/LettureBibbiaView'
import { MinisteroView } from './views/MinisteroView'
import { DiscorsoView } from './views/DiscorsoView'
import { DecisioniView } from './views/DecisioniView'
import { OnlineStatus } from './components/OnlineStatus'
import { PwaInstallHint } from './components/PwaInstallHint'
import { ObiettiviDecisioniView } from './views/ObiettiviDecisioniView'
import { AssistenteView } from './views/AssistenteView'
import { ImpostazioniView } from './views/ImpostazioniView'
import { BrandLogo } from './components/BrandLogo'
import { InAppReminders } from './components/InAppReminders'
import { StudySearch } from './components/StudySearch'
import type { StudySearchResult } from './lib/studySearch'

const PdfJwpubView = lazy(() =>
  import('./views/PdfJwpubView')
    .then((module) => ({ default: module.PdfJwpubView }))
    .catch(() => ({
      default: () => (
        <p className="panel" role="status">
          Convertitore non disponibile. Quando sei online, ricarica la pagina per aprirlo.
        </p>
      ),
    })),
)

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
  discorso: Mic,
  decisioni: Compass,
  obiettiviDecisioni: ListChecks,
  assistente: MessageSquareText,
  impostazioni: Settings2,
}

/** Quante voci principali mostrare nella barra mobile (il resto va in Altro). */
const MOBILE_PRIMARY_COUNT = 5

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
  const [searchTarget, setSearchTarget] = useState<{ id: string; view: AppView } | null>(null)

  useEffect(() => {
    if (!searchTarget || view !== searchTarget.view) return
    const element = document.getElementById(searchTarget.id)
    if (element instanceof HTMLDetailsElement) element.open = true
    element?.focus()
    element?.scrollIntoView({ block: 'start' })
  }, [searchTarget, view])

  function openStudyResult(result: StudySearchResult) {
    const nextView = result.kind === 'quaderno' ? 'studio' : result.kind === 'sessione' ? 'diario' : 'salvati'
    if (result.kind === 'quaderno') {
      const state = useAppStore.getState()
      const topic = state.topics.find((item) => item.id === result.id)
      if (topic && topic.status !== 'completato') state.setActiveTopic(topic.id)
    }
    setView(nextView)
    setSearchTarget({ view: nextView, id: `studio-search-${result.kind}-${result.id}` })
  }

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

  // Focus trap leggero sul pannello «Altro» (mobile)
  useEffect(() => {
    if (!moreOpen) return
    const panel = document.getElementById('nav-more-panel')
    if (!panel) return
    const focusables = panel.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    first?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMoreOpen(false)
        return
      }
      if (e.key !== 'Tab' || focusables.length === 0) return
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [moreOpen])

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
        if (key === 'discorso') return settings.features.discorso !== false
        if (key === 'decisioni') return settings.features.decisioni
        if (key === 'obiettiviDecisioni') return settings.features.obiettiviDecisioni !== false
        if (key === 'assistente') return settings.features.assistente
        // Sempre visibile: altrimenti si può restare chiusi fuori dalle Impostazioni
        if (key === 'impostazioni') return true
        return true
      }),
    [settings.navOrder, settings.features],
  )

  // Mobile: rispetta navOrder; Home resta prima se abilitata; Impostazioni resta in Altro.
  const primaryMobile = useMemo(() => {
    const withoutSettings = navItems.filter((k) => k !== 'impostazioni')
    const home = withoutSettings.includes('home') ? (['home'] as AppView[]) : []
    const rest = withoutSettings.filter((k) => k !== 'home')
    return [...home, ...rest].slice(0, MOBILE_PRIMARY_COUNT)
  }, [navItems])

  const moreMobile = useMemo(
    () => navItems.filter((k) => !primaryMobile.includes(k)),
    [navItems, primaryMobile],
  )

  const moreActive = moreMobile.includes(view)

  useEffect(() => {
    if (!navItems.includes(view) && navItems[0] && searchTarget?.view !== view) setView(navItems[0])
  }, [navItems, view, setView, searchTarget])

  function renderNavButton(key: AppView) {
    const Icon = ICONS[key]
    return (
      <button
        key={key}
        type="button"
        className={view === key ? 'active' : ''}
        onClick={() => { setSearchTarget(null); setView(key) }}
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
                      setSearchTarget(null)
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

        <div className="sidebar-foot">Contenuti da jw.org · {settings.cloudSync?.enabled && settings.cloudSync.consent ? 'salvataggio locale e cloud' : 'salvataggio locale'}</div>
      </aside>
      <main className="main">
        <div className="main-inner">
          <OnlineStatus />
          <PwaInstallHint />
          <InAppReminders />
          <StudySearch onOpenResult={openStudyResult} />
          {view === 'home' && <HomeView />}
          {view === 'argomenti' && <ArgomentiView />}
          {view === 'sessione' && <SessioneView />}
          {view === 'studio' && <StudioView />}
          {view === 'diario' && <DiarioView key={searchTarget?.view === 'diario' ? searchTarget.id : undefined} />}
          {view === 'pdfJwpub' && (
            <Suspense fallback={<p role="status">Caricamento del convertitore…</p>}>
              <PdfJwpubView />
            </Suspense>
          )}
          {view === 'videoStudio' && <VideoStudioView />}
          {view === 'salvati' && <SalvatiView />}
          {view === 'lettureBibbia' && <LettureBibbiaView />}
          {view === 'ministero' && <MinisteroView />}
          {view === 'discorso' && <DiscorsoView />}
          {view === 'decisioni' && <DecisioniView />}
          {view === 'obiettiviDecisioni' && <ObiettiviDecisioniView />}
          {view === 'assistente' && <AssistenteView />}
          {view === 'impostazioni' && <ImpostazioniView />}
        </div>
      </main>
    </div>
  )
}
