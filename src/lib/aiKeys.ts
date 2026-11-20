import type { AiSettings } from '../types'

/** Snapshot AI per sync: con o senza segreti. */
export function aiSettingsForSync(
  ai?: AiSettings | null,
  syncKeys = false,
): AiSettings {
  const base: AiSettings = {
    provider: ai?.provider || 'free',
    geminiModel: ai?.geminiModel || 'gemini-3.1-flash-lite',
    syncAcrossDevices: ai?.syncAcrossDevices === true,
  }
  if (!syncKeys) {
    return {
      ...base,
      geminiApiKey: '',
      geminiApiKeys: [],
      groqApiKey: '',
      groqApiKeys: [],
      openRouterApiKey: '',
      openRouterApiKeys: [],
    }
  }
  return {
    ...base,
    geminiApiKey: ai?.geminiApiKey || '',
    geminiApiKeys: [...(ai?.geminiApiKeys || [])],
    groqApiKey: ai?.groqApiKey || '',
    groqApiKeys: [...(ai?.groqApiKeys || [])],
    openRouterApiKey: ai?.openRouterApiKey || '',
    openRouterApiKeys: [...(ai?.openRouterApiKeys || [])],
  }
}

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
