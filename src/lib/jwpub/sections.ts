/**
 * Sezioni JW Library (vista Pubblicazioni → Per tipo).
 * Codici ricavati dai manifest ufficiali .jwpub (bk, brch, trct, …).
 */
export type JwpubSectionId = 'libri' | 'opuscoli' | 'trattati' | 'libretti' | 'manuali'

export interface JwpubSection {
  id: JwpubSectionId
  /** Etichetta in italiano per l’UI. */
  label: string
  /** Descrizione breve. */
  hint: string
  /** Valore Publication.PublicationType / manifest.publicationType */
  publicationType: string
  /** Publication.PublicationCategorySymbol (categoria principale). */
  categorySymbol: string
  /** Righe in PublicationCategory + manifest.categories */
  categories: string[]
}

export const JWPUB_SECTIONS: JwpubSection[] = [
  {
    id: 'libri',
    label: 'Libri',
    hint: 'Come “Cosa insegna realmente la Bibbia?”',
    publicationType: 'Book',
    categorySymbol: 'bk',
    categories: ['bk'],
  },
  {
    id: 'opuscoli',
    label: 'Opuscoli',
    hint: 'Come “Una buona notizia da parte di Dio!”',
    publicationType: 'Brochure',
    categorySymbol: 'brch',
    categories: ['brch'],
  },
  {
    id: 'trattati',
    label: 'Trattati',
    hint: 'Come i trattati T-##',
    publicationType: 'Tract',
    categorySymbol: 'trct',
    categories: ['trct'],
  },
  {
    id: 'libretti',
    label: 'Libretti',
    hint: 'Come “Esaminiamo le Scritture”',
    publicationType: 'Booklet',
    categorySymbol: 'bklt',
    categories: ['bklt'],
  },
  {
    id: 'manuali',
    label: 'Manuali / linee guida',
    hint: 'Sezione manuali personali',
    publicationType: 'Manual/Guidelines',
    categorySymbol: 'manual',
    categories: ['manual'],
  },
]

export function getJwpubSection(id: JwpubSectionId = 'opuscoli'): JwpubSection {
  return JWPUB_SECTIONS.find((s) => s.id === id) ?? JWPUB_SECTIONS[1]
}
