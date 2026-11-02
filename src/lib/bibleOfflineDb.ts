/** IndexedDB per la Bibbia offline completa (i capitoli non entrano in localStorage). */

const DB_NAME = 'jw-studio-bible-offline'
const DB_VERSION = 1
const STORE = 'chapters'

export interface OfflineChapterRecord {
  /** language:book:chapter */
  id: string
  language: string
  book: number
  chapter: number
  html: string
  savedAt: string
}

function chapterId(language: string, book: number, chapter: number) {
  return `${language}:${book}:${chapter}`
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB non disponibile'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('language', 'language', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('Apertura IndexedDB fallita'))
  })
}

export async function idbGetChapter(
  language: string,
  book: number,
  chapter: number,
): Promise<string | null> {
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(chapterId(language, book, chapter))
      req.onsuccess = () => {
        const row = req.result as OfflineChapterRecord | undefined
        resolve(row?.html || null)
      }
      req.onerror = () => reject(req.error)
      tx.oncomplete = () => db.close()
    })
  } catch {
    return null
  }
}

export async function idbPutChapter(params: {
  language: string
  book: number
  chapter: number
  html: string
}): Promise<void> {
  const db = await openDb()
  const record: OfflineChapterRecord = {
    id: chapterId(params.language, params.book, params.chapter),
    language: params.language,
    book: params.book,
    chapter: params.chapter,
    html: params.html,
    savedAt: new Date().toISOString(),
  }
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(record)
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => reject(tx.error)
  })
}

export async function idbHasChapter(
  language: string,
  book: number,
  chapter: number,
): Promise<boolean> {
  const html = await idbGetChapter(language, book, chapter)
  return Boolean(html)
}

export async function idbCountChapters(language?: string): Promise<number> {
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const store = tx.objectStore(STORE)
      if (!language) {
        const req = store.count()
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      } else {
        const idx = store.index('language')
        const req = idx.count(IDBKeyRange.only(language))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }
      tx.oncomplete = () => db.close()
    })
  } catch {
    return 0
  }
}

export async function idbListChapterKeys(language: string): Promise<Set<string>> {
  const out = new Set<string>()
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const idx = tx.objectStore(STORE).index('language')
      const req = idx.openCursor(IDBKeyRange.only(language))
      req.onsuccess = () => {
        const cursor = req.result
        if (!cursor) return
        const row = cursor.value as OfflineChapterRecord
        out.add(`${row.book}:${row.chapter}`)
        cursor.continue()
      }
      req.onerror = () => reject(req.error)
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
    })
  } catch {
    /* ignore */
  }
  return out
}

export async function idbClearAll(): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).clear()
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    /* ignore */
  }
}

export async function idbClearLanguage(language: string): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      const idx = store.index('language')
      const req = idx.openCursor(IDBKeyRange.only(language))
      req.onsuccess = () => {
        const cursor = req.result
        if (!cursor) return
        cursor.delete()
        cursor.continue()
      }
      req.onerror = () => reject(req.error)
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
    })
  } catch {
    /* ignore */
  }
}
