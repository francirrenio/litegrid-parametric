import type { Nozzle } from '../core/nozzle'
import type { FaceFill, ProjectState } from '../model/types'

export interface SkeletonMetrics {
  /** Plate thickness of frames, shelves and back (structural perimeters). */
  t: number
  /** Bar width inside frames. */
  bw: number
  /** Through-hole diameter for skin/fixing pegs on skeleton bars. */
  holeD: number
  /** Clearance per side for slots, tabs and pegs. */
  fit: number
}

export function skeletonMetrics(p: ProjectState, nz: Nozzle): SkeletonMetrics {
  const t = nz.wall(p.skeleton.perimeters)
  const bw = p.skeleton.barWidth === 'auto' ? Math.max(8, Math.round(18 * nz.lineWidth * 10) / 10) : p.skeleton.barWidth
  return { t, bw, holeD: Math.max(3, Math.round(bw * 0.4 * 10) / 10), fit: p.advanced.fitClearance ?? 0.15 }
}

/** Default panel thickness for closed/perforated/truss skins (4 perimeters). */
export function skinThickness(fill: Pick<FaceFill, 'thickness'>, nz: Nozzle): number {
  return fill.thickness === 'auto' ? nz.wall(4) : fill.thickness
}
