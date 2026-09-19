import type { Vec2 } from '../geom/mesh'
import { diff, intersect, polygonShape, rect, union, type Shape } from './plate2d'

const MARGIN = 4
const KNOB_SCALES = [1, 0.8, 0.6]

interface Knob {
  root: number
  head: number
  len: number
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Width of the solid post or beam at a seam: proportional to the bar width, between 20 and 30 mm. */
export const seamPostWidth = (bw: number): number => clamp(2.6 * bw, 20, 30)

/** Dovetail knob sized from the post: head about a quarter of its width (4 to 7.5 mm), so joints stay modest. */
export function knobFor(postW: number, scale = 1): Knob {
  const head = clamp(0.24 * postW, 4, 7.5) * scale
  return { root: head * 0.64, head, len: head * 1.25 }
}

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Seam positions (plate-local coordinates) where a plate is cut to fit the bed. */
export interface Seams {
  xs: number[]
  ys: number[]
}

export const NO_SEAMS: Seams = { xs: [], ys: [] }

export function boxOf(shape: Shape): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const poly of shape) for (const ring of poly) for (const [x, y] of ring) {
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  return { x0, y0, x1, y1 }
}

function transpose(shape: Shape): Shape {
  return shape.map((poly) => poly.map((ring) => ring.map(([x, y]) => [y, x] as [number, number])))
}

/**
 * Decides where a plate of this outline must be cut so every piece (with its dovetail knobs) fits the bed in
 * either orientation. Cuts are evenly spaced; the plate builder keeps a wide solid post or beam at each one.
 */
export function planSeams(box: Box, bed: { x: number; y: number }, knobLen: number): Seams {
  const big = Math.max(bed.x, bed.y) - MARGIN
  const small = Math.min(bed.x, bed.y) - MARGIN
  const w = box.x1 - box.x0
  const h = box.y1 - box.y0
  const extra = knobLen + 1
  let nx = 1, ny = 1
  for (let guard = 0; guard < 24; guard++) {
    const pw = w / nx + (nx > 1 ? extra : 0)
    const ph = h / ny + (ny > 1 ? extra : 0)
    const [a, b] = pw >= ph ? [pw, ph] : [ph, pw]
    if (a <= big + 1e-6 && b <= small + 1e-6) break
    if (pw >= ph) nx++
    else ny++
  }
  const xs: number[] = []
  const ys: number[] = []
  for (let i = 1; i < nx; i++) xs.push(box.x0 + (w * i) / nx)
  for (let i = 1; i < ny; i++) ys.push(box.y0 + (h * i) / ny)
  return { xs, ys }
}

/** Solid strips (posts and beams) centred on each seam, to be kept free of windows. */
export function seamZones(seams: Seams, box: Box, width: number): Shape[] {
  return [
    ...seams.xs.map((c) => rect(c - width / 2, box.y0 - 1, c + width / 2, box.y1 + 1)),
    ...seams.ys.map((c) => rect(box.x0 - 1, c - width / 2, box.x1 + 1, c + width / 2)),
  ]
}

type Ring = Array<[number, number]>

function pip(ring: Ring, x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!, [xj, yj] = ring[j]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function solidAt(shape: Shape, x: number, y: number): boolean {
  return shape.some((poly) => pip(poly[0]!, x, y) && !poly.slice(1).some((h) => pip(h, x, y)))
}

function solid(box: Box, shape: Shape): boolean {
  for (let x = box.x0; x <= box.x1 + 1e-9; x += 1.5) {
    for (let y = box.y0; y <= box.y1 + 1e-9; y += 1.5) if (!solidAt(shape, x, y)) return false
  }
  return true
}

/**
 * Knob centres along a seam, evenly spaced from near one end to near the other (corners included): two on a short
 * seam, more on a long one (about one per 80 mm). Each ideal spot moves to the nearest solid position; spots with no
 * solid position close enough are dropped.
 */
export function seamKnobs(shape: Shape, c: number, y0: number, y1: number, k: Knob): number[] {
  const valid: number[] = []
  for (let y = y0 + k.head + 1; y <= y1 - k.head - 1; y += 2) {
    if (solid({ x0: c - 2, y0: y - k.head - 1, x1: c + k.len + 2, y1: y + k.head + 1 }, shape)) valid.push(y)
  }
  if (valid.length === 0) return []
  const length = y1 - y0
  const n = Math.min(4, Math.max(2, Math.ceil(length / 80)))
  const margin = k.head + 5
  const first = y0 + margin
  const last = y1 - margin
  if (last <= first) return [valid[Math.floor(valid.length / 2)]!]
  const pitch = (last - first) / (n - 1)
  const gap = 2 * k.head + 4
  const nearest = (target: number) => valid.reduce((best, y) => (Math.abs(y - target) < Math.abs(best - target) ? y : best), valid[0]!)
  for (const tol of [0.25, 0.45, 0.7]) {
    const picked: number[] = []
    for (let i = 0; i < n; i++) {
      const target = first + pitch * i
      const y = nearest(target)
      if (Math.abs(y - target) <= tol * pitch && picked.every((q) => Math.abs(q - y) >= gap)) picked.push(y)
    }
    if (picked.length >= Math.min(n, 2)) return picked.sort((p, q) => p - q)
  }
  return [nearest((first + last) / 2)]
}

function dovetail(c: number, y: number, k: Knob, grow: number): Shape {
  const pts: Vec2[] = [
    [c - 1, y - k.root - grow], [c, y - k.root - grow],
    [c + k.len + grow, y - k.head - grow], [c + k.len + grow, y + k.head + grow],
    [c, y + k.root + grow], [c - 1, y + k.root + grow],
  ]
  return polygonShape(pts)
}

/** Cuts at x = c with dovetail knobs in the plate's own plane (butt joint when no knob fits). */
function cutAt(shape: Shape, c: number, fit: number, postW: number): Shape[] {
  const b = boxOf(shape)
  let ys: number[] = []
  let k = knobFor(postW)
  for (const scale of KNOB_SCALES) {
    k = knobFor(postW, scale)
    ys = seamKnobs(shape, c, b.y0, b.y1, k)
    if (ys.length >= 2) break
  }
  const left = union(intersect(shape, rect(b.x0 - 1, b.y0 - 1, c, b.y1 + 1)), ...ys.map((y) => dovetail(c, y, k, 0)))
  const right = diff(intersect(shape, rect(c, b.y0 - 1, b.x1 + 1, b.y1 + 1)), ...ys.map((y) => dovetail(c, y, k, fit)))
  return [left, right]
}

/** Splits a plate at the planned seams. Returns the shape itself when there are none. */
export function splitAt(shape: Shape, seams: Seams, fit: number, postW: number): Shape[] {
  const crosses = (s: Shape, c: number) => {
    const b = boxOf(s)
    return b.x0 < c - 1e-6 && b.x1 > c + 1e-6
  }
  let pieces: Shape[] = [shape]
  for (const c of seams.xs) pieces = pieces.flatMap((pc) => (crosses(pc, c) ? cutAt(pc, c, fit, postW) : [pc]))
  if (seams.ys.length > 0) {
    let t = pieces.map(transpose)
    for (const c of seams.ys) t = t.flatMap((pc) => (crosses(pc, c) ? cutAt(pc, c, fit, postW) : [pc]))
    pieces = t.map(transpose)
  }
  return pieces
}
