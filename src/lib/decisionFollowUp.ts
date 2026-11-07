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

function clip(text: string, max: number): string {
  const t = text.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1).trim()}…`
}

/**
 * Riassunto della decisione presa (stile narrativo), usando tutti i dati
 * senza diventare un inventario campo-per-campo.
 */
export function buildLocalSituationPoint(
  decision: DecisionItem,
  linkedTopics: StudyTopic[],
): string {
  const pros = (decision.pros || []).filter((p) => p.trim())
  const cons = (decision.cons || []).filter((c) => c.trim())
  const priorities = [...(decision.priorities || [])]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
  const materials = (decision.relatedResources || []).slice(0, 6)
  const chosen = decision.chosenDecision?.trim()
  const motives = decision.honestMotivations?.trim()
  const conclusion = decision.conclusion?.trim()
  const lucidity = decision.lucidityAnalysis?.trim()
  const ai = decision.aiElaboration?.trim()
  const prayer = decision.prayerNotes?.trim()

  const parts: string[] = []

  parts.push(
    chosen
      ? `Ho deciso: ${chosen}`
      : `Sto ancora valutando «${decision.title}» (${decisionStatusLabel(decision.status)}).`,
  )

  if (decision.context?.trim()) {
    parts.push(`Contesto: ${clip(decision.context, 320)}`)
  }

  if (motives) {
    parts.push(`Perché (in sintesi): ${clip(motives, 420)}`)
  }

  if (priorities.length) {
    parts.push(
      `Priorità che pesano di più: ${priorities
        .map((p) => `${p.label} (${p.weight}/10)`)
        .join('; ')}.`,
    )
  }

  if (pros.length || cons.length) {
    parts.push(
      `Ho considerato ${pros.length} pro e ${cons.length} contro` +
        (pros[0] ? `, tra cui a favore «${clip(pros[0], 100)}»` : '') +
        (cons[0] ? ` e come cautela «${clip(cons[0], 100)}»` : '') +
        '.',
    )
  }

  if (conclusion) {
    parts.push(`Dalla conclusione sui dati: ${clip(conclusion, 380)}`)
  }

  if (ai) {
    parts.push(`Dall’elaborazione AI: ${clip(ai, 380)}`)
  }

  if (lucidity) {
    parts.push(
      `Dopo l’analisi di lucidità: ${clip(lucidity, 380)}`,
    )
  }

  if (linkedTopics.length || materials.length) {
    const topicBit = linkedTopics.length
      ? `argomenti (${linkedTopics
          .map((t) => t.title)
          .slice(0, 3)
          .join(', ')})`
      : ''
    const matBit = materials.length
      ? `materiali jw.org (${materials
          .map((r) => r.title)
          .slice(0, 3)
          .join('; ')})`
      : ''
    parts.push(
      `Mi sono appoggiato a ${[topicBit, matBit].filter(Boolean).join(' e ')}.`,
    )
  }

  if (prayer) {
    parts.push(`Nella preghiera: ${clip(prayer, 220)}`)
  }

  parts.push(
    chosen
      ? 'In sintesi: la decisione presa resta il punto fermo; i dati, le priorità e le analisi servono a tenerla lucida e allineata ai principi biblici, non solo alle emozioni.'
      : 'In sintesi: ancora manca una decisione presa scritta con chiarezza; quando la fissi, questo riassunto potrà chiudere il quadro.',
  )

  return normalizeJwItalian(parts.join('\n\n'))
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
  const prompt = `Scrivi un RIASSUNTO DELLA DECISIONE PRESA.

Non è un inventario né un “punto della situazione” a capitoli lunghi.
Deve sembrare un riassunto personale chiaro: cosa ho deciso, perché, e come i dati (priorità, pro/contro, conclusione, elaborazione AI, analisi di lucidità, materiali) sostengono o correggono quella scelta.

Usa TUTTI i dati utili del contesto, ma FONDILO in un testo scorrevole. Non inventare fatti.

Struttura preferita (titoli brevi, testo semplice, niente tabelle markdown):
1. Ho deciso… (o: ancora sto decidendo…)
2. Perché… (motivazioni oneste, anche scomode, in sintesi)
3. Cosa pesa di più… (priorità + tensione pro/contro, in 3-6 frasi o elenco breve)
4. Cosa confermano analisi e materiali… (solo se presenti: conclusione, AI, lucidità, jw.org)
5. In sintesi… (1 breve paragrafo finale, frase completa)

Regole:
- Massimo circa 350-500 parole. Completo ma leggibile.
- Prima persona (“Ho deciso…”, “Perché…”).
- VIETATO tabelle markdown, HTML, elenchi interminabili campo-per-campo.
- Niente «ministeriale»: usa «ministero».
- Chiudi sempre con una frase completa.`

  try {
    const answer = await askAi({ prompt, context })
    if (answer?.trim()) {
      const polished = polishAiDecisionText(answer)
      const core = polished.replace(/\n\n—\nNota:[\s\S]*$/, '').trim()
      // Se l’AI taglia a metà, meglio un testo completo locale che un pezzo spezzato.
      if (polished.includes('risultava incompleta') || looksTruncated(core)) {
        return `Bozza locale. La risposta AI era incompleta.\n\n${buildLocalSituationPoint(decision, linkedTopics)}`
      }
      return polished
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Motore AI non disponibile.'
    return `Bozza locale. ${detail}\n\n${buildLocalSituationPoint(decision, linkedTopics)}`
  }
  return `Bozza locale. La risposta AI era vuota.\n\n${buildLocalSituationPoint(decision, linkedTopics)}`
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
        return `Bozza locale. La risposta AI era incompleta.\n\n${buildLocalNextSteps(decision, linkedTopics)}`
      }
      return polished
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Motore AI non disponibile.'
    return `Bozza locale. ${detail}\n\n${buildLocalNextSteps(decision, linkedTopics)}`
  }
  return `Bozza locale. La risposta AI era vuota.\n\n${buildLocalNextSteps(decision, linkedTopics)}`
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
