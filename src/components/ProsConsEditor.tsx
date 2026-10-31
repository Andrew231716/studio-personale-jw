import { Plus, Trash2 } from 'lucide-react'

interface Props {
  title: string
  items: string[]
  placeholder?: string
  onChange: (items: string[]) => void
  accent?: 'pro' | 'contro'
}

/** Elenco pro/contro compatto in uno spazio fisso scorribile. */
export function ProsConsEditor({
  title,
  items,
  placeholder = 'Scrivi un punto…',
  onChange,
  accent = 'pro',
}: Props) {
  const list = items.length ? items : ['']

  function setAt(idx: number, value: string) {
    const next = [...list]
    next[idx] = value
    onChange(next)
  }

  function removeAt(idx: number) {
    if (list.length <= 1) {
      onChange([''])
      return
    }
    onChange(list.filter((_, i) => i !== idx))
  }

  function add() {
    onChange([...list, ''])
  }

  return (
    <section className={`panel proscons-panel proscons-${accent}`}>
      <div className="proscons-head">
        <h3>{title}</h3>
        <span className="badge">{list.filter((x) => x.trim()).length}</span>
      </div>
      <div className="proscons-scroll">
        {list.map((item, idx) => (
          <div className="proscons-row" key={`${accent}-${idx}`}>
            <span className="proscons-num" aria-hidden>
              {idx + 1}
            </span>
            <input
              value={item}
              placeholder={placeholder}
              onChange={(e) => setAt(idx, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (idx === list.length - 1) add()
                }
              }}
              aria-label={`${title} ${idx + 1}`}
            />
            <button
              className="btn ghost small"
              type="button"
              aria-label={`Rimuovi ${title} ${idx + 1}`}
              onClick={() => removeAt(idx)}
              style={{ color: 'inherit', padding: '0.35rem' }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      <button className="btn secondary small" type="button" onClick={add}>
        <Plus size={14} /> Aggiungi
      </button>
    </section>
  )
}
