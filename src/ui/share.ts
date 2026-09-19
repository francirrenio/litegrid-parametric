import { tr } from '../i18n'
import type { ProjectState } from '../model/types'
import { exportProjectText, importProjectText } from './storage'

const PREFIX = '#p='

const toB64Url = (bytes: Uint8Array): string => {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromB64Url = (text: string): Uint8Array => {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const blob = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(blob).arrayBuffer())
}

/** The project as a compressed, URL-safe string. */
export async function encodeProject(project: ProjectState): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(project))
  return toB64Url(await pipe(raw, new CompressionStream('deflate-raw')))
}

export async function decodeProject(code: string): Promise<ProjectState> {
  let text: string
  try {
    text = new TextDecoder().decode(await pipe(fromB64Url(code), new DecompressionStream('deflate-raw')))
  } catch {
    throw new Error(tr('O link de compartilhamento está incompleto ou danificado.', 'The share link is incomplete or damaged.'))
  }
  return importProjectText(text)
}

export async function shareUrl(project: ProjectState, base: string): Promise<string> {
  return `${base.split('#')[0]}${PREFIX}${await encodeProject(project)}`
}

/** The project carried by a `#p=` hash, or null when the hash carries none. */
export async function projectFromHash(hash: string): Promise<ProjectState | null> {
  if (!hash.startsWith(PREFIX)) return null
  return decodeProject(hash.slice(PREFIX.length))
}

export { exportProjectText }
