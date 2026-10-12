/**
 * Crittografia contenuto Document di .jwpub
 * Algoritmo portato da darioragusa/html2jwpub (MIT).
 */

const XOR_KEY_HEX =
  '11cbb5587e32846d4c26790c633da289f66fe5842a3a585ce1bc3a294af5ada7'

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

function xorBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length)
  for (let i = 0; i < a.length; i++) out[i] = a[i] ^ b[i]
  return out
}

export async function computeKeyIv(
  mepsLanguageIndex: number,
  symbol: string,
  year: number,
  issueTagNumber = 0,
): Promise<{ key: Uint8Array; iv: Uint8Array }> {
  const pubString =
    `${mepsLanguageIndex}_${symbol}_${year}` +
    (issueTagNumber !== 0 ? `_${issueTagNumber}` : '')
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pubString)),
  )
  const cardHash = xorBytes(digest, hexToBytes(XOR_KEY_HEX))
  return {
    key: cardHash.slice(0, 16),
    iv: cardHash.slice(16, 32),
  }
}

function asBufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

async function aesCbcEncrypt(
  data: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array,
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    asBufferSource(key),
    { name: 'AES-CBC' },
    false,
    ['encrypt'],
  )
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv: asBufferSource(iv) },
    cryptoKey,
    asBufferSource(data),
  )
  return new Uint8Array(encrypted)
}

/** Comprimi HTML (zlib) e cifra AES-128-CBC PKCS7 come JW Library. */
export async function encryptDocumentContent(
  html: string,
  mepsLanguageIndex: number,
  symbol: string,
  year: number,
  issueTagNumber = 0,
): Promise<Uint8Array> {
  const { deflate } = await import('pako')
  const compressed = deflate(new TextEncoder().encode(html), { level: 6 })
  const { key, iv } = await computeKeyIv(
    mepsLanguageIndex,
    symbol,
    year,
    issueTagNumber,
  )
  return aesCbcEncrypt(compressed, key, iv)
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', asBufferSource(data))
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function sha1Hex(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-1', asBufferSource(data))
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
