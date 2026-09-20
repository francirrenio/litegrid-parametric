import cdt2d from 'cdt2d'
import type { Mesh, Vec3 } from '../geom/mesh'

/** Axis index: 0 = x, 1 = y, 2 = z. */
export type AxisIdx = 0 | 1 | 2

const QUANT = 1e6
const keyOf = (p: Vec3): string => `${Math.round(p[0] * QUANT)},${Math.round(p[1] * QUANT)},${Math.round(p[2] * QUANT)}`

/**
 * Keeps the part of a closed mesh on one side of an axis-aligned plane (`p[axis] >= v` when `keepHigh`, else `<=`)
 * and closes the cut with a cap, so a watertight input gives a watertight output. The plane should not pass through
 * any vertex (callers nudge it); returns an empty mesh when nothing is left. Throws if the cut outline does not close.
 */
export function clipMesh(mesh: Mesh, a: AxisIdx, v: number, keepHigh: boolean): Mesh {
  return snap(clipMesh0(mesh, a, v, keepHigh))
}

const GRID = 1e3

/**
 * Snaps every vertex to a 0.001 mm grid and drops triangles that collapse to a point pair. A cut close to a sharp
 * vertex creates cap points a few 1e-5 apart; snapping merges them so the mesh stays closed at any tolerance the
 * checkers use (dropping such a triangle leaves its two neighbours paired with each other).
 */
function snap(m: Mesh): Mesh {
  const out: number[] = []
  for (let i = 0; i < m.length; i += 9) {
    const t = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => Math.round(m[i + k]! * GRID) / GRID)
    const same = (p: number, q: number) => t[p] === t[q] && t[p + 1] === t[q + 1] && t[p + 2] === t[q + 2]
    if (same(0, 3) || same(3, 6) || same(0, 6)) continue
    out.push(...t)
  }
  return out
}

function clipMesh0(mesh: Mesh, a: AxisIdx, v: number, keepHigh: boolean): Mesh {
  const s = keepHigh ? 1 : -1
  const out: number[] = []
  const segs: Array<[Vec3, Vec3]> = []
  const lerpAt = (p0: Vec3, p1: Vec3): Vec3 => {
    // Canonical endpoint order so neighbouring triangles compute bit-identical cut points.
    let lo = p0, hi = p1
    for (let k = 0; k < 3; k++) {
      if (p0[k]! === p1[k]!) continue
      if (p0[k]! > p1[k]!) { lo = p1; hi = p0 }
      break
    }
    const t = (v - lo[a]) / (hi[a] - lo[a])
    const r: Vec3 = [lo[0] + t * (hi[0] - lo[0]), lo[1] + t * (hi[1] - lo[1]), lo[2] + t * (hi[2] - lo[2])]
    r[a] = v
    return r
  }
  for (let i = 0; i < mesh.length; i += 9) {
    const P: Vec3[] = [
      [mesh[i]!, mesh[i + 1]!, mesh[i + 2]!],
      [mesh[i + 3]!, mesh[i + 4]!, mesh[i + 5]!],
      [mesh[i + 6]!, mesh[i + 7]!, mesh[i + 8]!],
    ]
    const d = P.map((p) => s * (p[a] - v))
    const nIn = d.filter((x) => x >= 0).length
    if (nIn === 3) {
      out.push(...P[0]!, ...P[1]!, ...P[2]!)
      continue
    }
    if (nIn === 0) continue
    const poly: Vec3[] = []
    let iIn: Vec3 | null = null, iOut: Vec3 | null = null
    for (let k = 0; k < 3; k++) {
      const cur = P[k]!, nxt = P[(k + 1) % 3]!
      const dc = d[k]!, dn = d[(k + 1) % 3]!
      if (dc >= 0) poly.push(cur)
      if (dc >= 0 !== dn >= 0) {
        const q = lerpAt(cur, nxt)
        poly.push(q)
        if (dc >= 0) iOut = q
        else iIn = q
      }
    }
    for (let k = 1; k + 1 < poly.length; k++) out.push(...poly[0]!, ...poly[k]!, ...poly[k + 1]!)
    if (iIn && iOut) segs.push([iIn, iOut])
  }
  if (segs.length === 0) return out
  capLoops(segs, a, s, out)
  return out
}

function capLoops(segs: Array<[Vec3, Vec3]>, a: AxisIdx, s: number, out: number[]) {
  const from = new Map<string, Array<{ to: Vec3; used: boolean }>>()
  const fromPt = new Map<string, Vec3>()
  for (const [p, q] of segs) {
    const kp = keyOf(p), kq = keyOf(q)
    if (kp === kq) continue
    const arr = from.get(kp) ?? []
    arr.push({ to: q, used: false })
    from.set(kp, arr)
    fromPt.set(kp, p)
  }
  const pts: Vec3[] = []
  const index = new Map<string, number>()
  const idx = (p: Vec3): number => {
    const k = keyOf(p)
    let i = index.get(k)
    if (i === undefined) { i = pts.length; pts.push(p); index.set(k, i) }
    return i
  }
  const edges: Array<[number, number]> = []
  for (const [k0, list] of from) {
    for (const first of list) {
      if (first.used) continue
      // Follow the chain until it returns to its start.
      let curKey = k0
      let cur = first
      const startKey = k0
      for (let guard = 0; guard < 1e6; guard++) {
        cur.used = true
        const p = fromPt.get(curKey)!
        const nextKey = keyOf(cur.to)
        edges.push([idx(p), idx(cur.to)])
        if (nextKey === startKey) break
        const nxt = from.get(nextKey)?.find((e) => !e.used)
        if (!nxt) throw new Error('mesh-clip: open cut outline')
        fromPt.set(nextKey, cur.to)
        curKey = nextKey
        cur = nxt
      }
    }
  }
  // Cap normal points to the discarded side: -s * e_a. Right-handed 2D frame (u, w) about that normal.
  const u = ((a + 1) % 3) as AxisIdx, w = ((a + 2) % 3) as AxisIdx
  const [ku, kw] = s < 0 ? [u, w] : [w, u]
  const p2 = pts.map((p) => [p[ku], p[kw]] as [number, number])
  const tris = cdt2d(p2, edges, { exterior: false })
  for (const [i0, i1, i2] of tris) {
    const A = p2[i0]!, B = p2[i1]!, C = p2[i2]!
    const area = (B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1])
    if (area === 0) continue
    if (area > 0) out.push(...pts[i0]!, ...pts[i1]!, ...pts[i2]!)
    else out.push(...pts[i0]!, ...pts[i2]!, ...pts[i1]!)
  }
}
