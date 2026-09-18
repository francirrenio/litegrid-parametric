import type { Nozzle } from '../core/nozzle'
import type { Mesh, Vec2 } from '../geom/mesh'
import type { DrawerConfig, FaceFill, Load, Reinforcement } from '../model/types'
import { generatePattern } from './patterns'
import { clamp, prismAxis, slantedStrut } from './drawer-prims'

/**
 * Drawer-local frame (mm): x right, y up, z toward the front, origin at left-bottom-back.
 * Pieces are closed prisms that overlap (interpenetrate) by ~0.3 mm instead of sharing faces, so each shell is
 * watertight on its own and slicers merge them by union.
 */
export interface DrawerCtx {
  W: number
  H: number
  /** Outer face of the front wall (D minus the bar handle protrusion). */
  Zf: number
  w: number
  /** Front wall total thickness (bigger with the label holder). */
  wf: number
  fT: number
  /** Front drop for the hopper style (0 = flat). */
  s: number
  Hf: number
  nz: Nozzle
  cfg: DrawerConfig
  load: Load
  smallest: number
  reinf: Reinforcement
}

export type Wall = 'left' | 'right' | 'back' | 'front'
const OV = 0.3
const OV2 = 0.5
const SQRT2 = Math.SQRT2

export const topAt = (c: DrawerCtx, z: number) => (c.s > 0 && z > c.Zf - c.s ? Math.max(c.Hf, c.H - (z - (c.Zf - c.s))) : c.H)

/** Distance n from the wall's outer surface -> coordinate on the wall's normal axis. */
export function mapN(c: DrawerCtx, wall: Wall, n: number): number {
  return wall === 'left' ? n : wall === 'right' ? c.W - n : wall === 'back' ? n : c.Zf - n
}
const wallThick = (c: DrawerCtx, wall: Wall) => (wall === 'front' ? c.wf : c.w)

/** Prism along the wall (v axis) with a profile given as (n, y). */
export function alongWall(c: DrawerCtx, wall: Wall, prof: Vec2[], v0: number, v1: number): Mesh {
  const pts = prof.map(([n, y]) => [mapN(c, wall, n), y] as Vec2)
  return prismAxis(wall === 'left' || wall === 'right' ? 'z' : 'x', pts, [], v0, v1)
}

/** Prism across the wall (n axis) with a profile given as (v, y). */
export function acrossWall(c: DrawerCtx, wall: Wall, prof: Vec2[], n0: number, n1: number): Mesh {
  return prismAxis(wall === 'left' || wall === 'right' ? 'x' : 'z', prof, [], mapN(c, wall, n0), mapN(c, wall, n1))
}

export function frameOf(c: DrawerCtx, f: FaceFill): number {
  return f.frame === 'auto' ? Math.max(3, 2 * c.nz.lineWidth) : Math.max(0, f.frame)
}

function trussHoles(width: number, height: number, frame: number, solidUpTo: number, strut: number, maxHole: number): Vec2[][] {
  const h = maxHole / SQRT2
  if (h < 1.2) return []
  const pitch = h + strut / SQRT2
  const x0 = frame, x1 = width - frame, y0 = Math.max(frame, solidUpTo), y1 = height - frame
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  const out: Vec2[][] = []
  const nx = Math.ceil((x1 - x0) / pitch) + 2, ny = Math.ceil((y1 - y0) / pitch) + 2
  for (let j = -ny; j <= ny; j++)
    for (let i = -nx; i <= nx; i++) {
      if ((((i + j) % 2) + 2) % 2 !== 0) continue
      const px = cx + i * pitch, py = cy + j * pitch
      if (px - h < x0 - 1e-6 || px + h > x1 + 1e-6 || py - h < y0 - 1e-6 || py + h > y1 + 1e-6) continue
      out.push([[px - h, py], [px, py - h], [px + h, py], [px, py + h]])
    }
  return out
}

export function faceHoles(
  c: DrawerCtx, f: FaceFill, width: number, height: number, upright: boolean, solidUpTo: number, frame: number,
): Vec2[][] {
  if (f.fill === 'perforated') {
    return generatePattern({
      pattern: f.pattern, width, height, openPercent: f.openPercent, web: c.nz.wall(2), frame,
      solidUpTo, maxHole: c.smallest, holeSize: Math.min(c.smallest, 12), upright,
    }).holes
  }
  if (f.fill === 'truss') return trussHoles(width, height, frame, solidUpTo, Math.max(c.nz.wall(2), 3 * c.nz.lineWidth), c.smallest)
  return []
}

/** Simple wall-thickness rule: a plain wall is fine up to ~40x its thickness; beyond that add structure. */
export function resolveReinforcement(c: Omit<DrawerCtx, 'reinf'>): Reinforcement {
  const r = c.cfg.sides.reinforcement
  if (r !== 'auto') return r
  const hEff = c.H - c.fT
  const loadF = c.load === 'pesada' ? 0.6 : c.load === 'media' ? 0.8 : 1
  const openF = c.cfg.sides.fill === 'perforated' || c.cfg.sides.fill === 'truss' ? 0.85 : 1
  const limit = 40 * c.w * loadF * openF
  if (hEff <= limit) return 'none'
  return hEff <= 1.7 * limit ? 'ribs' : 'postsBeams'
}

function corrugatedStrip(len: number, thick: number, a: number): Vec2[] {
  const period = 10
  const nSeg = Math.max(2, 2 * Math.round(len / period))
  const segL = len / nSeg
  const t = (thick * Math.hypot(segL, a)) / segL
  const lo: Vec2[] = [], hi: Vec2[] = []
  for (let i = 0; i <= nSeg; i++) {
    const n = t / 2 + (i % 2 === 1 ? a : 0)
    lo.push([i * segL, n - t / 2])
    hi.push([i * segL, n + t / 2])
  }
  return [...lo, ...hi.reverse()]
}

function sideOutline(c: DrawerCtx): Vec2[] {
  return c.s > 0
    ? [[0, 0], [c.Zf, 0], [c.Zf, c.Hf], [c.Zf - c.s, c.H], [0, c.H]]
    : [[0, 0], [c.Zf, 0], [c.Zf, c.H], [0, c.H]]
}

const insideSlope = (c: DrawerCtx, h: Vec2[], margin: number) => h.every(([z, y]) => y <= topAt(c, z) - margin)

export function wallPlates(c: DrawerCtx): Mesh[] {
  const out: Mesh[] = []
  const { W, H, w, Zf, wf, fT } = c
  const sides = c.cfg.sides
  const corrugated = c.reinf === 'corrugated'
  const frame = Math.max(frameOf(c, sides), w + 1.5)
  const solid = Math.max(sides.solidUpTo, fT + 1.5)

  if (corrugated) {
    const a = 2.4
    const strip = (len: number, wall: Wall): Mesh => {
      const pts = corrugatedStrip(len, w, a)
      const prof = pts.map(([v, n]) => (wall === 'back' ? ([v, n] as Vec2) : ([n, v] as Vec2)))
      const mapped = prof.map(([p, q]) => (wall === 'right' ? ([W - p, q] as Vec2) : ([p, q] as Vec2)))
      return prismAxis('y', mapped, [], 0, H)
    }
    if (c.s === 0) {
      out.push(strip(Zf, 'left'), strip(Zf, 'right'))
    }
    // back strip is a function of x
    const back = corrugatedStrip(W - w, w, a).map(([v, n]) => [v + w / 2, n] as Vec2)
    out.push(prismAxis('y', back, [], 0, H))
    if (c.s === 0) return out
  }

  const zWidth = Zf - wf + frame
  const holesSide = sides.fill === 'perforated' || sides.fill === 'truss'
    ? faceHoles(c, sides, zWidth, H, true, solid, frame).filter((h) => insideSlope(c, h, frame * 0.6))
    : []
  if (!corrugated || c.s > 0) {
    out.push(prismAxis('x', sideOutline(c), holesSide, 0, w))
    out.push(prismAxis('x', sideOutline(c), holesSide, W - w, W))
  }
  if (!corrugated) {
    const bx0 = w / 2, bx1 = W - w / 2
    const holesBack = faceHoles(c, sides, W, H, true, solid, frame)
    out.push(prismAxis('z', [[bx0, 0], [bx1, 0], [bx1, H], [bx0, H]], holesBack, 0, w))
  }
  return out
}

function spacingFor(hEff: number) { return Math.max(28, hEff * 0.8) }

/** Reinforcement on the inner faces of the side and back walls. */
export function reinforcement(c: DrawerCtx): Mesh[] {
  const kind = c.reinf
  if (kind === 'none' || kind === 'auto' || kind === 'corrugated' && c.s === 0) return []
  const out: Mesh[] = []
  const hEff = c.H - c.fT
  const rt = Math.max(c.w, 1.6)
  const walls: Wall[] = ['left', 'right', 'back']
  const eff: Reinforcement = kind === 'corrugated' ? 'ribs' : kind
  const angleMin = (50 * Math.PI) / 180
  for (const wall of walls) {
    const sideWall = wall !== 'back'
    const v0 = c.w + 1.5
    const v1 = sideWall ? c.Zf - c.wf - 1.5 : c.W - c.w - 1.5
    const len = v1 - v0
    if (len < 6) continue
    const hb = sideWall && c.s > 0 ? c.Hf : c.H
    const n0 = c.w - OV
    const yb = 0
    if (eff === 'ribs' || eff === 'postsBeams') {
      const spacing = spacingFor(hEff)
      const n = Math.max(1, Math.ceil(len / spacing) - 1)
      const rd = eff === 'ribs' ? clamp(hEff * 0.1, 2.5, 5) : 2.4
      for (let i = 0; i < n; i++) {
        const vc = v0 + ((i + 1) * len) / (n + 1)
        const yTop = (sideWall ? Math.min(topAt(c, vc), hb + (c.s > 0 ? 0 : 0)) : c.H) - 1
        const yT = sideWall ? Math.min(topAt(c, vc + rt / 2), topAt(c, vc - rt / 2)) - 1 : yTop
        const prof: Vec2[] = eff === 'ribs'
          ? [[n0, yb], [c.w + rd, yb], [n0, yT]]
          : [[n0, yb], [c.w + rd, yb], [c.w + rd, yT], [n0, yT]]
        out.push(alongWall(c, wall, prof, vc - rt / 2, vc + rt / 2))
      }
    } else {
      const yt = hb - 1
      const rise = yt - yb
      const dvMax = rise / Math.tan(angleMin)
      const cells = Math.max(1, Math.ceil(len / dvMax))
      const dv = len / cells
      const sw = 2
      const depth = 2
      for (let k = 0; k < cells; k++) {
        const a = v0 + k * dv
        const j = 0.021 * (k % 5)
        out.push(acrossWall(c, wall, slantedStrut(a + j, yb, a + dv - sw + j, yt, sw), n0, c.w + depth))
        if (eff === 'x') out.push(acrossWall(c, wall, slantedStrut(a + dv - sw - j, yb, a - j, yt, sw), n0, c.w + depth))
        else if (k % 2 === 1) {
          out.pop()
          out.push(acrossWall(c, wall, slantedStrut(a + dv - sw + j, yb, a + j, yt, sw), n0, c.w + depth))
        }
      }
    }
  }
  return out
}

/** Horizontal lip along the top of the walls with a 45 degree underside; side lips leave gaps at divider slots. */
export function rims(c: DrawerCtx, wide: boolean, gaps: Array<[number, number]>): Mesh[] {
  const out: Mesh[] = []
  const rw = wide ? 4.5 : Math.max(2.4, c.nz.wall(2) + 1.2)
  const tip = 1.2
  const n0 = c.w - OV
  const yT = c.H
  const prof: Vec2[] = [[n0, yT], [c.w + rw, yT], [c.w + rw, yT - tip], [n0, yT - tip - (rw + OV) * 1.08]]
  const zEnd = c.s > 0 ? c.Zf - c.s - 2 : c.Zf - c.wf + OV
  const segs = (a: number, b: number, g: Array<[number, number]>): Array<[number, number]> => {
    const res: Array<[number, number]> = []
    let cur = a
    for (const [g0, g1] of g.slice().sort((p, q) => p[0] - q[0])) {
      if (g0 > cur + 1) res.push([cur, Math.min(g0, b)])
      cur = Math.max(cur, g1)
    }
    if (b > cur + 1) res.push([cur, b])
    return res
  }
  for (const wall of ['left', 'right'] as Wall[])
    for (const [a, b] of segs(c.w - OV, zEnd, gaps)) out.push(alongWall(c, wall, prof, a, b))
  out.push(alongWall(c, 'back', prof, c.w - OV2, c.W - c.w + OV2))
  return out
}

/** 45 degree fillets along the inner bottom edges. */
export function chamfers(c: DrawerCtx): Mesh[] {
  const cs = clamp(c.H * 0.07, 2, 3)
  const out: Mesh[] = []
  for (const wall of ['left', 'right', 'back', 'front'] as Wall[]) {
    const t = wallThick(c, wall)
    const prof: Vec2[] = [[t - OV, 0], [t + cs, 0], [t + cs, c.fT], [t, c.fT + cs], [t - OV, c.fT + cs]]
    const side = wall === 'left' || wall === 'right'
    const a = side ? c.w - OV : c.w - OV2
    const b = side ? c.Zf - c.wf + OV : c.W - c.w + OV2
    out.push(alongWall(c, wall, prof, a, b))
  }
  return out
}

export const GROOVE_DEPTH = 1.6

/** Pairs of ribs on the side walls that form a groove of width `sw` centred at each z. */
export function grooveRibs(c: DrawerCtx, zs: number[], sw: number): Mesh[] {
  const out: Mesh[] = []
  const rt = c.nz.wall(2)
  const n0 = c.w - OV
  for (const z of zs) {
    for (const zc of [z - sw / 2 - rt / 2, z + sw / 2 + rt / 2]) {
      const yTop = topAt(c, zc + rt / 2) - 0.8
      const prof: Vec2[] = [[n0, 0], [c.w + GROOVE_DEPTH, 0], [c.w + GROOVE_DEPTH, yTop], [n0, yTop]]
      out.push(alongWall(c, 'left', prof, zc - rt / 2, zc + rt / 2))
      out.push(alongWall(c, 'right', prof, zc - rt / 2, zc + rt / 2))
    }
  }
  return out
}
