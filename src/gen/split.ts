import type { Vec2 } from '../geom/mesh'
import { diff, intersect, polygonShape, rect, union, type Shape } from './plate2d'

const MARGIN = 4
const KNOB_SCALES = [1, 0.75, 0.55]

interface Knob {
  root: number
  head: number
  len: number
}

const knobAt = (k: number): Knob => ({ root: 3.5 * k, head: 5.5 * k, len: 7 * k })

interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

function boxOf(shape: Shape): Box {
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

/** True when a grid of sample points over the box lies inside the shape. */
function solid(box: Box, shape: Shape): boolean {
  for (let x = box.x0; x <= box.x1 + 1e-9; x += 1.5) {
    for (let y = box.y0; y <= box.y1 + 1e-9; y += 1.5) if (!solidAt(shape, x, y)) return false
  }
  return true
}

function knobs(shape: Shape, c: number, y0: number, y1: number, k: Knob): number[] {
  const valid: number[] = []
  for (let y = y0 + k.head + 1; y <= y1 - k.head - 1; y += 2) {
    if (solid({ x0: c - 2, y0: y - k.head - 1, x1: c + k.len + 2, y1: y + k.head + 1 }, shape)) valid.push(y)
  }
  const picked: number[] = []
  for (const y of valid) {
    if (picked.length === 0 || y - picked[picked.length - 1]! >= 2 * k.head + 8) picked.push(y)
  }
  return picked.slice(0, 3)
}

function dovetail(c: number, y: number, k: Knob, grow: number): Shape {
  const pts: Vec2[] = [
    [c - 1, y - k.root - grow], [c, y - k.root - grow],
    [c + k.len + grow, y - k.head - grow], [c + k.len + grow, y + k.head + grow],
    [c, y + k.root + grow], [c - 1, y + k.root + grow],
  ]
  return polygonShape(pts)
}

/** Cuts a piece in two across x at the seam with the most usable joint knobs (butt joint if none fit). */
function cutX(shape: Shape, fit: number): { pieces: [Shape, Shape]; knobsUsed: number } {
  const b = boxOf(shape)
  const mid = (b.x0 + b.x1) / 2
  const span = (b.x1 - b.x0) * 0.2
  let best: { c: number; ys: number[]; k: Knob } | undefined
  for (const scale of KNOB_SCALES) {
    const k = knobAt(scale)
    for (let off = 0; off <= span; off += 3) {
      for (const sign of off === 0 ? [1] : [1, -1]) {
        const c = mid + sign * off
        const ys = knobs(shape, c, b.y0, b.y1, k)
        if (!best || ys.length > best.ys.length) best = { c, ys, k }
        if (ys.length >= 2) break
      }
      if (best && best.ys.length >= 2) break
    }
    if (best && best.ys.length >= 2) break
  }
  const c = best && best.ys.length > 0 ? best.c : mid
  const ys = best?.ys ?? []
  const k = best?.k ?? knobAt(1)
  const left = union(intersect(shape, rect(b.x0 - 1, b.y0 - 1, c, b.y1 + 1)), ...ys.map((y) => dovetail(c, y, k, 0)))
  const right = diff(intersect(shape, rect(c, b.y0 - 1, b.x1 + 1, b.y1 + 1)), ...ys.map((y) => dovetail(c, y, k, fit)))
  return { pieces: [left, right], knobsUsed: ys.length }
}

/**
 * Splits a plate shape into pieces that each fit the bed (either orientation). Pieces join with dovetail knobs
 * cut inside the plate's own plane, so they print flat with no support. Returns the shape itself when it fits.
 */
export function splitShape(shape: Shape, bed: { x: number; y: number }, fit: number): Shape[] {
  const usableX = bed.x - MARGIN, usableY = bed.y - MARGIN
  const big = Math.max(usableX, usableY), small = Math.min(usableX, usableY)
  const fits = (s: Shape) => {
    const b = boxOf(s)
    const dims = [b.x1 - b.x0, b.y1 - b.y0].sort((a, c) => c - a)
    return dims[0]! <= big + 1e-6 && dims[1]! <= small + 1e-6
  }
  let pieces: Shape[] = [shape]
  for (let iter = 0; iter < 8; iter++) {
    let changed = false
    const next: Shape[] = []
    for (const piece of pieces) {
      if (fits(piece)) { next.push(piece); continue }
      const b = boxOf(piece)
      const alongX = b.x1 - b.x0 >= b.y1 - b.y0
      const cut = alongX ? cutX(piece, fit) : cutX(transpose(piece), fit)
      changed = true
      const [l, r] = cut.pieces
      next.push(...(alongX ? [l, r] : [transpose(l), transpose(r)]))
    }
    pieces = next
    if (!changed) break
  }
  return pieces
}
