import type { Mesh } from './mesh'

export function meshArea(mesh: Mesh): number {
  let a = 0
  for (let i = 0; i < mesh.length; i += 9) a += triArea(mesh, i)
  return a
}

function triArea(m: Mesh, i: number): number {
  const ux = m[i + 3]! - m[i]!, uy = m[i + 4]! - m[i + 1]!, uz = m[i + 5]! - m[i + 2]!
  const vx = m[i + 6]! - m[i]!, vy = m[i + 7]! - m[i + 1]!, vz = m[i + 8]! - m[i + 2]!
  return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2
}

/**
 * Area (mm²) of downward-facing surface steeper than `maxAngleDeg` from vertical, ignoring anything lying on
 * the bed (all vertices at z <= bedTolerance). A surface whose normal points down within `maxAngleDeg` of
 * straight down counts as overhang: 45° means the roof must be at least 45° above horizontal.
 * Print orientation is +Z up.
 */
export function overhangArea(mesh: Mesh, maxAngleDeg = 45, bedTolerance = 0.02): number {
  const limit = -Math.cos((maxAngleDeg * Math.PI) / 180)
  let area = 0
  for (let i = 0; i < mesh.length; i += 9) {
    const zs = [mesh[i + 2]!, mesh[i + 5]!, mesh[i + 8]!]
    if (Math.max(...zs) <= bedTolerance) continue
    const ux = mesh[i + 3]! - mesh[i]!, uy = mesh[i + 4]! - mesh[i + 1]!, uz = mesh[i + 5]! - mesh[i + 2]!
    const vx = mesh[i + 6]! - mesh[i]!, vy = mesh[i + 7]! - mesh[i + 1]!, vz = mesh[i + 8]! - mesh[i + 2]!
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz)
    if (len === 0) continue
    if (nz / len < limit) area += len / 2
  }
  return area
}
