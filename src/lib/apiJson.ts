/** Legge JSON da una Response API; evita errori grezzi se arriva HTML (es. SPA senza /api). */
export async function readApiJson<T = unknown>(
  res: Response,
  fallbackError = 'Servizio non disponibile',
): Promise<T> {
  const type = (res.headers.get('content-type') || '').toLowerCase()
  const text = await res.text()
  const trimmed = text.trim()

  if (
    type.includes('text/html') ||
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<html')
  ) {
    throw new Error(
      'API non disponibile in questa anteprima. Avvia l’app con `npm start` oppure usa il sito pubblicato.',
    )
  }

  if (!trimmed) {
    if (!res.ok) throw new Error(`${fallbackError} (${res.status})`)
    return {} as T
  }

  let data: T
  try {
    data = JSON.parse(trimmed) as T
  } catch {
    throw new Error(
      res.ok
        ? 'Risposta non valida dal server.'
        : `${fallbackError} (${res.status})`,
    )
  }

  if (!res.ok) {
    const err =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error?: unknown }).error || fallbackError)
        : `${fallbackError} (${res.status})`
    throw new Error(err)
  }

  return data
}
