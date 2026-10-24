/** Indici MEPS usati nei .jwpub / catalogo JW Library. */
export type JwLanguageLetter = 'I' | 'E'

/** 0=English, 1=Spanish, 2=German, 4=Italian, … */
export function mepsLanguageIndex(letter: JwLanguageLetter = 'I'): number {
  if (letter === 'E') return 0
  return 4
}

export function languageLetterFromSettings(language: 'I' | 'E' | string | undefined): JwLanguageLetter {
  return language === 'E' ? 'E' : 'I'
}
