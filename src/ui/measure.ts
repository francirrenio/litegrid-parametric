export interface Measurement {
  dist: number
  /** Differences in print-bed axes: X across, Y depth, Z up (the model keeps Y up and Z toward the front). */
  dx: number
  dy: number
  dz: number
}

interface P3 {
  x: number
  y: number
  z: number
}

export function measurement(a: P3, b: P3): Measurement {
  const dx = Math.abs(b.x - a.x)
  const dy = Math.abs(b.z - a.z)
  const dz = Math.abs(b.y - a.y)
  return { dist: Math.hypot(dx, dy, dz), dx, dy, dz }
}
