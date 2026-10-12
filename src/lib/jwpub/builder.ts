/**
 * Costruisce un file .jwpub installabile in JW Library.
 * Portato da darioragusa/html2jwpub (MIT).
 */
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import JSZip from 'jszip'
import { encryptDocumentContent, sha1Hex, sha256Hex } from './crypto'
import { JWPUB_INIT_SQL } from './schema'
import { getJwpubSection, type JwpubSectionId } from './sections'

export interface JwpubDocument {
  title: string
  /** HTML del documento (corpo o documento completo). */
  html: string
}

export interface JwpubBuildOptions {
  /** Simbolo univoco (non usare simboli ufficiali JW). */
  symbol: string
  title: string
  year: number
  /** Indice MEPS: 0=E, 1=S, 2=I (italiano). */
  mepsLanguageIndex?: number
  /** Letter code lingua per nome file (_I, _E…). */
  languageLetter?: string
  documents: JwpubDocument[]
  /** Se > 0, entra nella chiave di cifratura (edizioni). */
  issueTagNumber?: number
  /** Sezione JW Library (Libri, Opuscoli, …). */
  section?: JwpubSectionId
}

let sqlPromise: Promise<SqlJsStatic> | null = null

async function loadSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    // In Vite sqlWasmUrl è l’asset bundle; in Node/tsx può essere un modulo vuoto:
    // lo smoke test reimposta locateFile se serve.
    const locate =
      typeof sqlWasmUrl === 'string' && sqlWasmUrl.length > 0
        ? () => sqlWasmUrl
        : undefined
    sqlPromise = initSqlJs(locate ? { locateFile: locate } : undefined)
  }
  return sqlPromise
}

function wrapDocumentHtml(title: string, html: string): string {
  const hasHtml = /<html[\s>]/i.test(html)
  if (hasHtml) return html

  // JW Library si aspetta paragrafi con data-pid
  let body = html
  if (!/<p[\s>]/i.test(body)) {
    const paras = body
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean)
    body = paras
      .map((p, i) => `<p id="p${i + 1}" data-pid="${i + 1}">${escapeHtml(p)}</p>`)
      .join('\n')
  } else {
    // Assicura data-pid sui <p> esistenti se mancanti
    let n = 0
    body = body.replace(/<p(\s[^>]*)?>/gi, (full, attrs = '') => {
      n += 1
      if (/data-pid=/i.test(attrs)) return full
      return `<p id="p${n}" data-pid="${n}"${attrs}>`
    })
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(title)}</title>
</head>
<body>
<header><h1>${escapeHtml(title)}</h1></header>
<article class="docContent">
${body}
</article>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function run(db: Database, sql: string, params: Array<string | number | Uint8Array | null> = []) {
  db.run(sql, params)
}

export async function buildJwpub(options: JwpubBuildOptions): Promise<Blob> {
  const mepsLanguageIndex = options.mepsLanguageIndex ?? 2
  const languageLetter = options.languageLetter ?? 'I'
  const issueTagNumber = options.issueTagNumber ?? 0
  const section = getJwpubSection(options.section ?? 'opuscoli')
  const symbol = options.symbol
  const year = options.year
  const title = options.title
  const dbFileName = `${symbol}_${languageLetter}.db`
  const jwpubName = `${symbol}_${languageLetter}.jwpub`

  const SQL = await loadSql()
  const db = new SQL.Database()
  db.exec(JWPUB_INIT_SQL)
  run(db, `INSERT INTO android_metadata VALUES ('it_IT');`)

  // Stesso INSERT usato da html2jwpub, con tipo/categoria scelti dall’utente.
  const pubSql = `INSERT INTO Publication (
    PublicationId, VersionNumber, Type, Title, TitleRich, RootSymbol, RootYear, RootMepsLanguageIndex,
    ShortTitle, ShortTitleRich, DisplayTitle, DisplayTitleRich, ReferenceTitle, ReferenceTitleRich,
    UndatedReferenceTitle, UndatedReferenceTitleRich, Symbol, UndatedSymbol, UniqueSymbol,
    EnglishSymbol, UniqueEnglishSymbol, IssueTagNumber, IssueNumber, Variation, Year, VolumeNumber,
    MepsLanguageIndex, PublicationType, PublicationCategorySymbol, BibleVersionForCitations,
    HasPublicationChapterNumbers, HasPublicationSectionNumbers, FirstDatedTextDateOffset,
    LastDatedTextDateOffset, MepsBuildNumber
  ) VALUES (
    1,8,1,?,NULL,?,?,0,?,NULL,?,NULL,?,NULL,?,NULL,?,?,?,?,?,'0',0,'',?,0,?,?,?,'NWTR',1,1,19691231,19691231,?
  );`
  const refSql = `INSERT INTO RefPublication (
    RefPublicationId, VersionNumber, Type, Title, TitleRich, RootSymbol, RootYear, RootMepsLanguageIndex,
    ShortTitle, ShortTitleRich, DisplayTitle, DisplayTitleRich, ReferenceTitle, ReferenceTitleRich,
    UndatedReferenceTitle, UndatedReferenceTitleRich, Symbol, UndatedSymbol, UniqueSymbol,
    EnglishSymbol, UniqueEnglishSymbol, IssueTagNumber, IssueNumber, Variation, Year, VolumeNumber,
    MepsLanguageIndex, PublicationType, PublicationCategorySymbol, BibleVersionForCitations,
    HasPublicationChapterNumbers, HasPublicationSectionNumbers, FirstDatedTextDateOffset,
    LastDatedTextDateOffset, MepsBuildNumber
  ) VALUES (
    1,8,1,?,NULL,?,?,0,?,NULL,?,NULL,?,NULL,?,NULL,?,?,?,?,?,'0',0,'',?,0,?,?,?,'NWTR',1,1,19691231,19691231,?
  );`

  const pubParams: Array<string | number> = [
    title,
    symbol,
    year,
    title,
    title,
    title,
    title,
    symbol,
    symbol,
    symbol,
    symbol,
    symbol,
    year,
    mepsLanguageIndex,
    section.publicationType,
    section.categorySymbol,
    12345,
  ]
  run(db, pubSql, pubParams)
  run(db, refSql, pubParams)

  run(db, `INSERT INTO PublicationAttribute (PublicationAttributeId, PublicationId, Attribute) VALUES (1,1,'PERSONAL');`)
  section.categories.forEach((category, index) => {
    run(
      db,
      `INSERT INTO PublicationCategory (PublicationCategoryId, PublicationId, Category) VALUES (?,?,?);`,
      [index + 1, 1, category],
    )
  })
  run(db, `INSERT INTO PublicationView (PublicationViewId, Name, Symbol) VALUES (1,'JW App Publication','jwpub');`)
  run(db, `INSERT INTO PublicationViewSchema (PublicationViewSchemaId, SchemaType, DataType) VALUES (1,0,'name');`)
  run(db, `INSERT INTO PublicationYear (PublicationYearId, PublicationId, Year) VALUES (1,1,?);`, [year])

  // Root TOC item
  run(
    db,
    `INSERT INTO PublicationViewItem (
      PublicationViewItemId, PublicationViewId, ParentPublicationViewItemId, Title, TitleRich,
      SchemaType, ChildTemplateSchemaType, DefaultDocumentId
    ) VALUES (1,1,-1,?,NULL,0,0,-1);`,
    [title],
  )
  run(
    db,
    `INSERT INTO PublicationViewItemField (
      PublicationViewItemFieldId, PublicationViewItemId, Value, ValueRich, Type
    ) VALUES (1,1,?,NULL,'name');`,
    [title],
  )

  let documentId = -1
  for (const doc of options.documents) {
    documentId += 1
    const html = wrapDocumentHtml(doc.title, doc.html)
    const encrypted = await encryptDocumentContent(
      html,
      mepsLanguageIndex,
      symbol,
      year,
      issueTagNumber,
    )
    const mepsDocId = 12000000 + documentId + 1

    run(
      db,
      `INSERT INTO Document (
        DocumentId, PublicationId, MepsDocumentId, MepsLanguageIndex, Class, Type, SectionNumber,
        ChapterNumber, Title, TitleRich, TocTitle, TocTitleRich, ContextTitle, ContextTitleRich,
        FeatureTitle, FeatureTitleRich, Subtitle, SubtitleRich, FeatureSubtitle, FeatureSubtitleRich,
        Content, FirstFootnoteId, LastFootnoteId, FirstBibleCitationId, LastBibleCitationId,
        ParagraphCount, HasMediaLinks, HasLinks, FirstPageNumber, LastPageNumber, ContentLength,
        PreferredPresentation, ContentReworkedDate
      ) VALUES (?,1,?,?,'13',0,1,NULL,?,NULL,?,NULL,'',NULL,NULL,NULL,NULL,NULL,NULL,NULL,?,NULL,NULL,NULL,NULL,254,0,0,1,1,?,NULL,NULL);`,
      [documentId, mepsDocId, mepsLanguageIndex, doc.title, doc.title, encrypted, html.length],
    )

    run(db, `INSERT INTO TextUnit (TextUnitId, Type, Id) VALUES (?,'Document',?);`, [
      documentId + 1,
      documentId,
    ])

    const viewItemId = documentId + 2
    run(
      db,
      `INSERT INTO PublicationViewItem (
        PublicationViewItemId, PublicationViewId, ParentPublicationViewItemId, Title, TitleRich,
        SchemaType, ChildTemplateSchemaType, DefaultDocumentId
      ) VALUES (?,1,1,?,NULL,0,NULL,?);`,
      [viewItemId, doc.title, documentId],
    )
    run(
      db,
      `INSERT INTO PublicationViewItemDocument (
        PublicationViewItemDocumentId, PublicationViewItemId, DocumentId
      ) VALUES (?,?,?);`,
      [documentId + 1, viewItemId, documentId],
    )
    run(
      db,
      `INSERT INTO PublicationViewItemField (
        PublicationViewItemFieldId, PublicationViewItemId, Value, ValueRich, Type
      ) VALUES (?,?,?,NULL,'name');`,
      [viewItemId, viewItemId, doc.title],
    )
  }

  const dbData = db.export()
  db.close()
  const dbBytes = new Uint8Array(dbData)

  // Inner ZIP = "contents"
  const contentsZip = new JSZip()
  contentsZip.file(dbFileName, dbBytes)
  const contentsBytes = await contentsZip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
  })

  const now = new Date()
  const timestamp = now.toISOString().replace(/\.\d{3}Z$/, 'Z')
  const dbHash = await sha1Hex(dbBytes)
  const contentsHash = await sha256Hex(contentsBytes)

  const manifest = {
    name: jwpubName,
    hash: contentsHash,
    timestamp,
    version: 1,
    expandedSize: contentsBytes.byteLength,
    contentFormat: 'z-a',
    htmlValidated: false,
    mepsPlatformVersion: 2.1,
    mepsBuildNumber: 12345,
    publication: {
      fileName: dbFileName,
      type: 1,
      title,
      shortTitle: title,
      displayTitle: title,
      referenceTitle: title,
      undatedReferenceTitle: title,
      titleRich: '',
      displayTitleRich: '',
      referenceTitleRich: '',
      undatedReferenceTitleRich: '',
      symbol,
      uniqueEnglishSymbol: symbol,
      uniqueSymbol: symbol,
      englishSymbol: symbol,
      language: mepsLanguageIndex,
      hash: dbHash,
      timestamp,
      minPlatformVersion: 1,
      schemaVersion: 8,
      year,
      issueId: 0,
      issueNumber: issueTagNumber || 0,
      publicationType: section.publicationType,
      rootSymbol: symbol,
      rootYear: year,
      rootLanguage: mepsLanguageIndex,
      images: [] as string[],
      categories: section.categories,
      attributes: ['PERSONAL'],
    },
  }

  // Outer ZIP = .jwpub
  const outer = new JSZip()
  outer.file('contents', contentsBytes, { compression: 'STORE' })
  outer.file('manifest.json', JSON.stringify(manifest, null, 2))

  return outer.generateAsync({
    type: 'blob',
    mimeType: 'application/jwpub',
    compression: 'DEFLATE',
  })
}
