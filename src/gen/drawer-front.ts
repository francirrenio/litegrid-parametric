import type { Nozzle } from '../core/nozzle'
import type { Mesh, Vec2 } from '../geom/mesh'
import type { DrawerConfig } from '../model/types'
import { clamp, prismAxis } from './drawer-prims'
import type { DrawerCtx } from './drawer-walls'

const OV = 0.3
const CARD_GAP = 0.6
const BAR_OUT = 7

export interface FrontPlan {
  s: number
  Hf: number
  barOut: number
  notch: { nw: number; nd: number; bh: number } | null
  label: { lw: number; y0: number; y1: number; ys: number; fr: number } | null
  /** Total front wall thickness. */
  wf: number
}

export function planFront(W: number, H: number, w: number, fT: number, nz: Nozzle, cfg: DrawerConfig): FrontPlan {
  let s = 0
  let Hf = H
  if (cfg.front === 'slope' && H >= 25) {
    Hf = clamp(Math.round(H * 0.55), fT + 10, H)
    s = H - Hf
    if (s < 6) { s = 0; Hf = H }
  }
  const barOut = cfg.handle === 'bar' ? BAR_OUT : 0
  let notch: FrontPlan['notch'] = null
  if (cfg.handle === 'cutout') {
    const nw = Math.min(clamp(0.35 * (W - 2 * w), 16, 32), (W - 2 * w) * 0.5)
    const nd = Math.min(12, Hf - fT - 6, nw / 2 - 2)
    if (nd >= 3) notch = { nw, nd, bh: nw / 2 - nd }
  }
  let label: FrontPlan['label'] = null
  if (cfg.labelHolder && W - 2 * w >= 40) {
    const lw = Math.min(W - 2 * w - 10, 60)
    const reserved = notch ? notch.nd : barOut ? barOut + 3 : 0
    const y1 = Hf - (reserved + 1.5)
    const y0 = y1 - clamp(0.35 * Hf, 6, 14)
    const ys = y0 - 1.5
    if (lw >= (notch ? notch.nw + 6 : 28) && ys >= fT + 2 && y1 - y0 >= 5) label = { lw, y0, y1, ys, fr: nz.wall(2) }
  }
  const wf = label ? w + CARD_GAP + label.fr : w
  return { s, Hf, barOut, notch, label, wf }
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
  const { W, w, Zf, Hf } = plan.label ? { ...c, Hf: plan.Hf } : { ...c, Hf: plan.Hf }
  const outline = frontOutline(c, plan)
  const cx = W / 2
  const lab = plan.label
  if (!lab) {
    out.push(prismAxis('z', outline, [], Zf - w, Zf))
  } else {
    const zi = Zf - plan.wf
    out.push(prismAxis('z', outline, [], zi, zi + w))
    const zSkin = Zf - lab.fr
    const win = rect(cx - lab.lw / 2 + 2, lab.y0, cx + lab.lw / 2 - 2, lab.y1)
    out.push(prismAxis('z', outline, [win], zSkin, Zf))
    const sx0 = cx - lab.lw / 2, sx1 = cx + lab.lw / 2
    const xa = w / 2, xb = W - w / 2
    const spacer: Vec2[] = [[xa, 0], [xb, 0], [xb, Hf], [sx1, Hf], [sx1, lab.ys], [sx0, lab.ys], [sx0, Hf], [xa, Hf]]
    out.push(prismAxis('z', spacer, [], zi + w - OV, zSkin + OV))
  }
  if (c.cfg.front === 'lip') {
    const l = 8, tip = 1.2
    const zi = Zf - plan.wf
    const prof: Vec2[] = [[zi + OV, Hf], [zi - l, Hf], [zi - l, Hf - tip], [zi + OV, Hf - tip - (l + OV) * 1.08]]
    const x0 = w + 0.4, x1 = W - w - 0.4
    if (plan.notch) {
      const g = plan.notch.nw / 2 + 1.5
      if (cx - g - x0 > 3) out.push(prismAxis('x', prof, [], x0, cx - g))
      if (x1 - (cx + g) > 3) out.push(prismAxis('x', prof, [], cx + g, x1))
    } else out.push(prismAxis('x', prof, [], x0, x1))
  }
  if (plan.barOut > 0) {
    const yt = Hf - 1.5
    const o = plan.barOut
    const prof: Vec2[] = [[Zf - OV, yt - (o + OV) * 1.08], [Zf + o, yt], [Zf - OV, yt]]
    const bw = Math.min(60, (W - 2 * w) * 0.5)
    out.push(prismAxis('x', prof, [], cx - bw / 2, cx + bw / 2))
  }
  return out
}
