import { jsPDF } from 'jspdf'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import {
  fetchScriptureVerse,
  findScriptureRefsInText,
  type ParsedScriptureRef,
  type ScriptureVerseResult,
} from './bibleText'
import { SECTION_KIND_LABEL, ensureSections, totalMinutes } from './discourseStructure'
import { EPUB_PAGE_CSS } from './epubPageCss'
import { pdfSafeText } from './pdfSafeText'
import type { DiscourseNote } from '../types'

function slug(title: string) {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9àèéìòù]+/gi, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'discorso'
  )
}

export function discourseToPlainText(note: DiscourseNote): string {
  const sections = ensureSections(note)
  const lines = [
    note.title || 'Discorso',
    `Durata stimata: ${totalMinutes(sections)} min`,
    '',
  ]
  for (const s of sections) {
    lines.push(`## ${s.title || SECTION_KIND_LABEL[s.kind]} (${s.minutes} min)`)
    lines.push(s.body.trim() || '(vuoto)')
    lines.push('')
  }
  return lines.join('\n').trim() + '\n'
}

export function downloadDiscourseText(note: DiscourseNote): void {
  const blob = new Blob([discourseToPlainText(note)], {
    type: 'text/plain;charset=utf-8',
  })
  saveAs(blob, `jw-studio-discorso-${slug(note.title)}.txt`)
}

export async function exportDiscoursePdf(note: DiscourseNote): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 22
  const width = 210 - margin * 2
  const bottom = 297 - 14
  let y = 22
  const sections = ensureSections(note)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  const titleLines = doc.splitTextToSize(
    pdfSafeText(note.title || 'Discorso'),
    width,
  ) as string[]
  for (const line of titleLines) {
    doc.text(line, margin, y)
    y += 7
  }
  y += 2
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(80)
  doc.text(
    pdfSafeText(`Durata stimata: ${totalMinutes(sections)} min · JW Studio`),
    margin,
    y,
  )
  y += 10
  doc.setTextColor(20)

  for (const s of sections) {
    if (y > bottom - 20) {
      doc.addPage()
      y = 22
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    const heading = pdfSafeText(
      `${s.title || SECTION_KIND_LABEL[s.kind]} · ${s.minutes} min`,
    )
    const headLines = doc.splitTextToSize(heading, width) as string[]
    for (const line of headLines) {
      if (y > bottom - 10) {
        doc.addPage()
        y = 22
      }
      doc.text(line, margin, y)
      y += 6
    }
    y += 1
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    const body = pdfSafeText(s.body.trim() || '(vuoto)')
    const lines = doc.splitTextToSize(body, width) as string[]
    for (const line of lines) {
      if (y > bottom) {
        doc.addPage()
        y = 22
      }
      doc.text(line, margin, y)
      y += 5.5
    }
    y += 6
  }

  doc.save(`jw-studio-discorso-${slug(note.title)}.pdf`)
}

const TRANSLATION_IT =
  'Traduzione del Nuovo Mondo delle Sacre Scritture (edizione per lo studio)'
const TRANSLATION_EN =
  'New World Translation of the Holy Scriptures (Study Edition)'

export async function exportDiscourseEpub(
  note: DiscourseNote,
  opts?: { language?: string },
): Promise<void> {
  const language = opts?.language || 'I'
  const sections = ensureSections(note)
  const title = note.title || 'Discorso'
  const fullText = sections.map((s) => s.body).join('\n\n')
  const refs = findScriptureRefsInText(fullText)

  const verseByKey = new Map<string, ScriptureVerseResult>()
  const popupIdByKey = new Map<string, string>()
  let popupSeq = 0

  for (const ref of uniqueRefs(refs)) {
    const key = refKey(ref)
    if (popupIdByKey.has(key)) continue
    popupSeq += 1
    const id = `wol-v-${popupSeq}`
    popupIdByKey.set(key, id)
    try {
      const verse = await fetchScriptureVerse({
        bookNum: ref.bookNum,
        bookName: ref.bookName,
        chapter: ref.chapter,
        verse: ref.verse,
        verseEnd: ref.verseEnd,
        language,
        withContext: false,
      })
      verseByKey.set(key, verse)
    } catch {
      /* offline / missing — link still opens empty popup with label */
    }
  }

  const translation = language === 'E' ? TRANSLATION_EN : TRANSLATION_IT
  const popupTitle = language === 'E' ? 'Cited scripture' : 'Brano biblico citato'

  const body = sections
    .map((s) => {
      const linked = linkifyBody(s.body || '(vuoto)', popupIdByKey)
      return `<section><h2>${escapeXml(s.title || SECTION_KIND_LABEL[s.kind])} <small>(${s.minutes} min)</small></h2><p>${linked}</p></section>`
    })
    .join('\n')

  const popupsHtml = [...popupIdByKey.entries()]
    .map(([key, id]) => {
      const verse = verseByKey.get(key)
      const label = verse?.label || key
      const url = verse?.url || '#'
      const verseNum = verse?.verse ?? ''
      const verseBody = (verse?.text || '').replace(/^\d+\s*/, '')
      const textBlock = verse
        ? `<p><span class="wol-vnum">${escapeXml(String(verseNum))}</span> ${escapeXml(verseBody)}</p>`
        : `<p class="wol-muted">${escapeXml(language === 'E' ? 'Verse text unavailable offline.' : 'Testo non disponibile (offline o non in cache).')}</p>`
      return `<aside id="${id}" class="wol-popup" role="dialog" aria-label="${escapeXml(popupTitle)}">
  <header class="wol-popup-bar">
    <span>${escapeXml(popupTitle)}</span>
    <a class="wol-popup-close" href="#wol-close" aria-label="Chiudi">×</a>
  </header>
  <div class="wol-popup-body">
    <a class="wol-popup-source" href="${escapeXml(url)}">
      <span class="wol-popup-ref">${escapeXml(label)}</span>
      <span class="wol-popup-pub">${escapeXml(translation)}</span>
    </a>
    <div class="wol-popup-verse">${textBlock}</div>
  </div>
</aside>`
    })
    .join('\n')

  const style = epubWolCss()
  const script = epubWolScript()

  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.folder('META-INF')?.file(
    'container.xml',
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  )
  const oebps = zip.folder('OEBPS')
  oebps?.file(
    'content.opf',
    `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0" xml:lang="it"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escapeXml(title)}</dc:title><dc:creator>JW Studio</dc:creator><dc:language>${language === 'E' ? 'en' : 'it'}</dc:language><dc:identifier id="BookId">discorso-${escapeXml(note.id)}</dc:identifier><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta></metadata><manifest><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml" properties="scripted"/></manifest><spine toc="ncx"><itemref idref="c1"/></spine></package>`,
  )
  oebps?.file(
    'toc.ncx',
    `<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><docTitle><text>${escapeXml(title)}</text></docTitle><navMap><navPoint id="n1" playOrder="1"><navLabel><text>${escapeXml(title)}</text></navLabel><content src="chapter1.xhtml"/></navPoint></navMap></ncx>`,
  )
  oebps?.file(
    'chapter1.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${language === 'E' ? 'en' : 'it'}">
<head>
<meta charset="UTF-8"/>
<title>${escapeXml(title)}</title>
<style>${style}</style>
</head>
<body>
<a id="wol-close" class="wol-anchor-close" aria-hidden="true"></a>
<h1>${escapeXml(title)}</h1>
<p class="meta">Durata stimata: ${totalMinutes(sections)} min · JW Studio</p>
${body}
${popupsHtml}
<script type="text/javascript">${script}</script>
</body>
</html>`,
  )
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' })
  saveAs(blob, `jw-studio-discorso-${slug(note.title)}.epub`)
}

function refKey(ref: ParsedScriptureRef): string {
  return `${ref.bible}:${ref.verseEnd || ref.verse}`
}

function uniqueRefs(refs: ParsedScriptureRef[]): ParsedScriptureRef[] {
  const seen = new Set<string>()
  const out: ParsedScriptureRef[] = []
  for (const r of refs) {
    const k = refKey(r)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(r)
  }
  return out
}

/** Sostituisce i riferimenti con link blu verso i popup :target. */
function linkifyBody(text: string, popupIdByKey: Map<string, string>): string {
  const refs = findScriptureRefsInText(text)
  if (!refs.length) {
    return escapeXml(text || '(vuoto)').replace(/\n/g, '<br/>')
  }
  const parts: string[] = []
  let cursor = 0
  for (const ref of refs) {
    const start = ref.index
    const end = start + (ref.matched?.length || ref.label.length)
    if (start > cursor) {
      parts.push(escapeXml(text.slice(cursor, start)).replace(/\n/g, '<br/>'))
    }
    const raw = text.slice(start, end) || ref.matched || ref.label
    const id = popupIdByKey.get(refKey(ref))
    if (id) {
      parts.push(
        `<a class="wol-inline-ref" href="#${id}">${escapeXml(raw)}</a>`,
      )
    } else {
      parts.push(escapeXml(raw))
    }
    cursor = end
  }
  if (cursor < text.length) {
    parts.push(escapeXml(text.slice(cursor)).replace(/\n/g, '<br/>'))
  }
  return parts.join('')
}

function epubWolCss(): string {
  return `
${EPUB_PAGE_CSS}
body{font-family:Georgia,"Times New Roman",serif;color:#1a1a1a;background:#fff}
h1{font-size:1.45rem;margin:0 0 .4em}
h2{font-size:1.12rem;margin-top:1.25em;margin-bottom:.35em}
p{margin:.55em 0}
small{color:#666;font-weight:normal}
.meta{color:#666;font-size:.92rem}
.wol-inline-ref{color:#4a6da7;font-weight:600;text-decoration:none;border-bottom:1px solid rgba(74,109,167,.35)}
.wol-inline-ref:hover,.wol-inline-ref:focus{color:#2f4f80;border-bottom-color:#2f4f80}
.wol-anchor-close{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.wol-popup{
  display:none;
  position:fixed;
  left:50%;
  top:18%;
  transform:translateX(-50%);
  z-index:50;
  width:92%;
  max-width:22rem;
  background:#fff;
  border:1px solid #c8c8c8;
  box-shadow:0 8px 28px rgba(0,0,0,.28);
  font-family:Helvetica,Arial,sans-serif;
}
.wol-popup:target{display:block}
.wol-popup.is-open{display:block}
.wol-popup-bar{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:.5rem;
  padding:.35rem .65rem;
  background:#f0f0f0;
  border-bottom:1px solid #d8d8d8;
  color:#555;
  font-size:.78rem;
  cursor:move;
  -webkit-user-select:none;
  user-select:none;
  touch-action:none;
}
.wol-popup-close{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:1.5rem;
  height:1.5rem;
  color:#555;
  text-decoration:none;
  font-size:1.15rem;
  line-height:1;
  border-radius:2px;
}
.wol-popup-close:hover{background:#e2e2e2;color:#222}
.wol-popup-body{padding:0}
.wol-popup-source{
  display:block;
  padding:.7rem .85rem .55rem;
  border-bottom:1px solid #e6e6e6;
  text-decoration:none;
  color:#4a6da7;
}
.wol-popup-ref{display:block;font-weight:700;font-size:1.05rem;color:#4a6da7}
.wol-popup-pub{display:block;margin-top:.15rem;font-size:.72rem;color:#6b8ab8;line-height:1.25}
.wol-popup-verse{
  padding:.75rem .85rem .9rem;
  font-family:Georgia,"Times New Roman",serif;
  font-size:1rem;
  line-height:1.45;
  color:#1a1a1a;
}
.wol-vnum{color:#4a6da7;font-weight:700;margin-right:.2em}
.wol-muted{color:#777;font-size:.92rem}
`.replace(/\n/g, '')
}

/** JS opzionale: lettori che lo supportano (Books, Thorium…) chiudono e trascinano. */
function epubWolScript(): string {
  return `(function(){
var drag=null;
function closeAll(){
  var nodes=document.querySelectorAll('.wol-popup');
  for(var i=0;i<nodes.length;i++){
    nodes[i].classList.remove('is-open');
    nodes[i].style.left='';
    nodes[i].style.top='';
    nodes[i].style.transform='';
  }
  try{if(location.hash&&location.hash.indexOf('wol-v-')===1)history.replaceState(null,'',location.pathname+location.search);}catch(e){}
}
function openFromHash(){
  closeAll();
  var id=(location.hash||'').replace(/^#/,'');
  if(!id||id.indexOf('wol-v-')!==0)return;
  var el=document.getElementById(id);
  if(!el)return;
  el.classList.add('is-open');
}
document.addEventListener('click',function(ev){
  var t=ev.target;
  if(!t||!t.closest)return;
  var close=t.closest('.wol-popup-close');
  if(close){ev.preventDefault();closeAll();return;}
  var ref=t.closest('a.wol-inline-ref');
  if(ref){
    var href=ref.getAttribute('href')||'';
    var id=href.replace(/^#/,'');
    var el=document.getElementById(id);
    if(el){
      ev.preventDefault();
      closeAll();
      el.classList.add('is-open');
      try{history.replaceState(null,'','#'+id);}catch(e){}
    }
  }
},true);
document.addEventListener('pointerdown',function(ev){
  var bar=ev.target&&ev.target.closest&&ev.target.closest('.wol-popup-bar');
  if(!bar)return;
  if(ev.target.closest&&ev.target.closest('.wol-popup-close'))return;
  var panel=bar.closest('.wol-popup');
  if(!panel)return;
  var r=panel.getBoundingClientRect();
  drag={el:panel,ox:ev.clientX-r.left,oy:ev.clientY-r.top};
  panel.style.transform='none';
  try{bar.setPointerCapture&&bar.setPointerCapture(ev.pointerId);}catch(e){}
});
document.addEventListener('pointermove',function(ev){
  if(!drag)return;
  drag.el.style.left=Math.max(8,ev.clientX-drag.ox)+'px';
  drag.el.style.top=Math.max(8,ev.clientY-drag.oy)+'px';
});
document.addEventListener('pointerup',function(){drag=null;});
window.addEventListener('hashchange',openFromHash);
openFromHash();
})();`.replace(/\n/g, '')
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
