import { regularPolygon, slotPoly, type HoleLevel, type Vec2 } from '../geom/mesh'
import type { PanelSystem } from '../model/types'

export const SKADIS = {
  slotW: 5,
  slotH: 15,
  /** Fabrication tolerance: slot height actually cut. */
  slotHTol: 15.2,
  chamfer: 1.1,
  faceW: 7.2,
  faceH: 17.1,
  pitchX: 40,
  pitchY: 20,
  rowOffset: 20,
  minThickness: 3,
  maxThickness: 5,
  defaultThickness: 5,
} as const

export const PEGBOARD = { pitch: 25.4, defaultThickness: 4, minThickness: 3, maxThickness: 6 } as const

export const HSW = {
  neighbour: 23.6,
  columnPitch: 20.44,
  columnOffset: 11.8,
  sdThickness: 8,
  hdThickness: 10,
} as const

const SEG_SLOT = 8
const SEG_ROUND = 24

/** Default set-back behind the panel for the hooks (mm); provisional for Pegboard and HSW. */
export const PANEL_STANDOFF: Record<PanelSystem, number> = { skadis: 20, pegboard: 20, hsw: 20 }

/** HSW hole profile: [z from the back face (mm), face-to-face width (mm)]. */
export function hswProfile(variant: 'sd' | 'hd'): Array<[number, number]> {
  const sd: Array<[number, number]> = [[0, 20.8], [0.5, 20], [5.1, 20], [6, 22], [8, 22]]
  if (variant === 'sd') return sd
  return [...sd, [9.19, 20], [9.7, 20], [10, 20.6]]
}

/** Flat-top hexagon (vertices left/right) with the given face-to-face width. */
export function hswHex(cx: number, cy: number, acrossFlats: number): Vec2[] {
  return regularPolygon(cx, cy, acrossFlats / Math.sqrt(3), 6, 0)
}

export interface PanelRequest {
  system: PanelSystem
  width: number
  height: number
  /** Solid border (mm): holes (at their widest) stay inside it. */
  margin: number
  /** Holes only above this height (mm). */
  minY?: number
  thickness: number | 'auto'
  staggered: boolean
  pegboardHole: '1/4' | '1/8'
  hswVariant: 'sd' | 'hd'
}

export interface PanelGeometry {
  system: PanelSystem
  thickness: number
  centres: Vec2[]
  levels: HoleLevel[]
  /** Half size (x, y) of the widest hole outline. */
  extent: Vec2
  warnings: string[]
}

export function panelThickness(
  system: PanelSystem, hsw: 'sd' | 'hd', requested: number | 'auto',
): { value: number; warnings: string[] } {
  const warnings: string[] = []
  if (system === 'hsw') {
    if (requested !== 'auto') warnings.push('HSW: a espessura segue a versão (SD 8 mm, HD 10 mm); valor informado ignorado.')
    return { value: hsw === 'hd' ? HSW.hdThickness : HSW.sdThickness, warnings }
  }
  const def = system === 'skadis' ? SKADIS.defaultThickness : PEGBOARD.defaultThickness
  const max = system === 'skadis' ? SKADIS.maxThickness : PEGBOARD.maxThickness
  const min = system === 'skadis' ? SKADIS.minThickness : PEGBOARD.minThickness
  const value = requested === 'auto' ? def : requested
  if (system === 'skadis' && value > max) warnings.push(`Skadis: acima de ${max} mm as garras dos ganchos não abraçam o furo.`)
  if (value < min) warnings.push(`${system === 'skadis' ? 'Skadis' : 'Pegboard'}: espessura abaixo de ${min} mm fica frágil.`)
  return { value, warnings }
}

function holeExtent(system: PanelSystem, hole: '1/4' | '1/8'): Vec2 {
  if (system === 'skadis') return [SKADIS.faceW / 2, SKADIS.faceH / 2]
  if (system === 'pegboard') {
    const r = (hole === '1/4' ? 6.35 : 3.175) / 2
    return [r, r]
  }
  return [22 / Math.sqrt(3), 11]
}

const parity = (j: number) => ((j % 2) + 2) % 2

function candidates(req: PanelRequest, cx: number, cy: number, n: number): Vec2[] {
  const pts: Vec2[] = []
  for (let j = -n; j <= n; j++)
    for (let i = -n; i <= n; i++) {
      if (req.system === 'skadis') {
        if (req.staggered) pts.push([cx + SKADIS.pitchX * i + parity(j) * SKADIS.rowOffset, cy + SKADIS.pitchY * j])
        else pts.push([cx + SKADIS.pitchX * i, cy + SKADIS.pitchX * j])
      } else if (req.system === 'pegboard') {
        pts.push([cx + PEGBOARD.pitch * i, cy + PEGBOARD.pitch * j])
      } else {
        pts.push([cx + HSW.columnPitch * i, cy + HSW.neighbour * j + parity(i) * HSW.columnOffset])
      }
    }
  return pts
}

/** Hole centres in plate coordinates: the grid keeps the system pitch and is centred inside the margin. */
export function panelCentres(req: PanelRequest): Vec2[] {
  const [hw, hh] = holeExtent(req.system, req.pegboardHole)
  const x0 = req.margin + hw, x1 = req.width - req.margin - hw
  const y0 = Math.max(req.margin, req.minY ?? 0) + hh, y1 = req.height - req.margin - hh
  if (x1 < x0 || y1 < y0) return []
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  const n = Math.ceil(Math.max(x1 - x0, y1 - y0) / 20) + 2
  const kept = candidates(req, cx, cy, n).filter(([x, y]) => x >= x0 - 1e-6 && x <= x1 + 1e-6 && y >= y0 - 1e-6 && y <= y1 + 1e-6)
  if (kept.length === 0) return []
  let lx = Infinity, hx = -Infinity, ly = Infinity, hy = -Infinity
  for (const [x, y] of kept) { lx = Math.min(lx, x); hx = Math.max(hx, x); ly = Math.min(ly, y); hy = Math.max(hy, y) }
  const dx = cx - (lx + hx) / 2, dy = cy - (ly + hy) / 2
  return kept.map(([x, y]) => [x + dx, y + dy] as Vec2)
}

function slotAt(cx: number, cy: number, w: number, h: number): Vec2[] {
  return slotPoly(cx, cy, w, h, SEG_SLOT)
}

/** Hole levels through the plate: z = 0 is the inner (back) face, z = thickness the outer (front) face. */
export function panelLevels(req: PanelRequest, centres: Vec2[], thickness: number): HoleLevel[] {
  if (req.system === 'skadis') {
    const c = SKADIS.chamfer
    const at = (w: number, h: number) => centres.map(([x, y]) => slotAt(x, y, w, h))
    const face = at(SKADIS.faceW, SKADIS.faceH)
    const bore = at(SKADIS.slotW, SKADIS.slotHTol)
    return [
      { z: 0, holes: face },
      { z: c, holes: bore },
      { z: thickness - c, holes: bore },
      { z: thickness, holes: face },
    ]
  }
  if (req.system === 'pegboard') {
    const r = (req.pegboardHole === '1/4' ? 6.35 : 3.175) / 2
    const holes = centres.map(([x, y]) => regularPolygon(x, y, r, SEG_ROUND))
    return [{ z: 0, holes }, { z: thickness, holes }]
  }
  return hswProfile(req.hswVariant).map(([z, af]) => ({ z, holes: centres.map(([x, y]) => hswHex(x, y, af)) }))
}

export function buildPanel(req: PanelRequest): PanelGeometry {
  const t = panelThickness(req.system, req.hswVariant, req.thickness)
  const centres = panelCentres(req)
  const warnings = [...t.warnings]
  if (centres.length === 0) warnings.push('Face pequena demais para o padrão do painel: nenhum furo gerado.')
  return {
    system: req.system,
    thickness: t.value,
    centres,
    levels: panelLevels(req, centres, t.value),
    extent: holeExtent(req.system, req.pegboardHole),
    warnings,
  }
}
