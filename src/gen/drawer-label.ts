import type { Nozzle } from '../core/nozzle'
import { box, extrude, rotateX, translate, type Mesh, type Vec2 } from '../geom/mesh'
import type { DrawerConfig } from '../model/types'
import type { FrontPlan } from './drawer-front'

const RAIL = 3
const POCKET = 1
const LIP = 1
const CLEAR = 0.6
const OV = 0.3

/** 'none' (also when the holder switch is off), 'internal' groove in the front wall, or 'external' separate holder. */
export function labelModeOf(cfg: DrawerConfig): 'none' | 'internal' | 'external' {
  return !cfg.labelHolder ? 'none' : cfg.labelMode ?? 'external'
}

export const CARD_CLEAR = CLEAR

export const DEFAULT_LABEL_W = 40
export const DEFAULT_LABEL_H = 14

export interface LabelSpec {
  /** Card size the holder takes (mm). */
  lw: number
  lh: number
  /** Holder outer size in the drawer's front plane. */
  outerW: number
  outerH: number
  /** Bottom of the holder, measured from the drawer floor's underside (y = 0). */
  y0: number
}

/** Thickness of the holder: plate plus the rails, which is how deep its recess in the drawer front is. */
export function holderThickness(nz: Nozzle): number {
  return Math.max(1, nz.layerHeight * Math.ceil(1 / nz.layerHeight)) + POCKET + LIP
}

/** Where the separate label holder goes on the drawer front, or null when the front has no room. */
export function labelSpec(W: number, w: number, fT: number, plan: FrontPlan, cfg: DrawerConfig): LabelSpec | null {
  if (!cfg.labelHolder) return null
  const room = W - 2 * w - 4
  const lw = Math.min(cfg.labelWidth ?? DEFAULT_LABEL_W, room - CLEAR - 2 * RAIL)
  const lh = cfg.labelHeight ?? DEFAULT_LABEL_H
  if (lw < 12 || lh < 5) return null
  const outerW = lw + CLEAR + 2 * RAIL
  const outerH = lh + CLEAR + RAIL
  const reserved = plan.notch ? plan.notch.nd : plan.slot ? plan.Hf - plan.slot.y0 : 0
  const yTop = plan.Hf - (reserved + 2)
  const y0 = yTop - outerH
  if (y0 < fT + 1) return null
  return { lw, lh, outerW, outerH, y0 }
}

/** Extrudes an (x, z) profile along y from y0 to y1. */
function prismY(profile: Vec2[], y0: number, y1: number): Mesh {
  return translate(rotateX(extrude(profile, [], 0, y1 - y0), Math.PI / 2), 0, y1, 0)
}

/**
 * Card holder printed on its own and glued to the drawer front: a plate with two side rails and a bottom rail. The
 * side rails have a 45° lip that keeps the paper card in, and the top stays open so the card slides in.
 * Built lying on the bed (plate down), origin at the plate's corner, so it prints without supports.
 */
export function labelHolderMesh(spec: LabelSpec, nz: Nozzle): Mesh {
  const tb = Math.max(1, nz.layerHeight * Math.ceil(1 / nz.layerHeight))
  const { outerW: Wt, outerH: Ht } = spec
  const z0 = tb - OV
  const left: Vec2[] = [[0, z0], [RAIL, z0], [RAIL, tb + POCKET], [RAIL + LIP, tb + POCKET + LIP], [0, tb + POCKET + LIP]]
  const right: Vec2[] = left.map(([x, z]) => [Wt - x, z] as Vec2).reverse()
  return [
    ...box(0, 0, 0, Wt, Ht, tb),
    ...prismY(left, 0, Ht),
    ...prismY(right, 0, Ht),
    ...box(RAIL - OV, 0, z0, Wt - RAIL + OV, RAIL, tb + POCKET),
  ]
}
