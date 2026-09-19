import type { PlateItem } from '../export'
import type { Mesh } from '../geom/mesh'

/** Pure logic of the print-bed view: footprints, collisions, snapping. No DOM. */

export type Pt = [number, number]
/** A footprint: closed loops (outer contours and holes), to be drawn with the even-odd rule. */
export type Outline = Pt[][]

export const SNAP = 2
export const GAP = 2

const outlineCache = new WeakMap<Mesh, Outline>()

function loopArea(l: Pt[]): number {
  let a = 0
  for (let i = 0; i < l.length; i++) {
    const p = l[i]!, q = l[(i + 1) % l.length]!
    a += p[0] * q[1] - q[0] * p[1]
  }
  return a / 2
}

function simplify(l: Pt[]): Pt[] {
  let pts = l
  let changed = true
  while (changed && pts.length > 3) {
    changed = false
    const out: Pt[] = []
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length]!, b = pts[i]!, c = pts[(i + 1) % pts.length]!
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1
      if (Math.abs(cross) / len < 1e-4) changed = true
      else out.push(b)
    }
    if (out.length < 3) break
    pts = out
  }
  return pts
}

/**
 * Footprint of a mesh lying on the bed: the boundary of the triangles that touch z = 0 (edges shared by two
 * such triangles cancel out, what is left are the outer contour and the holes). Falls back to the bounding
 * rectangle when the bottom is not a usable flat face. Cached per mesh.
 */
export function footprint(mesh: Mesh, tol = 0.05): Outline {
  const hit = outlineCache.get(mesh)
  if (hit) return hit
  const res = computeFootprint(mesh, tol)
  outlineCache.set(mesh, res)
  return res
}

export function computeFootprint(mesh: Mesh, tol = 0.05): Outline {
  const q = (v: number) => Math.round(v * 1000)
  const key = (x: number, y: number) => `${q(x)},${q(y)}`
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (let i = 0; i < mesh.length; i += 3) {
    x0 = Math.min(x0, mesh[i]!); x1 = Math.max(x1, mesh[i]!)
    y0 = Math.min(y0, mesh[i + 1]!); y1 = Math.max(y1, mesh[i + 1]!)
  }
  if (!isFinite(x0)) return []
  const rect: Outline = [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]]

  const edges = new Map<string, [Pt, Pt, string]>()
  for (let i = 0; i + 8 < mesh.length; i += 9) {
    if (mesh[i + 2]! > tol || mesh[i + 5]! > tol || mesh[i + 8]! > tol) continue
    const p: Pt[] = [
      [mesh[i]!, mesh[i + 1]!],
      [mesh[i + 3]!, mesh[i + 4]!],
      [mesh[i + 6]!, mesh[i + 7]!],
    ]
    if (Math.abs(loopArea(p)) < 1e-9) continue
    for (let k = 0; k < 3; k++) {
      const a = p[k]!, b = p[(k + 1) % 3]!
      const ka = key(a[0], a[1]), kb = key(b[0], b[1])
      if (ka === kb) continue
      const rev = `${kb}>${ka}`
      if (edges.has(rev)) edges.delete(rev)
      else edges.set(`${ka}>${kb}`, [a, b, ka])
    }
  }
  const from = new Map<string, string[]>()
  for (const [k, e] of edges) {
    const l = from.get(e[2])
    if (l) l.push(k)
    else from.set(e[2], [k])
  }
  const loops: Outline = []
  const used = new Set<string>()
  for (const [k0, e0] of edges) {
    if (used.has(k0)) continue
    const pts: Pt[] = []
    let k: string | undefined = k0
    let e = e0
    let guard = 0
    while (k && !used.has(k) && guard++ < 100000) {
      used.add(k)
      pts.push(e[0])
      const kb = key(e[1][0], e[1][1])
      k = from.get(kb)?.find((n) => !used.has(n))
      if (k) e = edges.get(k)!
    }
    const s = simplify(pts)
    if (s.length >= 3 && Math.abs(loopArea(s)) > 0.01) loops.push(s)
  }
  if (loops.length === 0) return rect
  const outer = loops.reduce((m, l) => Math.max(m, Math.abs(loopArea(l))), 0)
  if (outer < 0.3 * (x1 - x0) * (y1 - y0)) return rect
  return loops
}

/** Footprint placed on the bed: turned 90° about Z when the item is rotated, then moved to (it.x, it.y). */
export function placedOutline(o: Outline, it: Pick<PlateItem, 'x' | 'y' | 'rotated'>, dx = 0, dy = 0): Outline {
  const ox = it.x + dx, oy = it.y + dy
  return o.map((l) => l.map(([x, y]): Pt => (it.rotated ? [ox - y, oy + x] : [ox + x, oy + y])))
}

/** SVG path data for an outline on a bed of the given size (bed centre = origin, y up on the bed, down in SVG). */
export function outlinePath(o: Outline, bed: { x: number; y: number }): string {
  const r = (n: number) => Math.round(n * 100) / 100
  return o
    .map((l) => `M${l.map(([x, y]) => `${r(bed.x / 2 + x)} ${r(bed.y / 2 - y)}`).join('L')}Z`)
    .join('')
}

/* ── overlap ─────────────────────────────────────────────────────── */

function bounds(o: Outline): [number, number, number, number] {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity
  for (const l of o) for (const [x, y] of l) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y) }
  return [a, b, c, d]
}

function inside(p: Pt, o: Outline): boolean {
  let c = false
  for (const l of o) {
    for (let i = 0, j = l.length - 1; i < l.length; j = i++) {
      const a = l[i]!, b = l[j]!
      if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c
    }
  }
  return c
}

function cross(a: Pt, b: Pt, c: Pt): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
}

function segCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const e = 1e-7
  const d1 = cross(a, b, c), d2 = cross(a, b, d), d3 = cross(c, d, a), d4 = cross(c, d, b)
  return ((d1 > e && d2 < -e) || (d1 < -e && d2 > e)) && ((d3 > e && d4 < -e) || (d3 < -e && d4 > e))
}

function centroid(l: Pt[]): Pt {
  let cx = 0, cy = 0, a = 0
  for (let i = 0; i < l.length; i++) {
    const p = l[i]!, q = l[(i + 1) % l.length]!
    const w = p[0] * q[1] - q[0] * p[1]
    cx += (p[0] + q[0]) * w; cy += (p[1] + q[1]) * w; a += w
  }
  return a === 0 ? l[0]! : [cx / (3 * a), cy / (3 * a)]
}

/** True when two placed footprints overlap (touching edges do not count). */
export function outlinesOverlap(a: Outline, b: Outline): boolean {
  const ba = bounds(a), bb = bounds(b)
  const e = 1e-6
  if (ba[2] <= bb[0] + e || bb[2] <= ba[0] + e || ba[3] <= bb[1] + e || bb[3] <= ba[1] + e) return false
  for (const la of a) for (const lb of b) {
    for (let i = 0; i < la.length; i++) {
      const p = la[i]!, q = la[(i + 1) % la.length]!
      for (let j = 0; j < lb.length; j++) if (segCross(p, q, lb[j]!, lb[(j + 1) % lb.length]!)) return true
    }
  }
  // No edges cross: one may lie fully inside the other (or they coincide).
  for (const l of a) if (inside(centroid(l), b) || inside(l[0]!, b)) return true
  for (const l of b) if (inside(centroid(l), a) || inside(l[0]!, a)) return true
  return false
}

export interface ItemIssue {
  /** Sticks out of the bed. */
  outside: boolean
  /** Indexes (in the plate's item list) of the parts it overlaps. */
  overlaps: number[]
}

/** Which items stick out of the bed or overlap another one. */
export function plateIssues(
  items: PlateItem[],
  bed: { x: number; y: number },
  outlineOf: (it: PlateItem) => Outline,
  moved?: { index: number; dx: number; dy: number },
): ItemIssue[] {
  const placed = items.map((it, i) => placedOutline(outlineOf(it), it, moved?.index === i ? moved.dx : 0, moved?.index === i ? moved.dy : 0))
  const eps = 1e-3
  const issues: ItemIssue[] = items.map((it, i) => {
    const x = it.x + (moved?.index === i ? moved.dx : 0), y = it.y + (moved?.index === i ? moved.dy : 0)
    return {
      outside: Math.abs(x) + it.width / 2 > bed.x / 2 + eps || Math.abs(y) + it.depth / 2 > bed.y / 2 + eps,
      overlaps: [],
    }
  })
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++)
      if (outlinesOverlap(placed[i]!, placed[j]!)) {
        issues[i]!.overlaps.push(j)
        issues[j]!.overlaps.push(i)
      }
  return issues
}

/* ── snapping and free spots ─────────────────────────────────────── */

function nearest(pos: number, targets: number[], tol: number): number {
  let best = pos, bd = tol + 1e-9
  for (const t of targets) {
    const d = Math.abs(t - pos)
    if (d < bd) { bd = d; best = t }
  }
  return best
}

/** Snaps a proposed centre to the bed edges and to neighbouring parts (keeping GAP mm from them). */
export function snapCentre(
  it: Pick<PlateItem, 'width' | 'depth'>,
  x: number,
  y: number,
  others: Array<Pick<PlateItem, 'x' | 'y' | 'width' | 'depth'>>,
  bed: { x: number; y: number },
  tol = SNAP,
  gap = GAP,
): Pt {
  const hw = it.width / 2, hd = it.depth / 2
  const tx = [-bed.x / 2 + hw, bed.x / 2 - hw]
  const ty = [-bed.y / 2 + hd, bed.y / 2 - hd]
  for (const o of others) {
    const ow = o.width / 2, od = o.depth / 2
    if (Math.abs(y - o.y) < hd + od + tol + gap) {
      tx.push(o.x + ow + gap + hw, o.x - ow - gap - hw, o.x - ow + hw, o.x + ow - hw)
    }
    if (Math.abs(x - o.x) < hw + ow + tol + gap) {
      ty.push(o.y + od + gap + hd, o.y - od - gap - hd, o.y - od + hd, o.y + od - hd)
    }
  }
  return [nearest(x, tx, tol), nearest(y, ty, tol)]
}

/** First free spot (bounding boxes, GAP apart) scanning the bed from its top-left corner; null when it is full. */
export function findFreeSpot(
  it: Pick<PlateItem, 'width' | 'depth'>,
  others: Array<Pick<PlateItem, 'x' | 'y' | 'width' | 'depth'>>,
  bed: { x: number; y: number },
  step = 5,
): Pt | null {
  const hw = it.width / 2, hd = it.depth / 2
  if (it.width > bed.x || it.depth > bed.y) return null
  for (let y = bed.y / 2 - hd; y >= -bed.y / 2 + hd - 1e-6; y -= step) {
    for (let x = -bed.x / 2 + hw; x <= bed.x / 2 - hw + 1e-6; x += step) {
      const free = others.every((o) => Math.abs(x - o.x) >= hw + o.width / 2 + GAP || Math.abs(y - o.y) >= hd + o.depth / 2 + GAP)
      if (free) return [x, y]
    }
  }
  return null
}
