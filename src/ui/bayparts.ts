import type { GenerateResult, PartGroup } from '../model/part'
import { isPartHidden, partFamily, type Visibility } from './appearance'
import { instanceBox } from './bounds'

export interface BayPart {
  id: string
  label: string
  group: PartGroup
}

/** Drawer parts (drawer, dividers, label holder) whose copy sits in this bay. */
export function partsInBay(result: GenerateResult, bayId: string): BayPart[] {
  const bay = result.layout.bays.find((b) => b.id === bayId)
  if (!bay) return []
  const found = new Map<string, BayPart>()
  for (const part of result.parts) {
    if (part.group !== 'gaveta') continue
    part.instances.forEach((_, i) => {
      const b = instanceBox(part, i)
      const cx = (b.lo[0] + b.hi[0]) / 2
      const cy = (b.lo[1] + b.hi[1]) / 2
      if (cx >= bay.x && cx <= bay.x + bay.clearWidth && cy >= bay.y && cy <= bay.y + bay.clearHeight) {
        found.set(part.id, { id: part.id, label: part.label, group: part.group })
      }
    })
  }
  return [...found.values()]
}

export interface HiddenEntry {
  kind: 'part' | 'group' | 'all'
  id: string
  label: string
}

/** What is hidden in this bay and the single action that brings it back. */
export function hiddenInBay(result: GenerateResult, vis: Visibility, bayId: string): HiddenEntry[] {
  const out = new Map<string, HiddenEntry>()
  if (vis.isolateBay && vis.isolateBay !== bayId) out.set('all', { kind: 'all', id: 'all', label: 'tudo' })
  for (const p of partsInBay(result, bayId)) {
    if (vis.isolate && (partFamily(vis.isolate) !== partFamily(p.id) || vis.isolateOne)) {
      out.set('all', { kind: 'all', id: 'all', label: 'tudo' })
    } else if (isPartHidden(vis, p.id)) {
      out.set(`part:${p.id}`, { kind: 'part', id: p.id, label: p.label })
    } else if (vis.hiddenGroups.includes(p.group)) {
      out.set(`group:${p.group}`, { kind: 'group', id: p.group, label: 'todas as gavetas' })
    }
  }
  return [...out.values()]
}
