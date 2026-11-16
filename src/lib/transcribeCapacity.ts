import {
  collectGeminiKeys,
  collectGroqKeys,
} from './aiKeys'
import type { AiSettings } from '../types'

/** Obiettivo pratico di trascrizione (minuti audio / giorno). */
export const TRANSCRIBE_TARGET_MINUTES = 300

/**
 * Stima conservativa minuti/giorno sul piano free (chunk ~100s).
 * Gemini multimodal è più “caro”; Groq Whisper rende di più.
 */
const MINUTES_PER_GEMINI_KEY = 50
const MINUTES_PER_GROQ_KEY = 100

export function estimateTranscribeCapacity(ai?: AiSettings | null): {
  minutes: number
  target: number
  geminiKeys: number
  groqKeys: number
  ratio: number
  missingMinutes: number
  tip: string
} {
  const geminiKeys = collectGeminiKeys(ai).length
  const groqKeys = collectGroqKeys(ai).length
  const minutes = geminiKeys * MINUTES_PER_GEMINI_KEY + groqKeys * MINUTES_PER_GROQ_KEY
  const target = TRANSCRIBE_TARGET_MINUTES
  const missingMinutes = Math.max(0, target - minutes)
  const ratio = Math.min(1, minutes / target)

  let tip = ''
  if (minutes >= target) {
    tip = `Capacità stimata ~${minutes} min/giorno: obiettivo ${target} min raggiunto.`
  } else if (!geminiKeys && !groqKeys) {
    tip = `Per ~${target} min/giorno aggiungi chiavi Groq (consigliate) e/o Gemini in Impostazioni.`
  } else {
    const needGroq = Math.ceil(missingMinutes / MINUTES_PER_GROQ_KEY)
    tip = `Stima ~${minutes}/${target} min. Per arrivare a ${target}: circa +${needGroq} chiave/i Groq (o mix con Gemini).`
  }

  return { minutes, target, geminiKeys, groqKeys, ratio, missingMinutes, tip }
}
