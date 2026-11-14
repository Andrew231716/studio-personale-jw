import { useEffect, useState, type RefObject } from 'react'

export function ViewIndex({ area, scope }: { area: string; scope: RefObject<HTMLDivElement | null> }) {
  const [links, setLinks] = useState<{ id: string; label: string }[]>([])
  useEffect(() => {
    const element = scope.current
    if (!element) return
    function update() {
      const headings = Array.from(element!.querySelectorAll<HTMLHeadingElement>('h2, h3'))
        .filter((heading) => !heading.closest('[hidden], details:not([open])'))
      const items = headings.map((heading, index) => {
        heading.id ||= `jw-${area}-heading-${index}`
        return { id: heading.id, label: heading.textContent?.trim() || '' }
      }).filter((item) => item.label)
      setLinks((previous) => JSON.stringify(previous) === JSON.stringify(items) ? previous : items)
    }
    update()
    const observer = new MutationObserver(update)
    observer.observe(element, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['open', 'hidden'] })
    return () => observer.disconnect()
  }, [area, scope])

  if (links.length < 3) return null
  return <details className="jw-view-index" key={area}>
    <summary>Vai a un punto della pagina</summary>
    <nav aria-label="Indice della pagina">
      {links.map((item) => <button type="button" className="btn secondary small" key={item.id}
        onClick={() => document.getElementById(item.id)?.scrollIntoView({ block: 'start' })}>{item.label}</button>)}
    </nav>
  </details>
}
