import { mat4Apply, type Vec3 } from '../geom/mesh'
import type { GenerateResult, Part } from '../model/part'
import type { ProjectState } from '../model/types'

export interface Box {
  lo: Vec3
  hi: Vec3
}

const cache = new WeakMap<Part, Box>()

export function partBox(part: Part): Box {
  let b = cache.get(part)
  if (b) return b
  const lo: Vec3 = [Infinity, Infinity, Infinity]
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity]
  const m = part.mesh
  for (let i = 0; i + 2 < m.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const c = m[i + k]!
      if (c < lo[k]!) lo[k] = c
      if (c > hi[k]!) hi[k] = c
    }
  }
  b = m.length ? { lo, hi } : { lo: [0, 0, 0], hi: [0, 0, 0] }
  cache.set(part, b)
  return b
}

/** Assembled-space box of one instance (box of the transformed corners). */
export function instanceBox(part: Part, i: number): Box {
  const b = partBox(part)
  const lo: Vec3 = [Infinity, Infinity, Infinity]
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity]
  const mat = part.instances[i]!
  for (let c = 0; c < 8; c++) {
    const p = mat4Apply(mat, [c & 1 ? b.hi[0] : b.lo[0], c & 2 ? b.hi[1] : b.lo[1], c & 4 ? b.hi[2] : b.lo[2]])
    for (let k = 0; k < 3; k++) {
      if (p[k]! < lo[k]!) lo[k] = p[k]!
      if (p[k]! > hi[k]!) hi[k] = p[k]!
    }
  }
  return { lo, hi }
}

/** Cabinet volume united with every generated part (skins and standoffs stick out of it). */
export function outerBox(result: GenerateResult, p: ProjectState): Box {
  const lo: Vec3 = [0, 0, 0]
  const hi: Vec3 = [p.width, p.height, p.depth]
  for (const part of result.parts) {
    for (let i = 0; i < part.instances.length; i++) {
      const b = instanceBox(part, i)
      for (let k = 0; k < 3; k++) {
        if (b.lo[k]! < lo[k]!) lo[k] = b.lo[k]!
        if (b.hi[k]! > hi[k]!) hi[k] = b.hi[k]!
      }
    }
  }
  return { lo, hi }
}
