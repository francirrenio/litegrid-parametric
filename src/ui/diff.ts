import type { Mat4, Mesh } from '../geom/mesh'
import type { Part } from '../model/part'
import { partFamily } from './appearance'

/** Triangles of a part that are new or moved since the previous generation. */
export interface DiffItem {
  partId: string
  instances: Mat4[]
  /** Flat triangle soup in the part's print space. */
  tris: Mesh
  /** True when the whole part is new (no earlier version to compare with). */
  whole: boolean
}

const MAX_TRIS = 120_000
const q = (v: number) => Math.round(v * 200)

function triKey(m: Mesh, i: number): string {
  const a = `${q(m[i]!)},${q(m[i + 1]!)},${q(m[i + 2]!)}`
  const b = `${q(m[i + 3]!)},${q(m[i + 4]!)},${q(m[i + 5]!)}`
  const c = `${q(m[i + 6]!)},${q(m[i + 7]!)},${q(m[i + 8]!)}`
  return a < b ? (b < c ? `${a}|${b}|${c}` : a < c ? `${a}|${c}|${b}` : `${c}|${a}|${b}`) : a < c ? `${b}|${a}|${c}` : b < c ? `${b}|${c}|${a}` : `${c}|${b}|${a}`
}

function findOld(old: Part[], p: Part): Part | undefined {
  const fam = partFamily(p.id)
  return (
    old.find((o) => o.id === p.id) ??
    old.find((o) => partFamily(o.id) === fam && o.label === p.label) ??
    old.find((o) => partFamily(o.id) === fam)
  )
}

/** Compares two generations and returns what changed, part by part. Skips parts too big to compare quickly. */
export function computeDiff(before: Part[], after: Part[]): DiffItem[] {
  const out: DiffItem[] = []
  for (const p of after) {
    if (p.mesh.length / 9 > MAX_TRIS) continue
    const o = findOld(before, p)
    if (!o) {
      out.push({ partId: p.id, instances: p.instances, tris: p.mesh, whole: true })
      continue
    }
    if (o.mesh.length / 9 > MAX_TRIS) continue
    const seen = new Set<string>()
    for (let i = 0; i < o.mesh.length; i += 9) seen.add(triKey(o.mesh, i))
    const changed: number[] = []
    for (let i = 0; i < p.mesh.length; i += 9) {
      if (!seen.has(triKey(p.mesh, i))) for (let k = 0; k < 9; k++) changed.push(p.mesh[i + k]!)
    }
    if (changed.length === 0) continue
    out.push({ partId: p.id, instances: p.instances, tris: changed, whole: false })
  }
  return out
}
