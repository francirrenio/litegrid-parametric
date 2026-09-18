import polygonClipping, { type MultiPolygon, type Pair, type Polygon, type Ring } from 'polygon-clipping'
import { extrude, type Mat4, type Mesh, type Vec2 } from '../geom/mesh'

export type Shape = MultiPolygon

export function rect(u0: number, v0: number, u1: number, v1: number): Shape {
  const [a, b] = u0 < u1 ? [u0, u1] : [u1, u0]
  const [c, d] = v0 < v1 ? [v0, v1] : [v1, v0]
  return [[[[a, c], [b, c], [b, d], [a, d], [a, c]]]]
}

export function circle(cx: number, cy: number, r: number, seg = 18): Shape {
  const ring: Ring = []
  for (let i = 0; i < seg; i++) {
    const a = (i * 2 * Math.PI) / seg
    ring.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  ring.push(ring[0]!)
  return [[ring]]
}

export function polygonShape(pts: Vec2[]): Shape {
  const ring: Ring = pts.map(([x, y]) => [x, y] as Pair)
  ring.push(ring[0]!)
  return [[ring]]
}

/** Bar of width `w` from (x0,y0) to (x1,y1), square ends. */
export function bar(x0: number, y0: number, x1: number, y1: number, w: number): Shape {
  const dx = x1 - x0, dy = y1 - y0
  const len = Math.hypot(dx, dy) || 1
  const nx = (-dy / len) * (w / 2), ny = (dx / len) * (w / 2)
  return polygonShape([[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]])
}

export const EMPTY: Shape = []

export function union(...s: Shape[]): Shape {
  const list = s.filter((x) => x.length)
  if (list.length === 0) return EMPTY
  return polygonClipping.union(list[0]!, ...list.slice(1))
}
export function diff(a: Shape, ...b: Shape[]): Shape {
  const list = b.filter((x) => x.length)
  if (a.length === 0 || list.length === 0) return a
  return polygonClipping.difference(a, ...list)
}
export function intersect(a: Shape, b: Shape): Shape {
  if (a.length === 0 || b.length === 0) return EMPTY
  return polygonClipping.intersection(a, b)
}

const open = (ring: Ring): Vec2[] => ring.slice(0, -1).map(([x, y]) => [x, y] as Vec2)

/** Extrudes every polygon of the shape from z = 0 to `thickness`. */
export function shapeMesh(shape: Shape, thickness: number): Mesh {
  const out: number[] = []
  for (const poly of shape as Polygon[]) {
    const [outer, ...holes] = poly
    if (!outer || outer.length < 4) continue
    const m = extrude(open(outer), holes.map(open), 0, thickness)
    for (let i = 0; i < m.length; i++) out.push(m[i]!)
  }
  return out
}

export function shapeArea(shape: Shape): number {
  let a = 0
  for (const poly of shape as Polygon[]) {
    poly.forEach((ring, i) => {
      let s = 0
      for (let k = 0; k < ring.length - 1; k++) s += ring[k]![0] * ring[k + 1]![1] - ring[k + 1]![0] * ring[k]![1]
      a += (i === 0 ? 1 : -1) * Math.abs(s / 2)
    })
  }
  return a
}

/**
 * A plate plane of the assembled cabinet. Assembled 2D coordinates (a, b) map to plate-local (x, y);
 * `matrix` sends plate-local (x, y, z ∈ [0, thickness]) back to assembled space (a proper rotation).
 */
export interface Plane {
  kind: 'frame' | 'shelf' | 'back'
  toLocal: (a: number, b: number) => Vec2
  matrix: Mat4
}

/** YZ plate at x = x0: assembled (a, b) = (z, y). Local x = D - z, local z = x - x0. */
export function framePlane(x0: number, D: number): Plane {
  return {
    kind: 'frame',
    toLocal: (z, y) => [D - z, y],
    matrix: [0, 0, 1, x0, 0, 1, 0, 0, -1, 0, 0, D, 0, 0, 0, 1],
  }
}
/** XZ plate at y = y0: assembled (a, b) = (x, z). Local y = D - z, local z = y - y0. */
export function shelfPlane(y0: number, D: number): Plane {
  return {
    kind: 'shelf',
    toLocal: (x, z) => [x, D - z],
    matrix: [1, 0, 0, 0, 0, 0, 1, y0, 0, -1, 0, D, 0, 0, 0, 1],
  }
}
/** XY plate at z = 0: assembled (a, b) = (x, y). */
export function backPlane(): Plane {
  return {
    kind: 'back',
    toLocal: (x, y) => [x, y],
    matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  }
}

export function planeRect(pl: Plane, a0: number, a1: number, b0: number, b1: number): Shape {
  const p = pl.toLocal(a0, b0)
  const q = pl.toLocal(a1, b1)
  return rect(p[0], p[1], q[0], q[1])
}
export function planeCircle(pl: Plane, a: number, b: number, r: number): Shape {
  const c = pl.toLocal(a, b)
  return circle(c[0], c[1], r)
}
export function planeBar(pl: Plane, a0: number, b0: number, a1: number, b1: number, w: number): Shape {
  const p = pl.toLocal(a0, b0)
  const q = pl.toLocal(a1, b1)
  return bar(p[0], p[1], q[0], q[1], w)
}
