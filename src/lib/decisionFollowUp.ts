import { askAi, buildDecisionContext } from './ai'
import { normalizeJwItalian } from './jwItalianTerms'
import { decisionStatusLabel } from './studyMethod'
import type { DecisionItem, StudyTopic } from '../types'

function fullDecisionContext(
  decision: DecisionItem,
  linkedTopics: StudyTopic[],
): string {
  const base = buildDecisionContext(
    decision,
    [],
    linkedTopics.map((t) => ({
      title: t.title,
      interest: t.interest,
      status: t.status,
    })),
  )
  const extra: string[] = []
  if (decision.conclusion?.trim()) {
    extra.push(`Conclusione dai dati:\n${decision.conclusion.trim()}`)
  }
  if (decision.aiElaboration?.trim()) {
    extra.push(`Elaborazione AI già fatta:\n${decision.aiElaboration.trim()}`)
  }
  if (decision.lucidityAnalysis?.trim()) {
    extra.push(
      `Analisi di lucidità (jw.org)${
        decision.lucidityAnalyzedAt
          ? ` del ${new Date(decision.lucidityAnalyzedAt).toLocaleString('it-IT')}`
          : ''
      }:\n${decision.lucidityAnalysis.trim()}`,
    )
  }
  if (decision.prayerNotes?.trim()) {
    extra.push(`Appunti di preghiera:\n${decision.prayerNotes.trim()}`)
  }
  if (decision.conclusionsSummary?.trim()) {
    extra.push(`Punto della situazione già salvato:\n${decision.conclusionsSummary.trim()}`)
  }
  return [base, ...extra].filter(Boolean).join('\n\n')
}

/** Fallback locale: raccoglie TUTTI i dati senza tagli inutili. */
export function buildLocalSituationPoint(
  decision: DecisionItem,
  linkedTopics: StudyTopic[],
): string {
  const pros = (decision.pros || []).filter((p) => p.trim())
  const cons = (decision.cons || []).filter((c) => c.trim())
  const priorities = [...(decision.priorities || [])].sort((a, b) => b.weight - a.weight)
  const materials = decision.relatedResources || []

  const sections: string[] = [
    `PUNTO DELLA SITUAZIONE — ${decision.title}`,
    `Stato: ${decisionStatusLabel(decision.status)} · Decisione ${decision.scale}`,
    '',
  ]

  if (decision.context?.trim()) {
    sections.push('Contesto', decision.context.trim(), '')
  }
  if (decision.chosenDecision?.trim()) {
    sections.push('Decisione presa', decision.chosenDecision.trim(), '')
  }
  if (decision.honestMotivations?.trim()) {
    sections.push('Motivazioni oneste', decision.honestMotivations.trim(), '')
  }
  if (priorities.length) {
    sections.push('Priorità')
    for (const p of priorities) {
      sections.push(
        `• ${p.label} (peso ${p.weight}/10)${p.note?.trim() ? `: ${p.note.trim()}` : ''}`,
      )
    }
    sections.push('')
  }
  if (pros.length) {
    sections.push('Pro')
    pros.forEach((p) => sections.push(`• ${p}`))
    sections.push('')
  }
  if (cons.length) {
    sections.push('Contro')
    cons.forEach((c) => sections.push(`• ${c}`))
    sections.push('')
  }
  if (linkedTopics.length) {
    sections.push('Argomenti di studio collegati')
    linkedTopics.forEach((t) =>
      sections.push(
        `• ${t.title}${t.status ? ` (${t.status.replace('_', ' ')})` : ''}${
          t.interest?.trim() ? ` — ${t.interest.trim().slice(0, 180)}` : ''
        }`,
      ),
    )
    sections.push('')
  }
  if (materials.length) {
    sections.push('Materiali jw.org / scritture')
    materials.forEach((r) =>
      sections.push(`• ${r.title}${r.bible ? ` [${r.bible}]` : ''}`),
    )
    sections.push('')
  }
  if (decision.conclusion?.trim()) {
    sections.push('Conclusione dai dati', decision.conclusion.trim(), '')
  }
  if (decision.aiElaboration?.trim()) {
    sections.push('Elaborazione AI', decision.aiElaboration.trim(), '')
  }
  if (decision.lucidityAnalysis?.trim()) {
    sections.push(
      'Analisi di lucidità',
      decision.lucidityAnalysis.trim(),
      '',
    )
  }
  if (decision.prayerNotes?.trim()) {
    sections.push('Preghiera', decision.prayerNotes.trim(), '')
  }

  sections.push(
    'Sintesi',
    decision.chosenDecision?.trim()
      ? `Al momento la scelta dichiarata è: «${decision.chosenDecision.trim()}». Vale la pena rivedere priorità, pro/contro e quanto emerso dalle analisi prima di fissare i passi successivi.`
      : 'La decisione presa non è ancora scritta in modo chiaro: conviene fissarla con onestà, poi definire i passi pratici.',
  )

  return normalizeJwItalian(sections.filter((l) => l !== undefined).join('\n'))
}

export function buildLocalNextSteps(
  decision: DecisionItem,
  linkedTopics: StudyTopic[],
): string {
  const chosen = decision.chosenDecision?.trim() || `valutare «${decision.title}»`
  const cons = (decision.cons || []).filter((c) => c.trim()).slice(0, 4)
  const pros = (decision.pros || []).filter((p) => p.trim()).slice(0, 4)

  const lines: string[] = [
    `DOPO LA DECISIONE — ${decision.title}`,
    '',
    'Obiettivi / passi possibili',
    `1. Pregare su come attuare: ${chosen}`,
    '2. Scrivere 1–3 azioni concrete entro 7 giorni (piccole e verificabili).',
    linkedTopics.length
      ? `3. Continuare lo studio sugli argomenti collegati: ${linkedTopics
          .map((t) => t.title)
          .slice(0, 3)
          .join('; ')}.`
      : '3. Collegare o approfondire un argomento di studio su jw.org legato alla scelta.',
    '4. Se la decisione tocca congregazione o famiglia, parlare con discrezione agli anziani o a chi di dovere.',
    '5. Rivedere tra 2–4 settimane: cosa ha funzionato, cosa va corretto.',
    '',
    'Possibili conseguenze da considerare',
  ]

  if (pros.length) {
    lines.push('Effetti positivi possibili:')
    pros.forEach((p) => lines.push(`• ${p}`))
  } else {
    lines.push('• Maggiore pace di coscienza se la scelta resta allineata ai principi biblici.')
  }

  if (cons.length) {
    lines.push('Rischi / costi da gestire:')
    cons.forEach((c) => lines.push(`• ${c}`))
  } else {
    lines.push('• Stanchezza, fraintendimenti o ritardi: meglio prevedere un ritmo sostenibile.')
  }

  lines.push(
    '• Impatto su famiglia, congregazione e ministero: da bilanciare senza trascurare la salute.',
    '• Tentazione di tornare indietro per emozioni: tenere a mente le motivazioni oneste e i materiali jw.org già usati.',
    '',
    'Nota: questi passi sono un aiuto pratico, non sostituiscono Bibbia, coscienza né consiglio degli anziani.',
  )

  return normalizeJwItalian(lines.join('\n'))
}

/** Converte tabelle markdown grezze in elenchi leggibili nel testo. */
function markdownTablesToLists(text: string): string {
  const lines = text.split('\n')
  const out: string[] = []
  let i = 0
  const splitRow = (row: string) =>
    row
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim())

  while (i < lines.length) {
    const line = lines[i]
    const next = lines[i + 1] || ''
    const isTableHeader =
      /^\s*\|.+\|\s*$/.test(line) && /^\s*\|?\s*[-:| ]+\|?\s*$/.test(next)
    if (isTableHeader) {
      const headers = splitRow(line)
      i += 2
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        const cells = splitRow(lines[i])
        const parts = headers
          .map((h, idx) => {
            const cell = (cells[idx] || '').trim()
            if (!h && !cell) return ''
            return `${h || 'Voce'}: ${cell || '—'}`
          })
          .filter(Boolean)
        if (parts.length) out.push(`• ${parts.join(' · ')}`)
        i += 1
      }
      continue
    }
    out.push(line)
    i += 1
  }
  return out.join('\n')
}

function looksTruncated(text: string): boolean {
  const t = text.trim()
  if (!t) return true
  if (/[.!?…»"')\]]\s*$/.test(t)) return false
  if (/\|/.test(t) && /\|[^|\n]*\S\s*$/.test(t)) return true
  if (/[,:;–—\-]\s*$/.test(t)) return true
  const lastWord = (t.split(/\s+/).pop() || '').replace(/[^a-zA-ZÀ-ÿ']/g, '')
  // Es. «Necessaria per serv» → parola finale troncata
  if (lastWord.length > 0 && lastWord.length <= 5) return true
  return false
}

/** Pulisce la risposta AI: niente tabelle grezze, avviso se il testo è tagliato. */
export function polishAiDecisionText(raw: string): string {
  let s = normalizeJwItalian(raw || '')
  s = markdownTablesToLists(s)
  s = s.replace(/\*{1,3}/g, '')
  s = s.replace(/\n{3,}/g, '\n\n').trim()
  if (looksTruncated(s)) {
    // Togli l’ultima riga/parola incompleta se finisce a metà
    const lines = s.split('\n')
    const last = lines[lines.length - 1] || ''
    if (/\|/.test(last) || !/[.!?…]$/.test(last.trim())) {
      lines.pop()
      s = lines.join('\n').trim()
    }
    s +=
      '\n\n—\nNota: la risposta risultava incompleta (tagliata a metà). Tocca di nuovo il pulsante per rigenerare, oppure completa a mano le parti mancanti.'
  }
  return s.trim()
}

export async function generateSituationPoint(params: {
  decision: DecisionItem
  linkedTopics: StudyTopic[]
}): Promise<string> {
  const { decision, linkedTopics } = params
  const context = fullDecisionContext(decision, linkedTopics)
  const prompt = `Fai il PUNTO DELLA SITUAZIONE su questa decisione.

Devi usare TUTTI i dati presenti nel contesto: titolo, stato, contesto, decisione presa, motivazioni oneste, priorità, pro, contro, argomenti collegati, materiali/scritture, conclusione dai dati, elaborazione AI, analisi di lucidità e appunti di preghiera.
Non inventare fatti assenti. Non omettere sezioni importanti se i dati ci sono.

Formato obbligatorio (titoli chiari, italiano JW tipico di jw.org):
1. Situazione in sintesi (4-6 frasi)
2. Cosa ho deciso (o cosa manca ancora)
3. Perché / motivazioni (anche quelle scomode)
4. Priorità e tensione tra pro e contro (elenco puntato, MAI tabelle markdown)
5. Cosa dicono i materiali e le analisi già fatte (solo se presenti nel contesto)
6. Lucidità e cautela (se c’è analisi di lucidità, usala; altrimenti indica cosa manca)
7. Punto fermo attuale (1 breve paragrafo conclusivo, chiudi con una frase completa)

Regole di scrittura:
- Solo testo semplice. VIETATO usare tabelle markdown (| col |), HTML o codice.
- Per le priorità usa righe tipo: «• Rapporto con Geova (peso 10): …»
- Completa SEMPRE fino al punto 7; non interrompere a metà frase.
- Niente «ministeriale»: usa «ministero».`

  try {
    const answer = await askAi({ prompt, context })
    if (answer?.trim()) {
      const polished = polishAiDecisionText(answer)
      const core = polished.replace(/\n\n—\nNota:[\s\S]*$/, '').trim()
      // Se l’AI taglia a metà, meglio un testo completo locale che un pezzo spezzato.
      if (polished.includes('risultava incompleta') || looksTruncated(core)) {
        return buildLocalSituationPoint(decision, linkedTopics)
      }
      return polished
    }
  } catch {
    /* fallback locale */
  }
  return buildLocalSituationPoint(decision, linkedTopics)
}

export async function generateNextStepsAndConsequences(params: {
  decision: DecisionItem
  linkedTopics: StudyTopic[]
}): Promise<string> {
  const { decision, linkedTopics } = params
  const context = fullDecisionContext(decision, linkedTopics)
  const prompt = `Dopo questa decisione, proponi OBIETTIVI / PASSI DA FARE e POSSIBILI CONSEGUENZE.

Basa tutto SOLO sui dati del contesto (scelta, motivazioni, pro/contro, priorità, analisi AI e lucidità, materiali). Non inventare eventi o persone.

Formato obbligatorio:
1. Obiettivo principale (1 frase)
2. Passi concreti numerati (5-8), realistici entro giorni/settimane
3. Possibili conseguenze positive
4. Possibili conseguenze difficili / rischi da gestire
5. Come verificare tra 2-4 settimane (2-3 domande oneste)
6. Una nota breve su preghiera e, se utile, consiglio agli anziani

Regole:
- Solo testo semplice, niente tabelle markdown.
- Completa tutte le sezioni con frasi intere (non tagliare a metà).
- Tono pratico e prudente, stile jw.org (ministero, congregazione, anziani).`

  try {
    const answer = await askAi({ prompt, context })
    if (answer?.trim()) {
      const polished = polishAiDecisionText(answer)
      const core = polished.replace(/\n\n—\nNota:[\s\S]*$/, '').trim()
      if (polished.includes('risultava incompleta') || looksTruncated(core)) {
        return buildLocalNextSteps(decision, linkedTopics)
      }
      return polished
    }
  } catch {
    /* fallback locale */
  }
  return buildLocalNextSteps(decision, linkedTopics)
}

export function canGenerateFollowUp(decision: DecisionItem | null | undefined): boolean {
  if (!decision) return false
  return Boolean(
    decision.chosenDecision?.trim() ||
      decision.honestMotivations?.trim() ||
      decision.conclusion?.trim() ||
      decision.lucidityAnalysis?.trim() ||
      decision.aiElaboration?.trim() ||
      decision.pros?.some((p) => p.trim()) ||
      decision.cons?.some((c) => c.trim()),
  )
}
