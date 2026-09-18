import { mat4Translate, mat4Mul, type Mat4, type Vec2, type Vec3 } from '../geom/mesh'
import type { FaceId } from '../model/types'

/**
 * Face frame: local plate coordinates (x = u, y = v, z = outward normal) seen from OUTSIDE the cabinet, so a skin
 * built as a plate in [0,width] × [0,height] × [0,thickness] prints with its outer face up.
 * The skeleton's outer envelope is the user's width × height × depth; skins sit OUTSIDE it (they add thickness).
 */
export interface FaceFrame {
  face: FaceId
  origin: Vec3
  u: Vec3
  v: Vec3
  n: Vec3
  width: number
  height: number
}

export function faceFrame(face: FaceId, W: number, H: number, D: number): FaceFrame {
  switch (face) {
    case 'left':
      return { face, origin: [0, 0, 0], u: [0, 0, 1], v: [0, 1, 0], n: [-1, 0, 0], width: D, height: H }
    case 'right':
      return { face, origin: [W, 0, D], u: [0, 0, -1], v: [0, 1, 0], n: [1, 0, 0], width: D, height: H }
    case 'back':
      return { face, origin: [W, 0, 0], u: [-1, 0, 0], v: [0, 1, 0], n: [0, 0, -1], width: W, height: H }
    case 'top':
      return { face, origin: [0, H, D], u: [1, 0, 0], v: [0, 0, -1], n: [0, 1, 0], width: W, height: D }
    case 'bottom':
      return { face, origin: [0, 0, 0], u: [1, 0, 0], v: [0, 0, 1], n: [0, -1, 0], width: W, height: D }
  }
}

/** Matrix from face-local plate coordinates to assembled coordinates, with the plate lifted `offset` mm outward. */
export function faceMatrix(f: FaceFrame, offset = 0): Mat4 {
  const basis: Mat4 = [
    f.u[0], f.v[0], f.n[0], 0,
    f.u[1], f.v[1], f.n[1], 0,
    f.u[2], f.v[2], f.n[2], 0,
    0, 0, 0, 1,
  ]
  return mat4Mul(mat4Translate(f.origin[0] + f.n[0] * offset, f.origin[1] + f.n[1] * offset, f.origin[2] + f.n[2] * offset), basis)
}

export interface FaceAnchors {
  /** Peg/hole centres in face-local (u, v) coordinates, all on solid skeleton bars. */
  points: Vec2[]
  /** Through-hole diameter in the skeleton (pegs are this minus the fit clearance). */
  holeDiameter: number
}
