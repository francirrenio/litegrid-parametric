import type { DrawerConfig, ProjectState } from './types'
import { tr } from '../i18n'

/** Drawer settings cascade: global defaults, then section, then row, then the single drawer. */
export type Level = 'global' | 'section' | 'row' | 'bay'

export interface Scope {
  level: Level
  /** 0-based section index (level section, row, bay). */
  section: number | null
  /** 0-based row index inside the section (level row, bay). */
  row: number | null
  bay: string | null
}

export const GLOBAL_SCOPE: Scope = { level: 'global', section: null, row: null, bay: null }

export const LEVEL_LABEL: Record<Level, string> = { global: tr('Padrão', 'Default'), section: tr('Seção', 'Section'), row: tr('Fila', 'Row'), bay: tr('Gaveta', 'Drawer') }

const UNSAFE = new Set(['__proto__', 'constructor', 'prototype'])

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function getIn(obj: unknown, path: string): unknown {
  let cur: unknown = obj
  for (const k of path.split('.')) {
    if (typeof cur !== 'object' || cur === null) return undefined
    cur = (cur as Record<string, unknown>)[k]
  }
  return cur
}

export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isObj(patch)) return base
  const out: Record<string, unknown> = isObj(base) ? { ...base } : {}
  for (const [k, v] of Object.entries(patch)) {
    if (UNSAFE.has(k) || v === undefined) continue
    out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : isObj(v) ? deepMerge({}, v) : v
  }
  return out as T
}

/** Ordered layers that apply at a scope, lowest priority first. */
export function layersOf(p: ProjectState, scope: Scope): Array<{ level: Level; patch: unknown }> {
  const layers: Array<{ level: Level; patch: unknown }> = [{ level: 'global', patch: p.drawerDefaults }]
  const sec = scope.section != null ? p.sections[scope.section] : undefined
  if (scope.level !== 'global' && sec) layers.push({ level: 'section', patch: sec.drawer })
  if ((scope.level === 'row' || scope.level === 'bay') && sec && scope.row != null) {
    layers.push({ level: 'row', patch: sec.rows[scope.row]?.drawer })
  }
  if (scope.level === 'bay' && scope.bay) layers.push({ level: 'bay', patch: p.overrides[scope.bay] })
  return layers
}

export function resolveAt(p: ProjectState, scope: Scope): DrawerConfig {
  let cfg = p.drawerDefaults
  for (const l of layersOf(p, scope).slice(1)) cfg = deepMerge(cfg, l.patch)
  return cfg
}

/** Effective config of one drawer: what the generator uses. */
export function resolveForBay(p: ProjectState, sectionIdx: number, rowIdx: number, bayId: string): DrawerConfig {
  return resolveAt(p, { level: 'bay', section: sectionIdx, row: rowIdx, bay: bayId })
}

/** Which level provides the effective value of `path` (e.g. `sides.fill`) at this scope. */
export function sourceOf(p: ProjectState, scope: Scope, path: string): Level {
  let src: Level = 'global'
  for (const l of layersOf(p, scope)) if (l.level !== 'global' && getIn(l.patch, path) !== undefined) src = l.level
  return src
}

/** Dotted path (on ProjectState) of the patch object edited at a scope. */
export function scopeRoot(scope: Scope): string {
  switch (scope.level) {
    case 'global': return 'drawerDefaults'
    case 'section': return `sections.${scope.section}.drawer`
    case 'row': return `sections.${scope.section}.rows.${scope.row}.drawer`
    case 'bay': return `overrides.${scope.bay}`
  }
}

export function patchAt(p: ProjectState, scope: Scope): unknown {
  return getIn(p, scopeRoot(scope))
}

/** True when the patch object holds at least one value. */
export function hasValues(patch: unknown): boolean {
  if (!isObj(patch)) return false
  return Object.values(patch).some((v) => (isObj(v) ? hasValues(v) : v !== undefined))
}

/** Removes empty objects left behind on the way up after a key was deleted. */
export function pruneEmpty(root: Record<string, unknown>, path: string): void {
  const ks = path.split('.')
  for (let i = ks.length - 1; i > 0; i--) {
    const parent = getIn(root, ks.slice(0, i).join('.'))
    if (isObj(parent) && Object.keys(parent).length === 0) {
      const grand = getIn(root, ks.slice(0, i - 1).join('.')) ?? root
      if (isObj(grand)) delete grand[ks[i - 1]!]
    } else break
  }
}
