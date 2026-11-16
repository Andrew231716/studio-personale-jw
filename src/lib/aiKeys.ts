import type { AiSettings } from '../types'

/** Unisce chiave principale + aggiuntive, senza duplicati. */
export function collectGeminiKeys(ai?: AiSettings | null): string[] {
  const raw = [ai?.geminiApiKey, ...(ai?.geminiApiKeys || [])]
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of raw) {
    const key = String(value || '').trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}

export function parseGeminiKeysText(text: string): string[] {
  return collectGeminiKeys({
    geminiApiKeys: String(text || '')
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  })
}
