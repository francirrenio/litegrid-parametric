import {
  bbox, mat4InvertRigid, mat4Mul, toBed, transform, type Mat4, type Mesh, type Vec3, IDENTITY,
} from '../geom/mesh'
import type { Layout, Warning } from '../core/layout'
import type { LayoutManifest } from '../core/manifest'

/**
 * Assembled coordinate system (mm): origin at the cabinet's left-bottom-back outer corner,
 * +X right, +Y up, +Z toward the front (where drawers open).
 */
export type PartGroup = 'gabinete' | 'gaveta' | 'skin' | 'espacador' | 'fixacao' | 'teste'

export interface Part {
  id: string
  label: string
  group: PartGroup
  /** Triangle mesh in PRINT orientation: flat on the bed, centred on X/Y, lowest point at z = 0. */
  mesh: Mesh
  /** One matrix per copy: print-space → assembled cabinet coordinates. */
  instances: Mat4[]
  color?: string
  /** Short human hint about orientation or printing (pt-BR). */
  note?: string
  /** Number engraved/listed in the assembly guide. */
  assemblyStep?: number
  size: Vec3
}

export interface MakePartOptions {
  id: string
  label: string
  group: PartGroup
  /** Geometry built directly in assembled cabinet coordinates, at a reference position. */
  assembled: Mesh
  /** Rotation (and optional translation) that turns the part so its flat face lies on the bed. */
  orient?: Mat4
  /**
   * One transform per copy, applied to the reference geometry in assembled space (e.g. a translation from the
   * reference bay to another bay). Defaults to a single identity copy.
   */
  placements?: Mat4[]
  color?: string
  note?: string
  assemblyStep?: number
}

export function makePart(o: MakePartOptions): Part {
  const { mesh, matrix } = toBed(o.assembled, o.orient ?? IDENTITY)
  const back = mat4InvertRigid(matrix)
  const placements = o.placements ?? [IDENTITY]
  return {
    id: o.id,
    label: o.label,
    group: o.group,
    mesh,
    instances: placements.map((p) => mat4Mul(p, back)),
    color: o.color,
    note: o.note,
    assemblyStep: o.assemblyStep,
    size: bbox(mesh).size,
  }
}

/** Mesh of one instance in assembled coordinates. */
export function instanceMesh(part: Part, index: number): Mesh {
  return transform(part.mesh, part.instances[index]!)
}

export interface Suggestion {
  id: string
  severity: 'info' | 'warn'
  /** Where it applies: 'cabinet', a bay id, 'drawerDefaults', a face id... */
  target: string
  title: string
  detail: string
  /** Changes that apply the suggestion, as dotted paths on ProjectState. */
  patches: Array<{ path: string; value: unknown }>
}

export interface GenerateResult {
  layout: Layout
  parts: Part[]
  warnings: Warning[]
  suggestions: Suggestion[]
  manifest: LayoutManifest
}
