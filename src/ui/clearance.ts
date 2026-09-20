import type { GenerateResult } from '../model/part'
import { instanceBox } from './bounds'

export interface BayClearance {
  bay: string
  /** Gap on each side, between the drawer and the walls of its bay (mm). */
  lateral: number
  top: number
  back: number
  min: number
  /** The drawer volume touches a skeleton plate. */
  collision: boolean
}

export const OK_MIN = 0.2
export const BAD_MIN = 0.1

export type ClearanceLevel = 'ok' | 'tight' | 'bad'

export function levelOf(c: BayClearance): ClearanceLevel {
  if (c.collision || c.min < BAD_MIN) return 'bad'
  return c.min < OK_MIN ? 'tight' : 'ok'
}

/** Measures, for every bay, how much room the drawer really has, and whether it collides with the skeleton. */
export function computeClearances(result: GenerateResult): BayClearance[] {
  const t = result.layout.wallStructural
  const plates: Array<{ lo: number[]; hi: number[] }> = []
  for (const part of result.parts) {
    if (part.group !== 'gabinete') continue
    part.instances.forEach((_, i) => plates.push(instanceBox(part, i)))
  }
  const out: BayClearance[] = []
  for (const bay of result.layout.bays) {
    // A drawer split to fit the bed is several parts: take the union of every 'Gaveta' box centred in the bay.
    let best: { lo: number[]; hi: number[] } | undefined
    for (const part of result.parts) {
      if (part.group !== 'gaveta' || !/^(Gaveta|Drawer)/.test(part.label)) continue
      part.instances.forEach((_, i) => {
        const b = instanceBox(part, i)
        const cx = (b.lo[0]! + b.hi[0]!) / 2
        const cy = (b.lo[1]! + b.hi[1]!) / 2
        if (cx < bay.x || cx > bay.x + bay.clearWidth || cy < bay.y || cy > bay.y + bay.clearHeight) return
        best = best
          ? { lo: best.lo.map((v, k) => Math.min(v, b.lo[k]!)), hi: best.hi.map((v, k) => Math.max(v, b.hi[k]!)) }
          : { lo: [...b.lo], hi: [...b.hi] }
      })
    }
    if (!best) continue
    const lateral = Math.min(best.lo[0]! - bay.x, bay.x + bay.clearWidth - best.hi[0]!)
    const top = bay.y + bay.clearHeight - best.hi[1]!
    const back = best.lo[2]! - t
    const collision = plates.some((p) =>
      [0, 1, 2].every((k) => Math.min(best!.hi[k]!, p.hi[k]!) - Math.max(best!.lo[k]!, p.lo[k]!) > 0.02),
    )
    out.push({ bay: bay.id, lateral, top, back, min: Math.min(lateral, top, back), collision })
  }
  return out
}

export function summarize(list: BayClearance[]): { worst: number; tight: number; bad: number } {
  let worst = Infinity
  let tight = 0
  let bad = 0
  for (const c of list) {
    worst = Math.min(worst, c.min)
    const l = levelOf(c)
    if (l === 'tight') tight++
    else if (l === 'bad') bad++
  }
  return { worst: Number.isFinite(worst) ? worst : 0, tight, bad }
}
