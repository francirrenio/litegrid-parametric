import type { Layout } from '../core/layout'
import type { Nozzle } from '../core/nozzle'
import type { Mat4, Vec2 } from '../geom/mesh'
import type { FaceId, MaterialLevel, ProjectState } from '../model/types'
import { skeletonMetrics } from './metrics'
import { splitShape } from './split'
import {
  backPlane, diff, EMPTY, framePlane, planeBar, planeCircle, planeRect, shelfPlane, union, type Plane, type Shape,
} from './plate2d'

export type PlateKind = 'costas' | 'base' | 'topo' | 'quadro' | 'prateleira'

export interface SkeletonPlate {
  key: string
  kind: PlateKind
  label: string
  step: number
  thickness: number
  plane: Plane
  /** Plate-local shape (x, y); extrude by `thickness`. */
  shape: Shape
  /** Placement of this plate in assembled space (plate-local -> assembled). */
  matrix: Mat4
}

export interface SkeletonSection {
  xl: number
  xr: number
  /** y of each shelf plate bottom face between consecutive rows (top to bottom), plus the row loads. */
  shelves: Array<{ y: number; loadAbove: 'leve' | 'media' | 'pesada' }>
}

export interface SkeletonGeometry {
  W: number
  H: number
  D: number
  t: number
  bw: number
  fit: number
  frames: number[]
  sections: SkeletonSection[]
  plates: SkeletonPlate[]
  warnings: string[]
}

type Load = 'leve' | 'media' | 'pesada'
type ShelfMode = 'rails' | 'frame' | 'closed'

const r2 = (n: number) => Math.round(n * 100) / 100

function evenCenters(a0: number, a1: number, n: number): number[] {
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push(a0 + ((i + 0.5) * (a1 - a0)) / n)
  return out
}

function tabLength(span: number, n: number): number {
  return Math.min(18, Math.max(8, (span / n) * 0.35))
}

function shelfMode(level: MaterialLevel, load: Load, isBase: boolean): ShelfMode {
  const heavy = load === 'pesada' || (load === 'media' && level === 'reforcado')
  if (level === 'reforcado') return 'closed'
  if (heavy) return level === 'minimo' ? 'frame' : 'closed'
  if (level === 'minimo') return isBase ? 'frame' : 'rails'
  return 'frame'
}

function mergeBars(bars: Array<[number, number]>, gap: number): Array<[number, number]> {
  const s = bars.slice().sort((a, b) => a[0] - b[0])
  const out: Array<[number, number]> = []
  for (const b of s) {
    const last = out[out.length - 1]
    if (last && b[0] - last[1] < gap) last[1] = Math.max(last[1], b[1])
    else out.push([b[0], b[1]])
  }
  return out
}

/** Free intervals between bars inside [lo, hi]. */
function gaps(bars: Array<[number, number]>, lo: number, hi: number, minSize: number): Array<[number, number]> {
  const out: Array<[number, number]> = []
  let cur = lo
  for (const [a, b] of mergeBars(bars, 0)) {
    if (a - cur >= minSize) out.push([cur, a])
    cur = Math.max(cur, b)
  }
  if (hi - cur >= minSize) out.push([cur, hi])
  return out
}

type Bracing = ProjectState['skeleton']['bracing']

/** Window rectangle minus its braces (one diagonal, an X, corner gussets or nothing). */
function brace(
  pl: Plane, a0: number, a1: number, b0: number, b1: number, mode: 'none' | 'corners' | 'diag' | 'x', flip: boolean, bw: number,
): Shape {
  const win = planeRect(pl, a0, a1, b0, b1)
  const dw = Math.max(3, bw * 0.55)
  if (mode === 'none') return win
  if (mode === 'diag') {
    return diff(win, flip ? planeBar(pl, a0, b1, a1, b0, dw) : planeBar(pl, a0, b0, a1, b1, dw))
  }
  if (mode === 'x') return diff(win, planeBar(pl, a0, b0, a1, b1, dw), planeBar(pl, a0, b1, a1, b0, dw))
  const leg = Math.min(a1 - a0, b1 - b0) * 0.35
  const tri = (ca: number, cb: number, sa: number, sb: number): Shape => {
    const p = pl.toLocal(ca, cb), q = pl.toLocal(ca + sa * leg, cb), r = pl.toLocal(ca, cb + sb * leg)
    return [[[[p[0], p[1]], [q[0], q[1]], [r[0], r[1]], [p[0], p[1]]]]]
  }
  return diff(win, tri(a0, b0, 1, 1), tri(a1, b0, -1, 1), tri(a0, b1, 1, -1), tri(a1, b1, -1, -1))
}

function bracingFor(b: Bracing): 'none' | 'corners' | 'diag' | 'x' {
  switch (b) {
    case 'none': return 'none'
    case 'corners': return 'corners'
    case 'diagonal': return 'x'
    default: return 'diag'
  }
}

export function buildSkeleton(p: ProjectState, layout: Layout, nz: Nozzle, joinery = true): SkeletonGeometry {
  const { t, bw, fit } = skeletonMetrics(p, nz)
  const W = p.width, H = p.height, D = p.depth
  const warnings: string[] = []
  const nSec = p.sections.length

  const sections: SkeletonSection[] = []
  for (let s = 1; s <= nSec; s++) {
    const bays = layout.bays.filter((b) => b.section === s)
    if (bays.length === 0) continue
    const xl = Math.min(...bays.map((b) => b.x))
    const xr = Math.max(...bays.map((b) => b.x + b.clearWidth))
    const rows = [...new Set(bays.map((b) => b.row))].sort((a, b) => a - b)
    const shelves: SkeletonSection['shelves'] = []
    rows.forEach((row, i) => {
      if (i === 0) return
      const above = bays.find((b) => b.row === row - 1)!
      const load = p.sections[s - 1]?.rows[row - 2]?.load ?? 'media'
      shelves.push({ y: above.y - t, loadAbove: load })
    })
    sections.push({ xl, xr, shelves })
  }
  const frames: number[] = [0]
  for (let k = 0; k < sections.length - 1; k++) frames.push(sections[k]!.xr)
  frames.push(W - t)

  const nZ = Math.max(2, Math.round((D - t) / 70))
  const tlZ = tabLength(D - t, nZ)
  const zc = evenCenters(t + bw, D - bw, nZ)
  const nY = Math.max(2, Math.round((H - 2 * t) / 70))
  const tlY = tabLength(H - 2 * t, nY)
  const yc = evenCenters(t + bw, H - t - bw, nY)
  const slotZ = (c: number, tl: number): [number, number] => [c - tl / 2 - fit, c + tl / 2 + fit]
  const brMode = bracingFor(p.skeleton.bracing)
  const level = p.materialLevel

  const plates: SkeletonPlate[] = []
  const anchors = (face: FaceId) => ({ points: skeletonAnchors(p, nz, face) })

  /* ── back plate ─────────────────────────────────────────────── */
  {
    const pl = backPlane()
    let shape = planeRect(pl, 0, W, 0, H)
    const cuts: Shape[] = []
    const barsX: Array<[number, number]> = [[0, bw], [W - bw, W], ...frames.map((x): [number, number] => [x + t / 2 - bw / 2, x + t / 2 + bw / 2])]
    const xGaps = gaps(barsX, 0, W, 6)
    for (const [xa, xb] of xGaps) {
      const sec = sections.find((s) => xa >= s.xl - bw && xb <= s.xr + bw)
      const barsY: Array<[number, number]> = [[0, bw], [H - bw, H]]
      for (const sh of sec?.shelves ?? []) barsY.push([sh.y + t / 2 - bw / 2, sh.y + t / 2 + bw / 2])
      const yGaps = gaps(barsY, 0, H, 6)
      yGaps.forEach(([ya, yb], i) => {
        if (p.skeleton.bracing === 'back') return
        cuts.push(brace(pl, xa, xb, ya, yb, brMode, i % 2 === 1, bw))
      })
    }
    for (const x of joinery ? frames : []) {
      for (const c of yc) cuts.push(planeRect(pl, x - fit, x + t + fit, c - tlY / 2 - fit, c + tlY / 2 + fit))
    }
    for (const sec of joinery ? sections : []) {
      const nX = Math.max(2, Math.round((sec.xr - sec.xl) / 70))
      for (const sh of sec.shelves) {
        for (const cx of evenCenters(sec.xl + bw, sec.xr - bw, nX)) {
          cuts.push(planeRect(pl, cx - tlZ / 2 - fit, cx + tlZ / 2 + fit, sh.y - fit, sh.y + t + fit))
        }
      }
    }
    const nXe = Math.max(3, Math.round(W / 70))
    for (const cx of joinery ? evenCenters(bw + 2, W - bw - 2, nXe) : []) {
      cuts.push(planeRect(pl, cx - tlZ / 2 - fit, cx + tlZ / 2 + fit, -1, t + fit))
      cuts.push(planeRect(pl, cx - tlZ / 2 - fit, cx + tlZ / 2 + fit, H - t - fit, H + 1))
    }
    for (const [u, v] of anchors('back').points) cuts.push(planeCircle(pl, W - u, v, skeletonMetrics(p, nz).holeD / 2 + fit / 2))
    shape = diff(shape, ...cuts)
    plates.push({ key: 'costas', kind: 'costas', label: 'Costas', step: 1, thickness: t, plane: pl, shape, matrix: pl.matrix })
  }

  /* ── base and top plates (XZ) ───────────────────────────────── */
  const horizontal = (kind: 'base' | 'topo'): SkeletonPlate => {
    const y0 = kind === 'base' ? 0 : H - t
    const pl = shelfPlane(y0, D)
    let shape = planeRect(pl, 0, W, t, D)
    const tabs: Shape[] = []
    const nXe = Math.max(3, Math.round(W / 70))
    for (const cx of evenCenters(bw + 2, W - bw - 2, nXe)) tabs.push(planeRect(pl, cx - tlZ / 2, cx + tlZ / 2, 0, t))
    if (joinery) shape = union(shape, ...tabs)
    const cuts: Shape[] = []
    for (const x of joinery ? frames : []) for (const c of zc) {
      const [z0, z1] = slotZ(c, tlZ)
      cuts.push(planeRect(pl, x - fit, x + t + fit, z0, z1))
    }
    const load: Load = kind === 'base' ? (p.sections[0]?.rows.at(-1)?.load ?? 'media') : 'leve'
    const mode = kind === 'base' ? shelfMode(level, load, true) : level === 'reforcado' ? 'closed' : 'rails'
    cuts.push(...shelfWindows(pl, mode, 0, W, t, D, bw, frames.map((x) => [x - bw / 2 + t / 2, x + bw / 2 + t / 2] as [number, number])))
    for (const [u, v] of anchors(kind === 'base' ? 'bottom' : 'top').points) {
      const z = kind === 'base' ? v : D - v
      cuts.push(planeCircle(pl, u, z, skeletonMetrics(p, nz).holeD / 2 + fit / 2))
    }
    shape = diff(shape, ...cuts)
    return {
      key: kind, kind, label: kind === 'base' ? 'Base' : 'Topo', step: kind === 'base' ? 2 : 5,
      thickness: t, plane: pl, shape, matrix: pl.matrix,
    }
  }
  plates.push(horizontal('base'), horizontal('topo'))

  /* ── vertical frames (YZ) ───────────────────────────────────── */
  frames.forEach((x0, k) => {
    const pl = framePlane(x0, D)
    let shape = planeRect(pl, t, D, t, H - t)
    const tabs: Shape[] = []
    for (const c of zc) {
      tabs.push(planeRect(pl, c - tlZ / 2, c + tlZ / 2, H - t, H))
      tabs.push(planeRect(pl, c - tlZ / 2, c + tlZ / 2, 0, t))
    }
    for (const c of yc) tabs.push(planeRect(pl, 0, t, c - tlY / 2, c + tlY / 2))
    if (joinery) shape = union(shape, ...tabs)

    const adj = [sections[k - 1], sections[k]].filter((s): s is SkeletonSection => !!s)
    const barsY: Array<[number, number]> = [[t, t + bw], [H - t - bw, H - t]]
    const slots: Shape[] = []
    for (const sec of adj) {
      for (const sh of sec.shelves) {
        barsY.push([sh.y + t / 2 - bw / 2, sh.y + t / 2 + bw / 2])
        for (const c of joinery ? zc : []) {
          const [z0, z1] = slotZ(c, tlZ)
          slots.push(planeRect(pl, z0, z1, sh.y - fit, sh.y + t + fit))
        }
      }
    }
    const cuts: Shape[] = slots
    const yGaps = gaps(barsY, t, H - t, 6)
    yGaps.forEach(([ya, yb], i) => {
      if (D - 2 * bw - t < 10) return
      cuts.push(brace(pl, t + bw, D - bw, ya, yb, brMode, (i + k) % 2 === 1, bw))
    })
    const hole = skeletonMetrics(p, nz).holeD / 2 + fit / 2
    if (k === 0) for (const [u, v] of anchors('left').points) cuts.push(planeCircle(pl, u, v, hole))
    if (k === frames.length - 1) for (const [u, v] of anchors('right').points) cuts.push(planeCircle(pl, D - u, v, hole))
    shape = diff(shape, ...cuts)
    plates.push({
      key: `quadro-${k}`, kind: 'quadro', label: k === 0 || k === frames.length - 1 ? 'Quadro lateral' : 'Quadro divisor',
      step: 3, thickness: t, plane: pl, shape, matrix: pl.matrix,
    })
  })

  /* ── shelves (XZ) ───────────────────────────────────────────── */
  sections.forEach((sec, s) => {
    const xa = frames[s]! + t
    const xb = frames[s + 1]!
    const extL = s === 0, extR = s === sections.length - 1
    const tlL = extL ? t : Math.max(0.6, t / 2 - 0.1)
    const tlR = extR ? t : Math.max(0.6, t / 2 - 0.1)
    for (const sh of sec.shelves) {
      const pl = shelfPlane(sh.y, D)
      let shape = planeRect(pl, xa, xb, t, D)
      const tabs: Shape[] = []
      for (const c of zc) {
        tabs.push(planeRect(pl, xa - tlL, xa, c - tlZ / 2, c + tlZ / 2))
        tabs.push(planeRect(pl, xb, xb + tlR, c - tlZ / 2, c + tlZ / 2))
      }
      const nX = Math.max(2, Math.round((xb - xa) / 70))
      for (const cx of evenCenters(xa + bw, xb - bw, nX)) tabs.push(planeRect(pl, cx - tlZ / 2, cx + tlZ / 2, 0, t))
      if (joinery) shape = union(shape, ...tabs)
      const mode = shelfMode(level, sh.loadAbove, false)
      shape = diff(shape, ...shelfWindows(pl, mode, xa, xb, t, D, bw, []))
      plates.push({
        key: `prat-${s}-${r2(sh.y)}`, kind: 'prateleira', label: 'Prateleira', step: 4,
        thickness: t, plane: pl, shape, matrix: pl.matrix,
      })
    }
  })

  if (p.skeleton.bracing === 'none') warnings.push('Sem travamento: o esqueleto pode deformar como paralelogramo. Use diagonais, esquadros ou costas fechadas.')
  const finalPlates: SkeletonPlate[] = []
  for (const pl of plates) {
    const pieces = joinery ? splitShape(pl.shape, p.printBed, fit) : [pl.shape]
    pieces.forEach((shape, i) => {
      const many = pieces.length > 1
      finalPlates.push({
        ...pl,
        shape,
        key: many ? `${pl.key}#${i + 1}` : pl.key,
        label: many ? `${pl.label} (${i + 1}/${pieces.length})` : pl.label,
      })
    })
    if (pieces.length > 1) warnings.push(`${pl.label} passa da mesa e foi dividida em ${pieces.length} partes com encaixe no plano.`)
  }
  return { W, H, D, t, bw, fit, frames, sections, plates: finalPlates, warnings }
}

/** Openings of a horizontal plate. `keep` lists x-intervals that must stay solid (bars over frames). */
function shelfWindows(
  pl: Plane, mode: ShelfMode, xa: number, xb: number, za: number, zb: number, bw: number, keep: Array<[number, number]>,
): Shape[] {
  if (mode === 'closed') return []
  const z0 = za + bw, z1 = zb - bw
  if (z1 - z0 < 10) return []
  const bars: Array<[number, number]> = [[xa, xa + bw], [xb - bw, xb], ...keep.filter(([a, b]) => b > xa && a < xb)]
  if (mode === 'frame') {
    const span = xb - xa
    const n = Math.max(0, Math.round(span / 60) - 1)
    for (let i = 1; i <= n; i++) {
      const c = xa + (span * i) / (n + 1)
      bars.push([c - bw * 0.3, c + bw * 0.3])
    }
  }
  return gaps(bars, xa, xb, 6).map(([a, b]) => planeRect(pl, a, b, z0, z1))
}

/** Peg/hole centres (face-local u, v) along the skeleton's outer bars for a face. */
export function skeletonAnchors(p: ProjectState, nz: Nozzle, face: FaceId): Vec2[] {
  const { t, bw } = skeletonMetrics(p, nz)
  const W = p.width, H = p.height, D = p.depth
  const c = bw / 2
  let u0: number, u1: number, v0: number, v1: number
  switch (face) {
    case 'left': [u0, u1, v0, v1] = [t + c, D - c, t + c, H - t - c]; break
    case 'right': [u0, u1, v0, v1] = [c, D - t - c, t + c, H - t - c]; break
    case 'back': [u0, u1, v0, v1] = [c, W - c, c, H - c]; break
    case 'top': [u0, u1, v0, v1] = [c, W - c, c, D - t - c]; break
    case 'bottom': [u0, u1, v0, v1] = [c, W - c, t + c, D - c]; break
  }
  const pts: Vec2[] = []
  const side = (a: Vec2, b: Vec2) => {
    const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 40))
    for (let i = 0; i < n; i++) pts.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n])
  }
  side([u0, v0], [u1, v0])
  side([u1, v0], [u1, v1])
  side([u1, v1], [u0, v1])
  side([u0, v1], [u0, v0])
  return pts
}

export { EMPTY }
