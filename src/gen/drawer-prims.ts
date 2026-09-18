import { extrude, transform, type Mat4, type Mesh, type Vec2 } from '../geom/mesh'

export type Axis = 'x' | 'y' | 'z'

// (u,v,w) -> (w,v,u): profile (z,y) extruded along x.
const SWAP_XZ: Mat4 = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1]
// (u,v,w) -> (u,w,v): profile (x,z) extruded along y.
const SWAP_YZ: Mat4 = [1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1]

/**
 * Prism along an axis. Profile coordinates: axis z -> (x,y); axis x -> (z,y); axis y -> (x,z).
 * `transform` flips winding for the swapped axes, so the result stays outward-facing.
 */
export function prismAxis(axis: Axis, outline: Vec2[], holes: Vec2[][], a0: number, a1: number): Mesh {
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1)
  const m = extrude(outline, holes, lo, hi)
  if (axis === 'z') return m
  return transform(m, axis === 'x' ? SWAP_XZ : SWAP_YZ)
}

export function hashString(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
  return h.toString(36)
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Parallelogram with horizontal top/bottom edges, rising from (v0,y0) to (v1,y1); `sw` is its horizontal width. */
export function slantedStrut(v0: number, y0: number, v1: number, y1: number, sw: number): Vec2[] {
  return [[v0, y0], [v0 + sw, y0], [v1 + sw, y1], [v1, y1]]
}

export function deepMerge<T>(base: T, over: unknown): T {
  if (over === null || typeof over !== 'object' || Array.isArray(over)) return base
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    if (v === undefined) continue
    const b = out[k]
    out[k] = b !== null && typeof b === 'object' && !Array.isArray(b) && v !== null && typeof v === 'object'
      ? deepMerge(b, v)
      : v
  }
  return out as T
}
