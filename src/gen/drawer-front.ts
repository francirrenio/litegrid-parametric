import type { Nozzle } from '../core/nozzle'
import type { Mesh, Vec2 } from '../geom/mesh'
import type { DrawerConfig } from '../model/types'
import polygonClipping from 'polygon-clipping'
import { clamp, prismAxis } from './drawer-prims'
import type { DrawerCtx } from './drawer-walls'

const OV = 0.3
const GRIP_H = 8
const GRIP_DEPTH = 6
export const CHANNEL_DEPTH = 2
const LIP_T = 1

export interface FrontPlan {
  /** Horizontal length of the front slope (0 = flat front). */
  s: number
  Hf: number
  /** Always 0: nothing sticks out of the front plane, so the drawer keeps its full depth. */
  barOut: number
  /** Finger slot through the front wall for the recessed pull (handle 'bar'). */
  slot: { x0: number; x1: number; y0: number; y1: number } | null
  /** Recess in the front face where the label holder sits flush; the wall behind it is `wf - depth` thick. */
  pocket: { x0: number; x1: number; y0: number; y1: number; depth: number } | null
  notch: { nw: number; nd: number; bh: number } | null
  label: { lw: number; y0: number; y1: number; ys: number; fr: number } | null
  /** Total front wall thickness. */
  wf: number
  /** Inward lip along the top of the front wall, or null. */
  lip: { depth: number } | null
  /** Groove in the front face that holds the paper label (label mode 'internal'). */
  channel: { x0: number; x1: number; y0: number } | null
}

const num = (v: unknown): number | null => (typeof v === 'number' && v > 0 ? v : null)

export function planFront(W: number, H: number, w: number, fT: number, nz: Nozzle, cfg: DrawerConfig, D: number): FrontPlan {
  let s = 0
  let Hf = H
  if (cfg.front === 'slope' && H >= 25) {
    const fh = num(cfg.frontHeight)
    const cl = num(cfg.chamferLength)
    Hf = fh !== null ? clamp(fh, fT + 10, H) : clamp(Math.round(H * 0.55), fT + 10, H)
    s = cl ?? H - Hf
    const maxS = D * 0.6
    if (s > maxS) {
      s = maxS
      if (cl === null && fh === null) Hf = H - s
    }
    if (s < 6 || H - Hf < 3) { s = 0; Hf = H }
  }
  const barOut = 0
  let slot: FrontPlan['slot'] = null
  if (cfg.handle === 'bar' && Hf - GRIP_H - 2 >= fT + 10 && W - 2 * w >= 24) {
    const bw = Math.min(60, (W - 2 * w) * 0.5)
    slot = { x0: W / 2 - bw / 2, x1: W / 2 + bw / 2, y0: Hf - 2 - GRIP_H, y1: Hf - 2 }
  }
  let notch: FrontPlan['notch'] = null
  if (cfg.handle === 'cutout') {
    const nw = Math.min(clamp(0.35 * (W - 2 * w), 16, 32), (W - 2 * w) * 0.5)
    const nd = Math.min(12, Hf - fT - 6, nw / 2 - 2)
    if (nd >= 3) notch = { nw, nd, bh: nw / 2 - nd }
  }
  const label: FrontPlan['label'] = null
  const wf = w
  const lip = cfg.frontLip || cfg.front === 'lip' ? { depth: clamp(num(cfg.lipDepth) ?? 8, 3, 20) } : null
  return { s, Hf, barOut, slot, pocket: null, notch, label, wf, lip, channel: null }
}

const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]

function frontOutline(c: DrawerCtx, plan: FrontPlan): Vec2[] {
  const xa = c.w / 2, xb = c.W - c.w / 2, cx = c.W / 2
  const pts: Vec2[] = [[xa, 0], [xb, 0], [xb, plan.Hf]]
  if (plan.notch) {
    const { nw, nd, bh } = plan.notch
    pts.push([cx + nw / 2, plan.Hf], [cx + bh, plan.Hf - nd], [cx - bh, plan.Hf - nd], [cx - nw / 2, plan.Hf])
  }
  pts.push([xa, plan.Hf])
  return pts
}

export function frontMeshes(c: DrawerCtx, plan: FrontPlan): Mesh[] {
  const out: Mesh[] = []
  const { W, Zf, Hf } = { ...c, Hf: plan.Hf }
  const cx = W / 2
  const outline = frontOutline(c, plan)
  const hole = (r: { x0: number; x1: number; y0: number; y1: number }): Vec2[] => rect(r.x0, r.y0, r.x1, r.y1)
  const slotHole = plan.slot ? [hole(plan.slot)] : []
  if (plan.channel) {
    // Groove for the paper card, open at the top: the front layer is the outline minus the groove, with a small lip on each side.
    const ch = plan.channel
    const d = CHANNEL_DEPTH
    out.push(prismAxis('z', outline, slotHole, Zf - plan.wf, Zf - d + OV))
    const groove: Array<[number, number]> = [[ch.x0, ch.y0], [ch.x1, ch.y0], [ch.x1, Hf + 5], [ch.x0, Hf + 5]]
    const shape = polygonClipping.difference([outline.map(([a, b]) => [a, b] as [number, number])], [groove])
    for (const poly of shape) {
      const rings = poly.map((r) => r.slice(0, -1).map(([a, b]) => [a, b] as Vec2))
      out.push(prismAxis('z', rings[0]!, [...rings.slice(1), ...slotHole], Zf - d, Zf))
    }
    const lipP = (xw: number, dir: 1 | -1): Vec2[] => [[xw - dir * OV, Zf - LIP_T - (LIP_T + OV)], [xw + dir * LIP_T, Zf - LIP_T], [xw + dir * LIP_T, Zf], [xw - dir * OV, Zf]]
    out.push(prismAxis('y', lipP(ch.x0, 1), [], ch.y0, plan.Hf))
    out.push(prismAxis('y', lipP(ch.x1, -1).reverse(), [], ch.y0, plan.Hf))
  } else if (plan.pocket) {
    const d = plan.pocket.depth
    out.push(prismAxis('z', outline, slotHole, Zf - plan.wf, Zf - d + OV))
    out.push(prismAxis('z', outline, [hole(plan.pocket), ...slotHole], Zf - d, Zf))
  } else {
    out.push(prismAxis('z', outline, slotHole, Zf - plan.wf, Zf))
  }
  if (plan.lip) {
    const l = plan.lip.depth, tip = 1.2
    const zi = Zf - plan.wf
    const prof: Vec2[] = [[zi + OV, Hf], [zi - l, Hf], [zi - l, Hf - tip], [zi + OV, Hf - tip - (l + OV) * 1.08]]
    const x0 = c.w + 0.4, x1 = W - c.w - 0.4
    if (plan.notch) {
      const g = plan.notch.nw / 2 + 1.5
      if (cx - g - x0 > 3) out.push(prismAxis('x', prof, [], x0, cx - g))
      if (x1 - (cx + g) > 3) out.push(prismAxis('x', prof, [], cx + g, x1))
    } else out.push(prismAxis('x', prof, [], x0, x1))
  }
  if (plan.slot) {
    // Catch behind the slot: a wedge on the inside of the front wall that the finger hooks, printable without support.
    const zi = Zf - plan.wf
    const yb = plan.slot.y0
    const o = GRIP_DEPTH
    const prof: Vec2[] = [[zi + OV, yb - (o + OV) * 1.08], [zi - o, yb], [zi + OV, yb]]
    out.push(prismAxis('x', prof, [], plan.slot.x0, plan.slot.x1))
  }
  return out
}
