import cdt2d from 'cdt2d'
import type { Layout } from '../core/layout'
import type { Nozzle } from '../core/nozzle'
import {
  cylinder, extrude, extrudeWithHoleProfile, mat4Mul, mat4RotX, mat4Translate, merge, rectPoly, regularPolygon,
  scalePoly, slotPoly, type Mesh, type Vec2, type Vec3,
} from '../geom/mesh'
import { makePart, type Part } from '../model/part'
import { FACE_IDS, type FaceId, type ProjectState, type SkinConfig } from '../model/types'
import { faceAnchors } from './anchors'
import { faceFrame, faceMatrix } from './faces'
import { skeletonMetrics, skinThickness, type SkeletonMetrics } from './metrics'
import { buildPanel, PANEL_STANDOFF, type PanelGeometry } from './panels'
import { generatePattern } from './patterns'

export const M3_CLEARANCE = 3.4
export const DEFAULT_POCKET_DEPTH = 12
const PEG_SEGMENTS = 20
const SPACER_BASE_MAX = 16

type Attach = 'pegs' | 'screws' | 'none'

/** Solid tapered square block with a central through hole, built in [0, h] along +Z, centred on the origin. */
export function spacerMesh(base: number, top: number, h: number, holeD: number): Mesh {
  const out: number[] = []
  const tri = (a: Vec3, b: Vec3, c: Vec3) => out.push(...a, ...b, ...c)
  const sq = (s: number, z: number): Vec3[] => [[-s, -s, z], [s, -s, z], [s, s, z], [-s, s, z]]
  const hole = (z: number): Vec3[] => regularPolygon(0, 0, holeD / 2, 16).reverse().map(([x, y]) => [x, y, z] as Vec3)
  const strip = (a: Vec3[], b: Vec3[]) => {
    for (let i = 0; i < a.length; i++) {
      const j = (i + 1) % a.length
      tri(a[i]!, a[j]!, b[j]!)
      tri(a[i]!, b[j]!, b[i]!)
    }
  }
  strip(sq(base / 2, 0), sq(top / 2, h))
  strip(hole(0), hole(h))
  const cap = (s: number, z: number, up: boolean) => {
    const outer = sq(s, z), inner = hole(z)
    const pts = [...outer, ...inner].map(([x, y]) => [x, y] as [number, number])
    const edges: Array<[number, number]> = []
    for (let i = 0; i < 4; i++) edges.push([i, (i + 1) % 4])
    for (let i = 0; i < inner.length; i++) edges.push([4 + i, 4 + ((i + 1) % inner.length)])
    for (const [a, b, c] of cdt2d(pts, edges, { exterior: false })) {
      const p = [pts[a]!, pts[b]!, pts[c]!]
      const area = (p[1]![0] - p[0]![0]) * (p[2]![1] - p[0]![1]) - (p[2]![0] - p[0]![0]) * (p[1]![1] - p[0]![1])
      if (area === 0) continue
      const v = (q: [number, number]): Vec3 => [q[0], q[1], z]
      if (area > 0 === up) tri(v(p[0]!), v(p[1]!), v(p[2]!))
      else tri(v(p[0]!), v(p[2]!), v(p[1]!))
    }
  }
  cap(base / 2, 0, false)
  cap(top / 2, h, true)
  return out
}

/** Pocket behind one Skadis slot, in plate coordinates: z from -depth (roof) to 0 (inner face of the plate). */
export function pocketMesh(cx: number, cy: number, depth: number, wall: number): Mesh {
  const cavW = 8, cavH = 18
  const base = slotPoly(cx, cy, cavW, cavH, 8)
  const inset = cavW / 2
  const top = scalePoly(base, 0.02, (cavH / 2 - inset) / (cavH / 2), cx, cy)
  const ramp = Math.min(depth - 1, inset * 1.15)
  const outline = slotPoly(cx, cy, cavW + 2 * wall, cavH + 2 * wall, 8)
  return extrudeWithHoleProfile(outline, [
    { z: -depth, holes: [top] },
    { z: -depth + ramp, holes: [base] },
    { z: 0, holes: [base] },
  ])
}

const upper = (f: FaceId) => f.toUpperCase()

export function generateSkinParts(p: ProjectState, layout: Layout, nz: Nozzle): Part[] {
  const parts: Part[] = []
  const m = skeletonMetrics(p, nz)
  for (const face of FACE_IDS) {
    const cfg = p.skins[face]
    if (!cfg?.enabled || cfg.fill === 'none') continue
    parts.push(...faceSkin(p, layout, nz, face, cfg, m))
  }
  return parts
}

function faceSkin(
  p: ProjectState, layout: Layout, nz: Nozzle, face: FaceId, cfg: SkinConfig, m: SkeletonMetrics,
): Part[] {
  const fr = faceFrame(face, p.width, p.height, p.depth)
  const w = fr.width, h = fr.height
  const anchors = faceAnchors(p, layout, nz, face)
  const isPanel = cfg.fill === 'panel'
  const notes: string[] = []

  let standoff = cfg.standoff
  if (standoff === 'pockets' && !(isPanel && cfg.panelSystem === 'skadis')) {
    standoff = 'spacers'
    notes.push('Bolsos só existem no Skadis: usando espaçadores.')
  }
  let offset = 0
  let pocketDepth = 0
  if (standoff === 'spacers') {
    const auto = isPanel ? PANEL_STANDOFF[cfg.panelSystem] : 0
    offset = cfg.standoffMm === 'auto' ? auto : cfg.standoffMm
    if (!(offset > 0)) { offset = 0; standoff = 'none' }
  } else if (standoff === 'pockets') {
    pocketDepth = Math.max(6, cfg.standoffMm === 'auto' ? DEFAULT_POCKET_DEPTH : cfg.standoffMm)
  }

  const frameCfg = cfg.frame === 'auto' ? nz.wall(4) : cfg.frame
  const margin = Math.max(frameCfg, m.bw + 1)

  let panel: PanelGeometry | null = null
  let thickness: number
  if (isPanel) {
    panel = buildPanel({
      system: cfg.panelSystem, width: w, height: h, margin, minY: cfg.solidUpTo,
      thickness: cfg.thickness, staggered: cfg.skadisStaggered, pegboardHole: cfg.pegboardHole, hswVariant: cfg.hswVariant,
    })
    thickness = panel.thickness
    notes.push(...panel.warnings)
  } else {
    thickness = skinThickness(cfg, nz)
  }

  let attach: Attach = cfg.attach === 'glue' ? 'none' : cfg.attach === 'screws' ? 'screws' : 'pegs'
  if (attach === 'pegs' && offset > 0) {
    attach = 'screws'
    notes.push('Com espaçadores os pinos da skin não alcançam o esqueleto: fixação por parafuso M3 passante.')
  }
  if (attach === 'pegs' && isPanel && cfg.panelSystem === 'hsw') {
    attach = 'screws'
    notes.push('HSW imprime com a face da frente para cima, sem pinos no verso: fixação por parafuso M3.')
  }
  const flip = attach === 'pegs' || pocketDepth > 0

  const screwHoles: Vec2[][] =
    attach === 'screws' ? anchors.points.map(([u, v]) => regularPolygon(u, v, M3_CLEARANCE / 2, 16)) : []

  const rect = rectPoly(0, 0, w, h)
  let plate: Mesh
  if (panel) {
    plate = extrudeWithHoleProfile(rect, panel.levels.map((l) => ({ z: l.z, holes: [...l.holes, ...screwHoles] })))
  } else if (cfg.fill === 'closed') {
    plate = extrude(rect, screwHoles, 0, thickness)
  } else {
    const truss = cfg.fill === 'truss'
    const pat = generatePattern({
      pattern: truss ? 'triangle' : cfg.pattern,
      width: w, height: h,
      openPercent: cfg.openPercent,
      web: truss ? nz.wall(3) : nz.wall(2),
      frame: margin,
      solidUpTo: cfg.solidUpTo,
      maxHole: truss ? 60 : p.smallestItem,
      holeSize: truss ? undefined : Math.min(p.smallestItem, 14),
      upright: false,
    })
    notes.push(...pat.warnings)
    if (truss) notes.push('Treliça: malha triangular de barras (Warren) com moldura.')
    plate = extrude(rect, [...pat.holes, ...screwHoles], 0, thickness)
  }

  const solids: Mesh[] = [plate]
  const pegR = (anchors.holeDiameter - 2 * m.fit) / 2
  if (attach === 'pegs') {
    const len = Math.max(3, m.t + 1)
    for (const [u, v] of anchors.points) solids.push(cylinder(u, v, pegR, -len, 0, PEG_SEGMENTS))
  }
  if (pocketDepth > 0 && panel) {
    const wall = Math.round(nz.wall(3) * 10) / 10
    for (const [x, y] of panel.centres) solids.push(pocketMesh(x, y, pocketDepth, wall))
    notes.push(`Bolsos de ${pocketDepth} mm por fenda avançam para dentro do gabinete: conferir a folga com as gavetas.`)
  }

  const label = isPanel ? `Skin ${cfg.panelSystem.toUpperCase()}` : 'Skin'
  const orientNote = flip
    ? 'Imprimir com a face externa na mesa (pinos/bolsos para cima).'
    : 'Imprimir deitada, face externa para cima.'
  const spacerNote = offset > 0 ? ` Afastada ${offset} mm do esqueleto por espaçadores.` : ''
  const parts: Part[] = [
    makePart({
      id: `SKIN_${upper(face)}`,
      label: `${label} ${face}`,
      group: 'skin',
      assembled: merge(...solids),
      orient: flip ? mat4RotX(Math.PI) : undefined,
      placements: [faceMatrix(fr, offset)],
      color: cfg.color,
      note: [orientNote + spacerNote, ...notes].join(' '),
    }),
  ]

  if (offset > 0 && anchors.points.length > 0) {
    const base = Math.min(SPACER_BASE_MAX, m.bw)
    const top = Math.min(base, Math.max(base * 0.6, M3_CLEARANCE + 2.4))
    const fm = faceMatrix(fr, 0)
    parts.push(
      makePart({
        id: `ESPACADOR_${upper(face)}`,
        label: `Espaçador ${face} (${offset} mm)`,
        group: 'espacador',
        assembled: spacerMesh(base, top, offset, M3_CLEARANCE),
        placements: anchors.points.map(([u, v]) => mat4Mul(fm, mat4Translate(u, v, 0))),
        color: cfg.color,
        note: `Calço cônico ${base.toFixed(1)} mm com furo M3, impresso em pé (base larga na mesa). Um por âncora do esqueleto.`,
      }),
    )
  }
  return parts
}
