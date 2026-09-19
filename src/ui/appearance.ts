import type { Part, PartGroup } from '../model/part'
import type { ProjectState } from '../model/types'

export const GROUP_DEFAULT: Record<PartGroup, string> = {
  gabinete: '#7b93ad',
  gaveta: '#2dd4bf',
  skin: '#2dd4bf',
  espacador: '#f6b03c',
  fixacao: '#f6b03c',
  teste: '#c084fc',
}

export const GROUP_NAME: Record<PartGroup, string> = {
  gabinete: 'Gabinete',
  gaveta: 'Gavetas',
  skin: 'Skins',
  espacador: 'Espaçadores',
  fixacao: 'Fixações',
  teste: 'Teste',
}

/**
 * Part ids of drawers and dividers end in a hash of their settings, so the id changes whenever a parameter changes.
 * The family drops that hash: same kind and size, whatever the settings. Hiding, isolating and colouring use it so
 * they survive parameter edits.
 */
export const partFamily = (id: string): string => (/^(gaveta|divisoria)-/.test(id) ? id.replace(/-[0-9a-z]+$/, '') : id)

export const isPartHidden = (v: { hiddenParts: string[] }, id: string): boolean => {
  const f = partFamily(id)
  return v.hiddenParts.some((h) => partFamily(h) === f)
}

export interface Colors {
  groups: Record<string, string>
  parts: Record<string, string>
}

export const NO_COLORS: Colors = { groups: {}, parts: {} }

/** Colour of a part: its own override, else its group's override, else the built-in colour. */
export function partColor(colors: Colors | undefined, part: Pick<Part, 'id' | 'group' | 'color'>): string {
  return (
    colors?.parts[partFamily(part.id)] ?? colors?.parts[part.id] ?? colors?.groups[part.group] ?? (part.group === 'skin' && part.color ? part.color : GROUP_DEFAULT[part.group])
  )
}

export interface Visibility {
  hiddenGroups: PartGroup[]
  hiddenParts: string[]
  /** Show only this part type (all copies, or just the first one when `isolateOne`). */
  isolate: string | null
  isolateOne: boolean
  /** Show only the drawer parts of this bay. A bay id survives regeneration; a part id does not (it embeds the settings). */
  isolateBay: string | null
  /** Assembly guide: show only parts whose (raw) assembly step is at most this. */
  maxStep?: number | null
}

export const ALL_VISIBLE: Visibility = { hiddenGroups: [], hiddenParts: [], isolate: null, isolateOne: true, isolateBay: null }

export function isInstanceVisible(v: Visibility, group: PartGroup, partId: string, index: number, inBay = false, step: number | null = null): boolean {
  if (v.maxStep != null) return step !== null && step <= v.maxStep
  if (v.isolateBay) return group === 'gaveta' && inBay
  if (v.isolate) return partFamily(partId) === partFamily(v.isolate) && (!v.isolateOne || index === 0)
  return !v.hiddenGroups.includes(group) && !isPartHidden(v, partId)
}

export function anyHidden(v: Visibility): boolean {
  return v.isolate !== null || v.isolateBay !== null || v.hiddenGroups.length > 0 || v.hiddenParts.length > 0
}

export function projectColors(p: ProjectState): Colors {
  return p.colors ?? NO_COLORS
}
