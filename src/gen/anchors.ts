import type { Layout } from '../core/layout'
import type { Nozzle } from '../core/nozzle'
import type { FaceId, ProjectState } from '../model/types'
import type { FaceAnchors } from './faces'
import { skeletonMetrics } from './metrics'
import { skeletonAnchors } from './skeleton'

/**
 * Peg/hole positions on the skeleton's outer bars for a face (face-local u, v). The cabinet generator drills
 * these holes; skins, fixing plates and spacers place matching pegs. Points lie on bar centre lines.
 */
export function faceAnchors(p: ProjectState, _layout: Layout, nz: Nozzle, face: FaceId): FaceAnchors {
  return { points: skeletonAnchors(p, nz, face), holeDiameter: skeletonMetrics(p, nz).holeD }
}
