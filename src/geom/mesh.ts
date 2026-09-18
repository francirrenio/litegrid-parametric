import cdt2d from 'cdt2d'

export type Vec2 = [number, number]
export type Vec3 = [number, number, number]
/** Flat triangle soup: 9 numbers (x,y,z for 3 vertices) per triangle, counter-clockwise seen from outside. */
export type Mesh = number[]
/** Row-major 4x4 affine matrix. */
export type Mat4 = number[]

/* ── matrices ─────────────────────────────────────────────────────── */

export const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

export function mat4Translate(x: number, y: number, z: number): Mat4 {
  return [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1]
}
export function mat4RotX(a: number): Mat4 {
  const c = Math.cos(a), s = Math.sin(a)
  return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1]
}
export function mat4RotY(a: number): Mat4 {
  const c = Math.cos(a), s = Math.sin(a)
  return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1]
}
export function mat4RotZ(a: number): Mat4 {
  const c = Math.cos(a), s = Math.sin(a)
  return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
}
/** Result = a · b (apply b first, then a). */
export function mat4Mul(a: Mat4, b: Mat4): Mat4 {
  const r = new Array<number>(16).fill(0)
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      let s = 0
      for (let k = 0; k < 4; k++) s += a[i * 4 + k]! * b[k * 4 + j]!
      r[i * 4 + j] = s
    }
  return r
}
export function mat4Compose(...ms: Mat4[]): Mat4 {
  return ms.reduce((acc, m) => mat4Mul(acc, m), IDENTITY)
}
/** Inverse of a rigid (rotation + translation) matrix. */
export function mat4InvertRigid(m: Mat4): Mat4 {
  const r = [m[0]!, m[4]!, m[8]!, m[1]!, m[5]!, m[9]!, m[2]!, m[6]!, m[10]!]
  const t = [m[3]!, m[7]!, m[11]!]
  const nt = [
    -(r[0]! * t[0]! + r[1]! * t[1]! + r[2]! * t[2]!),
    -(r[3]! * t[0]! + r[4]! * t[1]! + r[5]! * t[2]!),
    -(r[6]! * t[0]! + r[7]! * t[1]! + r[8]! * t[2]!),
  ]
  return [r[0]!, r[1]!, r[2]!, nt[0]!, r[3]!, r[4]!, r[5]!, nt[1]!, r[6]!, r[7]!, r[8]!, nt[2]!, 0, 0, 0, 1]
}
export function mat4Apply(m: Mat4, p: Vec3): Vec3 {
  return [
    m[0]! * p[0] + m[1]! * p[1] + m[2]! * p[2] + m[3]!,
    m[4]! * p[0] + m[5]! * p[1] + m[6]! * p[2] + m[7]!,
    m[8]! * p[0] + m[9]! * p[1] + m[10]! * p[2] + m[11]!,
  ]
}
function mat4Det3(m: Mat4): number {
  return (
    m[0]! * (m[5]! * m[10]! - m[6]! * m[9]!) -
    m[1]! * (m[4]! * m[10]! - m[6]! * m[8]!) +
    m[2]! * (m[4]! * m[9]! - m[5]! * m[8]!)
  )
}

/** Applies the matrix; flips triangle winding when the transform mirrors. */
export function transform(mesh: Mesh, m: Mat4): Mesh {
  const flip = mat4Det3(m) < 0
  const out = new Array<number>(mesh.length)
  for (let i = 0; i < mesh.length; i += 9) {
    const a = mat4Apply(m, [mesh[i]!, mesh[i + 1]!, mesh[i + 2]!])
    const b = mat4Apply(m, [mesh[i + 3]!, mesh[i + 4]!, mesh[i + 5]!])
    const c = mat4Apply(m, [mesh[i + 6]!, mesh[i + 7]!, mesh[i + 8]!])
    const [p, q] = flip ? [c, b] : [b, c]
    out[i] = a[0]; out[i + 1] = a[1]; out[i + 2] = a[2]
    out[i + 3] = p[0]; out[i + 4] = p[1]; out[i + 5] = p[2]
    out[i + 6] = q[0]; out[i + 7] = q[1]; out[i + 8] = q[2]
  }
  return out
}
export const translate = (m: Mesh, x: number, y: number, z: number) => transform(m, mat4Translate(x, y, z))
export const rotateX = (m: Mesh, a: number) => transform(m, mat4RotX(a))
export const rotateY = (m: Mesh, a: number) => transform(m, mat4RotY(a))
export const rotateZ = (m: Mesh, a: number) => transform(m, mat4RotZ(a))
export const mirrorX = (m: Mesh) => transform(m, [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])

export function merge(...meshes: Mesh[]): Mesh {
  const out: number[] = []
  for (const m of meshes) for (let i = 0; i < m.length; i++) out.push(m[i]!)
  return out
}

export interface BBox {
  lo: Vec3
  hi: Vec3
  size: Vec3
}
export function bbox(mesh: Mesh): BBox {
  const lo: Vec3 = [Infinity, Infinity, Infinity]
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < mesh.length; i += 3)
    for (let k = 0; k < 3; k++) {
      const c = mesh[i + k]!
      if (c < lo[k]!) lo[k] = c
      if (c > hi[k]!) hi[k] = c
    }
  if (mesh.length === 0) return { lo: [0, 0, 0], hi: [0, 0, 0], size: [0, 0, 0] }
  return { lo, hi, size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]] }
}

/** Signed volume in mm³ (positive for outward-facing, closed meshes). */
export function signedVolume(mesh: Mesh): number {
  let v = 0
  for (let i = 0; i < mesh.length; i += 9) {
    const ax = mesh[i]!, ay = mesh[i + 1]!, az = mesh[i + 2]!
    const bx = mesh[i + 3]!, by = mesh[i + 4]!, bz = mesh[i + 5]!
    const cx = mesh[i + 6]!, cy = mesh[i + 7]!, cz = mesh[i + 8]!
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
  }
  return v
}

/** True when every edge is used exactly once in each direction (closed, consistently oriented). */
export function isWatertight(mesh: Mesh, eps = 1e-4): boolean {
  const key = (x: number, y: number, z: number) =>
    `${Math.round(x / eps)},${Math.round(y / eps)},${Math.round(z / eps)}`
  const edges = new Map<string, number>()
  const add = (a: string, b: string) => {
    if (a === b) return
    edges.set(`${a}>${b}`, (edges.get(`${a}>${b}`) ?? 0) + 1)
  }
  for (let i = 0; i < mesh.length; i += 9) {
    const a = key(mesh[i]!, mesh[i + 1]!, mesh[i + 2]!)
    const b = key(mesh[i + 3]!, mesh[i + 4]!, mesh[i + 5]!)
    const c = key(mesh[i + 6]!, mesh[i + 7]!, mesh[i + 8]!)
    add(a, b); add(b, c); add(c, a)
  }
  for (const [e, n] of edges) {
    const [a, b] = e.split('>') as [string, string]
    if (n !== 1 || edges.get(`${b}>${a}`) !== 1) return false
  }
  return true
}

/* ── 2D helpers ───────────────────────────────────────────────────── */

export function polyArea(pts: Vec2[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!, q = pts[(i + 1) % pts.length]!
    a += p[0] * q[1] - q[0] * p[1]
  }
  return a / 2
}
export const ensureCCW = (pts: Vec2[]): Vec2[] => (polyArea(pts) < 0 ? pts.slice().reverse() : pts)
export const ensureCW = (pts: Vec2[]): Vec2[] => (polyArea(pts) > 0 ? pts.slice().reverse() : pts)

export function rectPoly(x0: number, y0: number, x1: number, y1: number): Vec2[] {
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
}
export function regularPolygon(cx: number, cy: number, r: number, n: number, rot = 0): Vec2[] {
  const pts: Vec2[] = []
  for (let i = 0; i < n; i++) {
    const a = rot + (i * 2 * Math.PI) / n
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return pts
}
/** Stadium/slot shape: `w` wide, `h` tall, ends rounded with radius min(w,h)/2. */
export function slotPoly(cx: number, cy: number, w: number, h: number, segments = 8): Vec2[] {
  const r = Math.min(w, h) / 2
  const pts: Vec2[] = []
  if (h >= w) {
    const dy = h / 2 - r
    for (let i = 0; i <= segments; i++) {
      const a = (i * Math.PI) / segments
      pts.push([cx + r * Math.cos(a), cy + dy + r * Math.sin(a)])
    }
    for (let i = 0; i <= segments; i++) {
      const a = Math.PI + (i * Math.PI) / segments
      pts.push([cx + r * Math.cos(a), cy - dy + r * Math.sin(a)])
    }
  } else {
    const dx = w / 2 - r
    for (let i = 0; i <= segments; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / segments
      pts.push([cx + dx + r * Math.cos(a), cy + r * Math.sin(a)])
    }
    for (let i = 0; i <= segments; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / segments
      pts.push([cx - dx + r * Math.cos(a), cy + r * Math.sin(a)])
    }
  }
  return pts
}
export function scalePoly(pts: Vec2[], sx: number, sy: number, cx: number, cy: number): Vec2[] {
  return pts.map(([x, y]) => [cx + (x - cx) * sx, cy + (y - cy) * sy] as Vec2)
}
export function translatePoly(pts: Vec2[], dx: number, dy: number): Vec2[] {
  return pts.map(([x, y]) => [x + dx, y + dy] as Vec2)
}

/* ── primitives ───────────────────────────────────────────────────── */

const QUADS: Array<[number, number, number, number]> = [
  [4, 5, 6, 7], [1, 0, 3, 2], [5, 1, 2, 6], [0, 4, 7, 3], [7, 6, 2, 3], [0, 1, 5, 4],
]

/** Axis-aligned box from min corner to max corner. */
export function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Mesh {
  const c: Vec3[] = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ]
  const out: number[] = []
  for (const [a, b, d, e] of QUADS) {
    const A = c[a]!, B = c[b]!, D = c[d]!, E = c[e]!
    out.push(...A, ...B, ...D, ...A, ...D, ...E)
  }
  return out
}

function pushTri(out: number[], a: Vec3, b: Vec3, c: Vec3) {
  out.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2])
}

/** Fills the area between an outline and holes at height z, facing up (+Z) or down (-Z). */
function capFace(outline: Vec2[], holes: Vec2[][], z: number, up: boolean, out: number[]) {
  const pts: Vec2[] = []
  const edges: Array<[number, number]> = []
  const ring = (poly: Vec2[]) => {
    const start = pts.length
    for (const p of poly) pts.push(p)
    for (let i = 0; i < poly.length; i++) edges.push([start + i, start + ((i + 1) % poly.length)])
  }
  ring(outline)
  for (const h of holes) ring(h)
  // Constrained Delaunay keeps every input vertex (no T-junctions with the wall strips) and classifies holes by parity.
  const tris = cdt2d(pts, edges, { exterior: false })
  for (const [i0, i1, i2] of tris) {
    const p = [pts[i0]!, pts[i1]!, pts[i2]!].map(([x, y]) => [x, y, z] as Vec3) as [Vec3, Vec3, Vec3]
    const area = (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[2][0] - p[0][0]) * (p[1][1] - p[0][1])
    if (area === 0) continue
    if (area > 0 === up) pushTri(out, p[0], p[1], p[2])
    else pushTri(out, p[0], p[2], p[1])
  }
}

function wallStrip(a: Vec2[], za: number, b: Vec2[], zb: number, out: number[]) {
  const n = a.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const p0: Vec3 = [a[i]![0], a[i]![1], za]
    const p1: Vec3 = [a[j]![0], a[j]![1], za]
    const p2: Vec3 = [b[j]![0], b[j]![1], zb]
    const p3: Vec3 = [b[i]![0], b[i]![1], zb]
    pushTri(out, p0, p1, p2)
    pushTri(out, p0, p2, p3)
  }
}

export interface HoleLevel {
  z: number
  /** One polygon per hole; polygons must have the same vertex count at every level. */
  holes: Vec2[][]
}

/**
 * Extrudes `outline` along +Z through `levels` (sorted by z, at least two). Hole walls interpolate between
 * levels, so ramps and steps are possible (a step is two levels with the same z). Outline walls are straight.
 */
export function extrudeWithHoleProfile(outline: Vec2[], levels: HoleLevel[]): Mesh {
  if (levels.length < 2) throw new RangeError('at least two levels required')
  const outer = ensureCCW(outline)
  const lv = levels.map((l) => ({ z: l.z, holes: l.holes.map(ensureCW) }))
  const first = lv[0]!, last = lv[lv.length - 1]!
  const out: number[] = []
  capFace(outer, first.holes, first.z, false, out)
  capFace(outer, last.holes, last.z, true, out)
  wallStrip(outer, first.z, outer, last.z, out)
  for (let k = 0; k + 1 < lv.length; k++) {
    const a = lv[k]!, b = lv[k + 1]!
    for (let h = 0; h < a.holes.length; h++) wallStrip(a.holes[h]!, a.z, b.holes[h]!, b.z, out)
  }
  return out
}

/** Prism: outline (with optional holes) extruded from z0 to z1. */
export function extrude(outline: Vec2[], holes: Vec2[][], z0: number, z1: number): Mesh {
  return extrudeWithHoleProfile(outline, [{ z: z0, holes }, { z: z1, holes }])
}

/** Vertical cylinder along +Z. */
export function cylinder(cx: number, cy: number, r: number, z0: number, z1: number, segments = 24): Mesh {
  return extrude(regularPolygon(cx, cy, r, segments), [], z0, z1)
}

/** Truncated square pyramid centred at (cx, cy): base half-size b at z0, top half-size t at z1. */
export function frustumSquare(cx: number, cy: number, b: number, t: number, z0: number, z1: number): Mesh {
  const lo = (h: number, z: number): Vec3[] => [
    [cx - h, cy - h, z], [cx + h, cy - h, z], [cx + h, cy + h, z], [cx - h, cy + h, z],
  ]
  const A = lo(b, z0), B = lo(t, z1)
  const out: number[] = []
  pushTri(out, A[0]!, A[3]!, A[2]!); pushTri(out, A[0]!, A[2]!, A[1]!)
  pushTri(out, B[0]!, B[1]!, B[2]!); pushTri(out, B[0]!, B[2]!, B[3]!)
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4
    pushTri(out, A[i]!, A[j]!, B[j]!)
    pushTri(out, A[i]!, B[j]!, B[i]!)
  }
  return out
}

/** Sweeps a 2D profile (in the XY plane) along Z. Same as `extrude` without holes, kept for readability. */
export function prism(profile: Vec2[], z0: number, z1: number): Mesh {
  return extrude(profile, [], z0, z1)
}

/**
 * Orients a mesh built in any frame so it lies on the bed: applies `m`, then centres X/Y on the origin and
 * drops the lowest point to z = 0. Returns the oriented mesh and the full local→bed matrix.
 */
export function toBed(mesh: Mesh, m: Mat4 = IDENTITY): { mesh: Mesh; matrix: Mat4 } {
  const rotated = transform(mesh, m)
  const b = bbox(rotated)
  const shift = mat4Translate(-(b.lo[0] + b.hi[0]) / 2, -(b.lo[1] + b.hi[1]) / 2, -b.lo[2])
  const matrix = mat4Mul(shift, m)
  return { mesh: transform(mesh, matrix), matrix }
}
