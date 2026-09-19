import type { Section } from '../core/layout'
import type { NozzleOverrides } from '../core/nozzle'
import type { Clearances } from '../core/layout'

export type Material = 'PLA' | 'PETG' | 'ABS' | 'ASA' | 'PLA-CF'
export type MaterialLevel = 'minimo' | 'equilibrado' | 'reforcado'
export type Load = 'leve' | 'media' | 'pesada'
export type FaceId = 'left' | 'right' | 'top' | 'bottom' | 'back'
export const FACE_IDS: FaceId[] = ['left', 'right', 'top', 'bottom', 'back']

export type FillType = 'none' | 'closed' | 'perforated' | 'truss' | 'panel'
export type HolePattern = 'triangle' | 'hexagon' | 'diamond' | 'circle'
export type PanelSystem = 'skadis' | 'pegboard' | 'hsw'
export type Reinforcement = 'auto' | 'none' | 'ribs' | 'postsBeams' | 'truss' | 'x' | 'corrugated'

/** How a flat face (cabinet skin or drawer wall/floor) is filled. */
export interface FaceFill {
  fill: FillType
  pattern: HolePattern
  /** Target open area, 0–100 %. Effective value may be lower (clamped by smallest item and minimum web). */
  openPercent: number
  /** Face stays closed from the bottom up to this height (mm), perforated above. */
  solidUpTo: number
  /** Solid border around the face (mm). 'auto' = derived from nozzle. */
  frame: number | 'auto'
  reinforcement: Reinforcement
  panelSystem: PanelSystem
  pegboardHole: '1/4' | '1/8'
  hswVariant: 'sd' | 'hd'
  /** Skadis grid: also cut the staggered intermediate columns (real board layout). */
  skadisStaggered: boolean
  /** Panel thickness (mm). 'auto' = system default (Skadis 5, HSW 8/10) or nozzle-derived. */
  thickness: number | 'auto'
}

export type SkinAttach = 'tabs' | 'clips' | 'screws' | 'glue'
export type Standoff = 'none' | 'spacers' | 'pockets'

export interface SkinConfig extends FaceFill {
  enabled: boolean
  attach: SkinAttach
  standoff: Standoff
  /** Standoff / pocket depth (mm). 'auto' = system default. */
  standoffMm: number | 'auto'
  color: string
}

export type DrawerFront = 'flat' | 'slope' | 'lip'
export type DrawerHandle = 'cutout' | 'bar' | 'none'

export interface DrawerConfig {
  perimeters: number
  sides: FaceFill
  floor: FaceFill
  front: DrawerFront
  handle: DrawerHandle
  /** Separate card holder part, printed apart and glued on the drawer front. */
  labelHolder: boolean
  labelWidth: number
  labelHeight: number
  /** Removable divider slots across the drawer width (0 = none). */
  dividerSlots: number
  innerChamfer: boolean
  topRim: boolean
}

export type SkeletonBracing = 'auto' | 'none' | 'corners' | 'diagonal' | 'back'

export interface SkeletonConfig {
  perimeters: number
  barWidth: number | 'auto'
  bracing: SkeletonBracing
}

export interface FixingConfig {
  between: { pins: boolean; butterfly: boolean; screw: 'none' | 'M3' | 'M4'; magnet: boolean }
  wall: { mode: 'none' | 'screws' | 'keyhole' | 'cleat'; screwDiameter: number }
  hangOnSkadis: boolean
}

export interface ProjectState {
  version: number
  name: string
  nozzle: number
  width: number
  height: number
  depth: number
  material: Material
  materialLevel: MaterialLevel
  cabinetMode: 'monolithic' | 'skeleton'
  sections: Section[]
  skeleton: SkeletonConfig
  skins: Record<FaceId, SkinConfig>
  fixing: FixingConfig
  drawerDefaults: DrawerConfig
  /** Per-drawer overrides keyed by bay id (e.g. BAY_S1_R2_C1). */
  overrides: Record<string, Partial<DrawerConfig>>
  printBed: { x: number; y: number; preset?: string }
  /** Adds the small test kit (mini drawer and joint samples) to the part list and the export. */
  includeTestPiece?: boolean
  /** Viewer colours: per part group and per part id. */
  colors?: { groups: Record<string, string>; parts: Record<string, string> }
  /** Smallest item stored (mm): perforation holes are limited to this size. */
  smallestItem: number
  advanced: NozzleOverrides & { clearances?: Partial<Clearances>; fitClearance?: number }
}

export const PROJECT_VERSION = 1
