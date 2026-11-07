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

const STUDY_NAV: AppView[] = ['sessione', 'lettureBibbia', 'argomenti']
const TOOL_GROUPS: { label: string; views: AppView[] }[] = [
  { label: 'I tuoi studi', views: ['diario', 'salvati'] },
  { label: 'Preparazione', views: ['ministero', 'discorso', 'decisioni', 'obiettiviDecisioni'] },
  { label: 'Strumenti', views: ['videoStudio', 'pdfJwpub', 'assistente', 'impostazioni'] },
]

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
  const [mobileMenu, setMobileMenu] = useState<'study' | 'more' | null>(null)
  const openBibleReadingPlan = useAppStore((s) => s.openBibleReadingPlan)
  const [searchTarget, setSearchTarget] = useState<{ id: string; view: AppView } | null>(null)

  useEffect(() => {
    if (!searchTarget || view !== searchTarget.view || view === 'lettureBibbia') return
    const element = document.getElementById(searchTarget.id)
    if (element instanceof HTMLDetailsElement) element.open = true
    element?.focus()
    element?.scrollIntoView({ block: 'start' })
  }, [searchTarget, view])

  function openStudyResult(result: StudySearchResult) {
    if (result.kind === 'lettura') {
      setSearchTarget({ view: 'lettureBibbia', id: 'reading-plan' })
      openBibleReadingPlan(result.id)
      return
    }
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
    setMobileMenu(null)
  }, [view])

  // Focus trap leggero sul pannello «Altro» (mobile)
  useEffect(() => {
    if (!mobileMenu) return
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
        setMobileMenu(null)
        document.getElementById(mobileMenu === 'study' ? 'mobile-nav-study' : 'mobile-nav-more')?.focus()
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
  }, [mobileMenu])

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

  const studyItems = navItems.filter((key) => STUDY_NAV.includes(key))
  const moreGroups = TOOL_GROUPS.map(({ label, views }) => ({
    label,
    views: navItems.filter((key) => views.includes(key)),
  })).filter((group) => group.views.length)
  const activeGroups = mobileMenu === 'study'
    ? [{ label: 'Studia', views: studyItems }]
    : moreGroups

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
        aria-current={view === key ? 'page' : undefined}
        onClick={() => {
          setSearchTarget(null)
          setMobileMenu(null)
          setView(key)
          window.scrollTo(0, 0)
        }}
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

        <nav className="nav nav-mobile" aria-label="Sezioni principali">
          {navItems.includes('home') && renderNavButton('home')}
          {studyItems.length > 0 && (
            <button
              type="button"
              id="mobile-nav-study"
              className={mobileMenu === 'study' || studyItems.includes(view) ? 'active' : ''}
              aria-expanded={mobileMenu === 'study'}
              aria-controls={mobileMenu === 'study' ? 'nav-more-panel' : undefined}
              onClick={() => setMobileMenu((menu) => menu === 'study' ? null : 'study')}
            >
              <BookOpenText size={17} strokeWidth={2.1} /> Studia
            </button>
          )}
          {navItems.includes('studio') && renderNavButton('studio')}
          <button
            type="button"
            id="mobile-nav-more"
            className={mobileMenu === 'more' || moreGroups.some((group) => group.views.includes(view)) ? 'active' : ''}
            aria-expanded={mobileMenu === 'more'}
            aria-controls={mobileMenu === 'more' ? 'nav-more-panel' : undefined}
            onClick={() => setMobileMenu((menu) => menu === 'more' ? null : 'more')}
          >
            {mobileMenu === 'more' ? <X size={17} strokeWidth={2.1} /> : <Ellipsis size={17} strokeWidth={2.1} />}
            Altro
          </button>
        </nav>

        {mobileMenu && (
          <div id="nav-more-panel" className="nav-more-panel" role="dialog" aria-label={mobileMenu === 'study' ? 'Studia' : 'Altre sezioni'}>
            {activeGroups.map((group) => (
              <div key={group.label} className="nav-more-group">
                <p className="nav-more-title">{group.label}</p>
                <div className="nav-more-grid">{group.views.map(renderNavButton)}</div>
              </div>
            ))}
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
