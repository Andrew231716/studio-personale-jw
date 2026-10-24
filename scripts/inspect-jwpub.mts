import { buildJwpub } from '../src/lib/jwpub/builder.ts'
import { mepsLanguageIndex } from '../src/lib/jwpub/languages.ts'
import JSZip from 'jszip'
import { writeFileSync } from 'fs'

const blob = await buildJwpub({
  symbol: 'jwstest1',
  title: 'Prova installazione',
  year: 2026,
  mepsLanguageIndex: mepsLanguageIndex('I'),
  languageLetter: 'I',
  section: 'manuali',
  documents: [{ title: 'Pagina 1', html: '<p id="p1" data-pid="1">Testo di prova JW Studio.</p>' }],
})
const buf = Buffer.from(await blob.arrayBuffer())
writeFileSync('/tmp/jwstest1_I.jwpub', buf)
const z = await JSZip.loadAsync(buf)
const m = JSON.parse(await z.file('manifest.json')!.async('string'))
console.log({
  size: buf.length,
  name: m.name,
  lang: m.publication.language,
  type: m.publication.publicationType,
  cats: m.publication.categories,
  attrs: m.publication.attributes,
  fileName: m.publication.fileName,
})
const contents = await z.file('contents')!.async('uint8array')
const inner = await JSZip.loadAsync(contents)
console.log('inner', Object.keys(inner.files))
