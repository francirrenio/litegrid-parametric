import { bbox, merge, transform, type Mat4, type Mesh } from '../geom/mesh'
import { clipMesh, type AxisIdx } from './mesh-clip'

/**
 * Splits a drawer that is bigger than the print bed into sections that are glued together.
 *
 * The drawer is a soup of closed prisms that overlap. Every prism is cut by axis-aligned planes with caps
 * (`clipMesh`), so each output shell stays watertight. At a seam the left section keeps its half plus square pegs
 * that reach into the right section; the right section loses the matching notches (0.1 mm or more of clearance).
 * The pegs are `hp` wide, `len` long, and go through the whole drawer in the third direction, so they land on the
 * floor (pegs lying in the floor plane) and on the back and front walls (pegs lying in the wall planes) alike.
 * Both kinds slide together in the same direction (across the seam), so the halves just press together and get glued;
 * the pegs keep them aligned and add glue area. Nothing pokes out of the drawer envelope: pegs are cut from real material.
 */

const SWAP_XZ: Mat4 = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1]
const BAND = 0.1
const MARGIN = 1
const CLEAN = 0.02

export interface SplitInput {
  pieces: Mesh[]
  /** Wall thickness of the sides/back, of the front, and floor thickness. */
  w: number
  wf: number
  fT: number
  /** Top of the walls (lowest of wall and front heights). */
  yTop: number
  bed: { x: number; y: number }
  fit: number
  /** Intervals along drawer x / z that a seam should avoid (label, handle, divider grooves). */
  avoidX: Array<[number, number]>
  avoidZ: Array<[number, number]>
  /** Restrict the cut to one axis; `relax` ignores the other dimension (used before a second cut). */
  only?: 'x' | 'z'
  relax?: boolean
}

export interface SplitResult {
  axis: 'x' | 'z'
  halves: Mesh[]
  pegs: number
  /** Every half as the list of closed shells it is made of. */
  shells: Mesh[][]
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Peg size from the wall thickness: width along the seam and length across it. */
export function pegSize(w: number): { hp: number; len: number } {
  const hp = clamp(Math.round(6 * w), 9, 16)
  return { hp, len: clamp(Math.round(0.7 * hp), 6, 10) }
}

interface Box3 {
  lo: number[]
  hi: number[]
}
const boxOf = (m: Mesh): Box3 => {
  const b = bbox(m)
  return { lo: b.lo, hi: b.hi }
}
const overlaps = (b: Box3, lo: number[], hi: number[]) => [0, 1, 2].every((k) => b.hi[k]! > lo[k]! && b.lo[k]! < hi[k]!)

/** Number of pieces along one axis so that each (plus the peg protrusion) fits `lmax`; 0 when impossible. */
function countFor(ext: number, len: number, lmax: number): number {
  if (lmax <= len + 5) return 0
  for (let n = 2; n <= 6; n++) if (ext / n + len <= lmax + 1e-9) return n
  return 0
}

function fitLimit(other: number, bed: { x: number; y: number }): number {
  const opts: number[] = []
  if (other <= bed.y - MARGIN) opts.push(bed.x - MARGIN)
  if (other <= bed.x - MARGIN) opts.push(bed.y - MARGIN)
  return opts.length ? Math.max(...opts) : 0
}

function nudgeAvoid(cuts: number[], lo: number, hi: number, len: number, lmax: number, avoid: Array<[number, number]>) {
  const pad = 2
  const ok = (c: number, i: number, all: number[]) => {
    const prev = i === 0 ? lo : all[i - 1]!
    const next = i === all.length - 1 ? hi : all[i + 1]!
    return c - prev + len <= lmax && (i === all.length - 1 ? hi - c <= lmax : next - c + len <= lmax) && c > prev + 15 && c < next - 15
  }
  for (let i = 0; i < cuts.length; i++) {
    const c = cuts[i]!
    const hit = avoid.find(([a, b]) => c > a - pad && c < b + pad)
    if (!hit) continue
    const cands = [hit[0] - pad - 0.5, hit[1] + pad + 0.5].sort((p, q) => Math.abs(p - c) - Math.abs(q - c))
    for (const cand of cands) {
      const trial = cuts.slice()
      trial[i] = cand
      if (ok(cand, i, trial) && !avoid.some(([a, b]) => cand > a - pad && cand < b + pad)) {
        cuts[i] = cand
        break
      }
    }
  }
}

/** Coordinates sorted per axis, to keep cutting planes clear of every vertex. */
function coordSets(pieces: Mesh[]): Float64Array[] {
  const sets = [[], [], []] as number[][]
  for (const m of pieces) for (let i = 0; i < m.length; i += 3) for (let k = 0; k < 3; k++) sets[k]!.push(m[i + k]!)
  return sets.map((s) => Float64Array.from(s).sort())
}
function nearest(sorted: Float64Array, v: number): number {
  let lo = 0, hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid]! < v) lo = mid + 1
    else hi = mid
  }
  let d = Infinity
  if (lo < sorted.length) d = Math.min(d, sorted[lo]! - v)
  if (lo > 0) d = Math.min(d, v - sorted[lo - 1]!)
  return d
}

/** Distance from `v` to the closest coordinate on the given side. */
function nearestSide(sorted: Float64Array, v: number, dir: -1 | 1): number {
  let lo = 0, hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid]! < v) lo = mid + 1
    else hi = mid
  }
  if (dir > 0) return lo < sorted.length ? sorted[lo]! - v : BAND * 2
  return lo > 0 ? v - sorted[lo - 1]! : BAND * 2
}

export function splitDrawerPieces(inp: SplitInput): SplitResult | null {
  const all = merge(...inp.pieces)
  const bb = bbox(all)
  const { hp, len } = pegSize(inp.w)
  const options: Array<{ axis: 'x' | 'z'; n: number; lmax: number }> = []
  const limX = inp.relax ? Math.max(inp.bed.x, inp.bed.y) - MARGIN : fitLimit(bb.size[2], inp.bed)
  const limZ = inp.relax ? Math.max(inp.bed.x, inp.bed.y) - MARGIN : fitLimit(bb.size[0], inp.bed)
  const nx = inp.only === 'z' ? 0 : countFor(bb.size[0], len, limX)
  if (nx) options.push({ axis: 'x', n: nx, lmax: limX })
  const nzz = inp.only === 'x' ? 0 : countFor(bb.size[2], len, limZ)
  if (nzz) options.push({ axis: 'z', n: nzz, lmax: limZ })
  if (options.length === 0) return null
  options.sort((p, q) => p.n - q.n)
  const opt = options[0]!
  const swap = opt.axis === 'z'
  const pieces = swap ? inp.pieces.map((m) => transform(m, SWAP_XZ)) : inp.pieces
  const avoid = swap ? inp.avoidZ : inp.avoidX
  const canon = boxOf(merge(...pieces))
  const X0 = canon.lo[0]!, X1 = canon.hi[0]!
  const Zlo = canon.lo[2]!, Zhi = canon.hi[2]!
  const cuts = Array.from({ length: opt.n - 1 }, (_, i) => X0 + ((X1 - X0) * (i + 1)) / opt.n)
  nudgeAvoid(cuts, X0, X1, len, opt.lmax, avoid)

  const sets = coordSets(pieces)
  /** Moves a cutting plane (in `dir`, or either way when 0) off every vertex coordinate; the drift stays under 1.5 mm. */
  const clean = (axis: number, v: number, dir: -1 | 0 | 1): number => {
    const set = sets[axis]!
    for (const [step, min, count] of [[0.03, CLEAN, 50], [0.0071, 1e-3, 200]] as const) {
      for (let k = 0; k <= count; k++) {
        for (const sgn of dir === 0 ? [1, -1] : [dir]) {
          const t = v + sgn * k * step
          if (nearest(set, t) >= min) return t
        }
      }
    }
    return v
  }

  const band = (axis: number, v: number, dir: -1 | 1): number => Math.max(0.005, Math.min(BAND, nearestSide(sets[axis]!, v, dir) / 2))

  // Ray-cast inside test against the union of the (closed) prisms.
  const boxes = pieces.map(boxOf)
  const inside = (x: number, y: number, z: number): boolean => {
    const py = y + 1.234e-3, pz = z + 2.345e-3
    for (let pi = 0; pi < pieces.length; pi++) {
      const b = boxes[pi]!
      if (x < b.lo[0]! || x > b.hi[0]! || py < b.lo[1]! || py > b.hi[1]! || pz < b.lo[2]! || pz > b.hi[2]!) continue
      const m = pieces[pi]!
      let hits = 0
      for (let i = 0; i < m.length; i += 9) {
        const ay = m[i + 1]!, az = m[i + 2]!, by = m[i + 4]!, bz = m[i + 5]!, cy = m[i + 7]!, cz = m[i + 8]!
        const d = (by - ay) * (cz - az) - (cy - ay) * (bz - az)
        if (d === 0) continue
        const u = ((py - ay) * (cz - az) - (cy - ay) * (pz - az)) / d
        const v = ((by - ay) * (pz - az) - (py - ay) * (bz - az)) / d
        if (u < 0 || v < 0 || u + v > 1) continue
        const xi = m[i]! + u * (m[i + 3]! - m[i]!) + v * (m[i + 6]! - m[i]!)
        if (xi > x) hits++
      }
      if (hits % 2 === 1) return true
    }
    return false
  }

  const yLo = inp.fT + 1 + hp / 2, yHi = inp.yTop - 1 - hp / 2
  const zLo = Math.max(inp.w, inp.wf) + 1 + hp / 2, zHi = Zhi - Math.max(inp.w, inp.wf) - 1 - hp / 2
  const zBack = Zlo + inp.w / 2, zFront = Zhi - (swap ? inp.w : inp.wf) + 0.3

  const spread = (lo: number, hi: number, pitch: number, ok: (t: number) => boolean): number[] => {
    if (hi <= lo) return []
    const length = hi - lo
    let n = clamp(Math.round(length / pitch), 1, 4)
    if (n < 2 && length >= 2 * hp + 6) n = 2
    const picked: number[] = []
    for (let i = 0; i < n; i++) {
      const target = lo + (length * (i + 0.5)) / n
      for (let off = 0; off <= length / (2 * n); off += 1) {
        const hit = [target + off, target - off].find((t) => t >= lo && t <= hi && ok(t) && picked.every((q) => Math.abs(q - t) >= hp + 2))
        if (hit !== undefined) { picked.push(hit); break }
      }
    }
    return picked.sort((p, q) => p - q)
  }

  const halves: Mesh[][] = []
  let rest: Mesh[] = pieces
  let pegCount = 0
  const nonEmpty = (m: Mesh) => m.length > 0
  for (const c0 of cuts) {
    const c = clean(0, c0, 0)
    // Overlap bands stay free of vertices, so the overlapping shells never share an original edge.
    const cBand = c - band(0, c, -1)
    const xPeg = clean(0, c + len, -1)
    const xe = clean(0, xPeg + inp.fit, 1)
    const xeBand = xe + band(0, xe, 1)
    const xs = [c - 1.5, c + 1, c + len - 1]
    // Pegs in the floor plane (through all y) and in the wall planes (through all z).
    const floorOk = (t: number) => [t - hp / 2 + 1, t, t + hp / 2 - 1].every((z) => xs.every((x) => inside(x, inp.fT / 2, z)))
    const wallOk = (t: number) => [t - hp / 2 + 1, t, t + hp / 2 - 1].every((y) => xs.every((x) => inside(x, y, zBack) && inside(x, y, zFront)))
    const floorZ = spread(zLo, zHi, 70, floorOk)
    const wallY = spread(yLo, yHi, 45, wallOk)
    type Peg = { axis: 1 | 2; a: number; b: number; ra: number; rb: number }
    const pegs: Peg[] = [
      ...floorZ.map((t) => {
        const a = clean(2, t - hp / 2, -1), b = clean(2, t + hp / 2, 1)
        return { axis: 2 as const, a, b, ra: clean(2, a - inp.fit, -1), rb: clean(2, b + inp.fit, 1) }
      }),
      ...wallY.map((t) => {
        const a = clean(1, t - hp / 2, -1), b = clean(1, t + hp / 2, 1)
        return { axis: 1 as const, a, b, ra: clean(1, a - inp.fit, -1), rb: clean(1, b + inp.fit, 1) }
      }),
    ]
    pegCount += pegs.length

    const left: Mesh[] = []
    for (const m of rest) {
      const l = clipMesh(m, 0, c, false)
      if (nonEmpty(l)) left.push(l)
      const bx = boxOf(m)
      for (const g of pegs) {
        const lo = [c, -Infinity, -Infinity], hi = [xPeg, Infinity, Infinity]
        lo[g.axis] = g.a
        hi[g.axis] = g.b
        if (!overlaps(bx, lo, hi)) continue
        let q = clipMesh(m, 0, cBand, true)
        if (nonEmpty(q)) q = clipMesh(q, 0, xPeg, false)
        if (nonEmpty(q)) q = clipMesh(q, g.axis as AxisIdx, g.a, true)
        if (nonEmpty(q)) q = clipMesh(q, g.axis as AxisIdx, g.b, false)
        if (nonEmpty(q)) left.push(q)
      }
    }
    halves.push(left)

    const right: Mesh[] = []
    const notch = (g: Peg, q: Mesh): boolean => {
      const lo = [c, -Infinity, -Infinity], hi = [xe, Infinity, Infinity]
      lo[g.axis] = g.ra
      hi[g.axis] = g.rb
      return overlaps(boxOf(q), lo, hi)
    }
    for (const m of rest) {
      const r = clipMesh(m, 0, c, true)
      if (!nonEmpty(r)) continue
      if (!pegs.some((g) => notch(g, r))) { right.push(r); continue }
      // The material past the notches stays one shell; the slab the notches cut into is carved peg by peg.
      const far = clipMesh(r, 0, xe, true)
      if (nonEmpty(far)) right.push(far)
      let slab: Mesh[] = [clipMesh(r, 0, xeBand, false)].filter(nonEmpty)
      for (const g of pegs) {
        slab = slab.flatMap((q) => {
          if (!notch(g, q)) return [q]
          return [clipMesh(q, g.axis as AxisIdx, g.ra, false), clipMesh(q, g.axis as AxisIdx, g.rb, true)].filter(nonEmpty)
        })
      }
      right.push(...slab)
    }
    rest = right
  }
  halves.push(rest)
  const out = halves.map((h) => {
    const m = merge(...h)
    return swap ? transform(m, SWAP_XZ) : m
  })
  const shells = halves.map((h) => (swap ? h.map((m) => transform(m, SWAP_XZ)) : h))
  return { axis: opt.axis, halves: out, pegs: pegCount, shells }
}

const footprintFits = (m: Mesh, bed: { x: number; y: number }): boolean => {
  const b = bbox(m)
  const w = b.size[0], d = b.size[2]
  return (w <= bed.x && d <= bed.y) || (d <= bed.x && w <= bed.y)
}

/** One cut when possible; otherwise a cut along one axis followed by a cut of every half along the other. */
export function splitDrawerToBed(inp: SplitInput): SplitResult | null {
  const one = splitDrawerPieces(inp)
  if (one) return one
  for (const first of ['x', 'z'] as const) {
    const a = splitDrawerPieces({ ...inp, only: first, relax: true })
    if (!a) continue
    const second = first === 'x' ? 'z' : 'x'
    const halves: Mesh[] = []
    const shells: Mesh[][] = []
    let pegs = a.pegs
    let ok = true
    for (const sh of a.shells) {
      const half = merge(...sh)
      if (footprintFits(half, inp.bed)) { halves.push(half); shells.push(sh); continue }
      const b = splitDrawerPieces({ ...inp, pieces: sh, only: second })
      if (!b) { ok = false; break }
      halves.push(...b.halves)
      shells.push(...b.shells)
      pegs += b.pegs
    }
    if (ok && halves.every((h) => footprintFits(h, inp.bed))) return { axis: first, halves, pegs, shells }
  }
  return null
}
