import type { AiSettings } from '../types'

function uniqKeys(values: Array<string | undefined | null>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const key = String(value || '').trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}

/** Unisce chiave principale + aggiuntive, senza duplicati. */
export function collectGeminiKeys(ai?: AiSettings | null): string[] {
  return uniqKeys([ai?.geminiApiKey, ...(ai?.geminiApiKeys || [])])
}

export function collectGroqKeys(ai?: AiSettings | null): string[] {
  return uniqKeys([ai?.groqApiKey, ...(ai?.groqApiKeys || [])])
}

export function collectOpenRouterKeys(ai?: AiSettings | null): string[] {
  return uniqKeys([ai?.openRouterApiKey, ...(ai?.openRouterApiKeys || [])])
}

export function parseKeysText(text: string): string[] {
  return uniqKeys(
    String(text || '')
      .split(/[\n,;]+/)
      .map((s) => s.trim()),
  )
}

/** @deprecated usa parseKeysText */
export function parseGeminiKeysText(text: string): string[] {
  return parseKeysText(text)
}
