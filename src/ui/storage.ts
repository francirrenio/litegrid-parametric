import { tr } from '../i18n'
import { defaultDrawer, defaultProject } from '../model/defaults'
import { PROJECT_VERSION, type ProjectState } from '../model/types'

export const ENVELOPE_VERSION = 1
const PREFIX = 'litegrid:'
export const KEY_PROJECT = `${PREFIX}project:`
export const KEY_CURRENT = `${PREFIX}current`
export const KEY_THEME = `${PREFIX}theme`

export interface Envelope {
  version: number
  savedAt: string
  project: ProjectState
}

export interface ProjectMeta {
  id: string
  name: string
  savedAt: string
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const SKIP = Symbol('skip')

const ENUMS: Record<string, readonly string[]> = {
  material: ['PLA', 'PETG', 'ABS', 'ASA', 'PLA-CF'],
  materialLevel: ['minimo', 'equilibrado', 'reforcado'],
  cabinetMode: ['monolithic', 'skeleton'],
  fill: ['none', 'closed', 'perforated', 'truss', 'panel'],
  pattern: ['triangle', 'hexagon', 'diamond', 'circle'],
  reinforcement: ['auto', 'none', 'ribs', 'postsBeams', 'truss', 'x', 'corrugated'],
  panelSystem: ['skadis', 'pegboard', 'hsw'],
  pegboardHole: ['1/4', '1/8'],
  hswVariant: ['sd', 'hd'],
  attach: ['tabs', 'clips', 'screws', 'glue'],
  standoff: ['none', 'spacers', 'pockets'],
  front: ['flat', 'slope', 'lip'],
  handle: ['cutout', 'bar', 'none'],
  bracing: ['auto', 'none', 'corners', 'diagonal', 'back'],
  mode: ['none', 'screws', 'keyhole', 'cleat'],
  screw: ['none', 'M3', 'M4'],
  load: ['leve', 'media', 'pesada'],
}
const AUTO_KEYS = new Set(['frame', 'thickness', 'standoffMm', 'barWidth'])
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype'])

function pickSize(v: unknown): number | 'auto' {
  return isNum(v) && v > 0 ? v : 'auto'
}

function pickSections(patch: unknown): unknown {
  if (!Array.isArray(patch)) return SKIP
  const out = patch.slice(0, 30).flatMap((s) => {
    if (!isObj(s)) return []
    const rows = Array.isArray(s.rows) ? s.rows.slice(0, 40) : []
    return [
      {
        width: pickSize(s.width),
        rows: rows.flatMap((r) => {
          if (!isObj(r)) return []
          const div = isNum(r.divisions) ? Math.min(30, Math.max(1, Math.round(r.divisions))) : 1
          const load = typeof r.load === 'string' && ENUMS.load!.includes(r.load) ? r.load : 'media'
          return [{ height: pickSize(r.height), divisions: div, load }]
        }),
      },
    ]
  })
  return out.length ? out : SKIP
}

function pickAdvanced(patch: unknown): unknown {
  if (!isObj(patch)) return SKIP
  const out: Obj = {}
  for (const k of ['extrusionFactor', 'layerHeight', 'fitClearance']) {
    const v = patch[k]
    if (isNum(v) && v > 0) out[k] = v
  }
  if (isObj(patch.clearances)) {
    const c: Obj = {}
    for (const k of ['lateral', 'top', 'back']) {
      const v = (patch.clearances as Obj)[k]
      if (isNum(v) && v >= 0) c[k] = v
    }
    out.clearances = c
  }
  return out
}

function pickOverrides(patch: unknown): unknown {
  if (!isObj(patch)) return SKIP
  const out: Obj = {}
  const def = defaultDrawer() as unknown as Obj
  for (const [id, raw] of Object.entries(patch).slice(0, 500)) {
    if (UNSAFE.has(id) || !isObj(raw)) continue
    const part = pickObject(def, raw)
    for (const [k, v] of Object.entries(part)) {
      if (isObj(v) && isObj(def[k])) part[k] = deepAssign(structuredClone(def[k]) as Obj, v)
    }
    out[id] = part
  }
  return out
}

function pick(base: unknown, patch: unknown, key: string): unknown {
  if (key === 'sections') return pickSections(patch)
  if (key === 'overrides') return pickOverrides(patch)
  if (key === 'advanced') return pickAdvanced(patch)
  if (key in ENUMS) return typeof patch === 'string' && ENUMS[key]!.includes(patch) ? patch : SKIP
  if (key === 'color') return typeof patch === 'string' && /^#[0-9a-f]{3,8}$/i.test(patch) ? patch : SKIP
  if (AUTO_KEYS.has(key)) return patch === 'auto' || isNum(patch) ? patch : SKIP
  if (Array.isArray(base)) return Array.isArray(patch) ? patch : SKIP
  if (isObj(base)) return isObj(patch) ? pickObject(base, patch) : SKIP
  if (typeof base === 'number') return isNum(patch) ? patch : SKIP
  if (typeof base === 'boolean') return typeof patch === 'boolean' ? patch : SKIP
  if (typeof base === 'string') return typeof patch === 'string' ? patch.slice(0, 80) : SKIP
  return SKIP
}

/** Keeps only the keys of `base` that `patch` provides with a compatible type. */
function pickObject(base: Obj, patch: Obj): Obj {
  const out: Obj = {}
  for (const k of Object.keys(base)) {
    if (!(k in patch)) continue
    const v = pick(base[k], patch[k], k)
    if (v !== SKIP) out[k] = v
  }
  return out
}

function deepAssign(base: Obj, patch: Obj): Obj {
  for (const [k, v] of Object.entries(patch)) {
    const b = base[k]
    base[k] = isObj(b) && isObj(v) ? deepAssign(b, v) : v
  }
  return base
}

/** Any input (old version, envelope, bare project, garbage) becomes a valid project. Never throws. */
export function migrateProject(raw: unknown): ProjectState {
  const base = defaultProject()
  try {
    const candidate = isObj(raw) && isObj(raw.project) ? raw.project : raw
    if (!isObj(candidate)) return base
    const picked = pickObject(base as unknown as Obj, candidate)
    delete picked.version
    const p = deepAssign(base as unknown as Obj, picked) as unknown as ProjectState
    p.version = PROJECT_VERSION
    const d = defaultProject()
    if (!(p.nozzle > 0)) p.nozzle = d.nozzle
    if (!(p.width > 0)) p.width = d.width
    if (!(p.height > 0)) p.height = d.height
    if (!(p.depth > 0)) p.depth = d.depth
    if (!(p.printBed.x > 0)) p.printBed.x = d.printBed.x
    if (!(p.printBed.y > 0)) p.printBed.y = d.printBed.y
    if (!p.name.trim()) p.name = d.name
    return p
  } catch {
    return defaultProject()
  }
}

const RECOGNISED = ['sections', 'width', 'height', 'depth', 'nozzle', 'drawerDefaults', 'skins']

/** Parses an imported file; throws an Error with a pt-BR message when it cannot be a project. */
export function importProjectText(text: string): ProjectState {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(tr('O arquivo não é um JSON válido.', 'The file is not valid JSON.'))
  }
  const candidate = isObj(data) && isObj(data.project) ? data.project : data
  if (!isObj(candidate) || !RECOGNISED.some((k) => k in candidate)) {
    throw new Error(tr('O arquivo não parece um projeto do LiteGrid.', 'The file does not look like a LiteGrid project.'))
  }
  return migrateProject(candidate)
}

export function exportProjectText(project: ProjectState): string {
  return JSON.stringify(project, null, 2)
}

function defaultStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function newId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** Named projects on top of localStorage, with an in-memory fallback when storage is unavailable. */
export class ProjectRepo {
  private mem = new Map<string, string>()
  private storage: Storage | null
  /** False when writes only live in memory (blocked storage, private window, quota). */
  persistent: boolean

  constructor(getStorage: () => Storage | null = defaultStorage) {
    let s: Storage | null = null
    try {
      s = getStorage()
      if (s) {
        s.setItem(`${PREFIX}probe`, '1')
        s.removeItem(`${PREFIX}probe`)
      }
    } catch {
      s = null
    }
    this.storage = s
    this.persistent = s !== null
  }

  private get(key: string): string | null {
    try {
      const v = this.storage?.getItem(key)
      if (v != null) return v
    } catch {
      this.persistent = false
    }
    return this.mem.get(key) ?? null
  }

  private set(key: string, value: string): void {
    try {
      if (this.storage) {
        this.storage.setItem(key, value)
        return
      }
    } catch {
      this.persistent = false
    }
    this.mem.set(key, value)
  }

  private del(key: string): void {
    this.mem.delete(key)
    try {
      this.storage?.removeItem(key)
    } catch {
      this.persistent = false
    }
  }

  private keys(): string[] {
    const out = new Set(this.mem.keys())
    try {
      if (this.storage) for (let i = 0; i < this.storage.length; i++) out.add(this.storage.key(i) ?? '')
    } catch {
      this.persistent = false
    }
    return [...out].filter((k) => k.startsWith(KEY_PROJECT))
  }

  private parse(id: string): Envelope | null {
    const text = this.get(KEY_PROJECT + id)
    if (text === null) return null
    try {
      const data: unknown = JSON.parse(text)
      if (!isObj(data)) return null
      const project = migrateProject(data)
      return { version: ENVELOPE_VERSION, savedAt: typeof data.savedAt === 'string' ? data.savedAt : '', project }
    } catch {
      return null
    }
  }

  list(): ProjectMeta[] {
    const metas: ProjectMeta[] = []
    for (const k of this.keys()) {
      const id = k.slice(KEY_PROJECT.length)
      const env = this.parse(id)
      if (env) metas.push({ id, name: env.project.name, savedAt: env.savedAt })
    }
    return metas.sort((a, b) => b.savedAt.localeCompare(a.savedAt))
  }

  load(id: string): ProjectState | null {
    return this.parse(id)?.project ?? null
  }

  save(id: string, project: ProjectState): void {
    const env: Envelope = { version: ENVELOPE_VERSION, savedAt: new Date().toISOString(), project }
    this.set(KEY_PROJECT + id, JSON.stringify(env))
  }

  remove(id: string): void {
    this.del(KEY_PROJECT + id)
    if (this.currentId() === id) this.del(KEY_CURRENT)
  }

  currentId(): string | null {
    return this.get(KEY_CURRENT)
  }

  setCurrentId(id: string): void {
    this.set(KEY_CURRENT, id)
  }

  /** The project to open at start-up: the pointer, else the most recent one, else a fresh default. */
  loadInitial(): { id: string; project: ProjectState } {
    const cur = this.currentId()
    if (cur) {
      const p = this.load(cur)
      if (p) return { id: cur, project: p }
    }
    for (const m of this.list()) {
      const p = this.load(m.id)
      if (p) {
        this.setCurrentId(m.id)
        return { id: m.id, project: p }
      }
    }
    const id = newId()
    const project = defaultProject()
    this.save(id, project)
    this.setCurrentId(id)
    return { id, project }
  }

  getTheme(): 'dark' | 'light' | null {
    const t = this.get(KEY_THEME)
    return t === 'dark' || t === 'light' ? t : null
  }

  setTheme(t: 'dark' | 'light'): void {
    this.set(KEY_THEME, t)
  }
}
