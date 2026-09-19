import type { Layout } from '../core/layout'
import type { Nozzle } from '../core/nozzle'
import {
  cylinder, extrude, extrudeWithHoleProfile, mat4Mul, mat4RotX, mat4RotZ, mat4Translate, mirrorX, merge, rectPoly,
  regularPolygon, slotPoly, transform, type Mat4, type Mesh, type Vec2,
} from '../geom/mesh'
import { makePart, type Part } from '../model/part'
import type { ProjectState } from '../model/types'
import { faceAnchors } from './anchors'
import { faceFrame, faceMatrix, type FaceFrame } from './faces'
import { skeletonMetrics, type SkeletonMetrics } from './metrics'
import { tr } from '../i18n'

export const SKADIS_CLIP_PROFILE: Vec2[] = [
  [0.95, 0], [2.45, 0], [2.45, 3.7], [3.05, 4.3], [3.05, 5.9], [2.45, 6.5], [0.95, 6.5],
]
export const SKADIS_CLIP_LENGTH = 12
export const SKADIS_CLIP_PITCH = 40
const PEG_LEN = 3
const PIN_HALF = 3
const RING = 24
/** Abutting solids overlap by this much so no edge loop is shared (keeps meshes watertight). */
const WELD = 0.02

/** Solid of revolution about Z: rings of [z, radius], ascending z, closed by fan caps. */
export function lathe(rings: Array<[number, number]>, seg = 20): Mesh {
  const out: number[] = []
  const ring = ([z, r]: [number, number]) => regularPolygon(0, 0, r, seg).map(([x, y]) => [x, y, z] as [number, number, number])
  const rs = rings.map(ring)
  for (let k = 0; k + 1 < rs.length; k++) {
    const a = rs[k]!, b = rs[k + 1]!
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg
      out.push(...a[i]!, ...a[j]!, ...b[j]!, ...a[i]!, ...b[j]!, ...b[i]!)
    }
  }
  const first = rs[0]!, last = rs[rs.length - 1]!
  const z0 = rings[0]![0], z1 = rings[rings.length - 1]![0]
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg
    out.push(0, 0, z0, ...first[j]!, ...first[i]!)
    out.push(0, 0, z1, ...last[i]!, ...last[j]!)
  }
  return out
}

/** 24-point hexagon with the given across-flats width; `rotDeg` 0 = vertices left/right. */
export function hexRing(cx: number, cy: number, af: number, rotDeg = 0): Vec2[] {
  const pts: Vec2[] = []
  for (let i = 0; i < RING; i++) {
    const th = (i * 360) / RING
    const phi = ((((th - rotDeg) % 60) + 60) % 60) - 30
    const r = af / 2 / Math.cos((phi * Math.PI) / 180)
    const a = (th * Math.PI) / 180
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return pts
}

const circle = (cx: number, cy: number, r: number, n = RING) => regularPolygon(cx, cy, r, n)

/** Keyhole outline: big circle at (cx, cy) with a slot of width `w` running down `len` mm. Fixed vertex count. */
export function keyholePoly(cx: number, cy: number, big: number, w: number, len: number): Vec2[] {
  const h = w / 2
  const yj = Math.sqrt(big * big - h * h)
  const a0 = Math.atan2(-yj, h)
  const a1 = Math.atan2(-yj, -h) + 2 * Math.PI
  const pts: Vec2[] = []
  const nArc = 20, nEnd = 8
  for (let i = 0; i <= nArc; i++) {
    const a = a0 + ((a1 - a0) * i) / nArc
    pts.push([cx + big * Math.cos(a), cy + big * Math.sin(a)])
  }
  for (let i = 0; i <= nEnd; i++) {
    const a = Math.PI + (Math.PI * i) / nEnd
    pts.push([cx + h * Math.cos(a), cy - len + h * Math.sin(a)])
  }
  return pts
}

/** Puts a Y-Z profile (as x, y pairs) along X: (px, py, pz) -> (pz, px, py). */
const ALONG_X: Mat4 = [0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1]
/** Puts an X-Z profile (as x, y pairs) along Y: (px, py, pz) -> (px, pz, py). */
const ALONG_Y: Mat4 = [1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1]

interface Ctx {
  p: ProjectState
  layout: Layout
  nz: Nozzle
  m: SkeletonMetrics
  pegR: number
  holeD: number
  c: number
  fixing: ProjectState['fixing']
}

const fixPart = (o: {
  id: string; label: string; assembled: Mesh; placements: Mat4[]; note: string; orient?: Mat4; step?: number
}): Part =>
  makePart({
    id: o.id, label: o.label, group: 'fixacao', assembled: o.assembled, orient: o.orient,
    placements: o.placements, note: o.note, assemblyStep: o.step,
  })

const placeAt = (fr: FaceFrame, u: number, v: number, rot = 0): Mat4 =>
  mat4Mul(faceMatrix(fr, 0), mat4Mul(mat4Translate(u, v, 0), mat4RotZ(rot)))

function nearest(pts: Vec2[], u: number, v: number): Vec2 | undefined {
  let best: Vec2 | undefined
  let d = Infinity
  for (const q of pts) {
    const e = Math.hypot(q[0] - u, q[1] - v)
    if (e < d) { d = e; best = q }
  }
  return best
}

function corners(pts: Vec2[], w: number, h: number): Vec2[] {
  const out: Vec2[] = []
  for (const [u, v] of [[0, 0], [w, 0], [w, h], [0, h]] as const) {
    const q = nearest(pts, u, v)
    if (q && !out.includes(q)) out.push(q)
  }
  return out
}

/** Up to `n` items spread evenly along a list. */
function spread<T>(xs: T[], n: number): T[] {
  if (xs.length <= n) return xs
  const out: T[] = []
  for (let k = 0; k < n; k++) out.push(xs[Math.round((k * (xs.length - 1)) / (n - 1))]!)
  return [...new Set(out)]
}

/** Interior anchors on the seam-side bar of the back face: right seam (u = c) and top seam (v = H - c). */
function seamSpots(ctx: Ctx, fr: FaceFrame, pts: Vec2[]): Array<{ u: number; v: number; rot: number }> {
  const { c } = ctx
  const eps = 0.6
  const bar = (sel: (q: Vec2) => boolean, key: (q: Vec2) => number, len: number) => {
    const all = pts.filter(sel).sort((a, b) => key(a) - key(b))
    const inner = all.filter((q) => key(q) > ctx.m.bw && key(q) < len - ctx.m.bw)
    return spread(inner.length > 0 ? inner : all, 3)
  }
  const right = bar((q) => Math.abs(q[0] - c) < eps, (q) => q[1], fr.height).map((q) => ({ u: 0, v: q[1], rot: 0 }))
  const top = bar((q) => Math.abs(q[1] - (fr.height - c)) < eps, (q) => q[0], fr.width).map((q) => ({ u: q[0], v: fr.height, rot: Math.PI / 2 }))
  return [...right, ...top]
}

export function generateFixingParts(p: ProjectState, layout: Layout, nz: Nozzle): Part[] {
  const fx = p.fixing
  if (!fx) return []
  const m = skeletonMetrics(p, nz)
  const ctx: Ctx = { p, layout, nz, m, pegR: (m.holeD - 2 * m.fit) / 2, holeD: m.holeD, c: m.bw / 2, fixing: fx }
  const parts: Part[] = []
  const back = faceFrame('back', p.width, p.height, p.depth)
  const backA = faceAnchors(p, layout, nz, 'back')
  const spots = seamSpots(ctx, back, backA.points)
  const seamPlacements = spots.map((s) => placeAt(back, s.u, s.v, s.rot))
  const push = (x: Part | undefined) => { if (x) parts.push(x) }

  if (fx.between.pins) push(pins(ctx))
  if (fx.between.butterfly && seamPlacements.length > 0) push(butterfly(ctx, seamPlacements))
  if (fx.between.screw !== 'none' && seamPlacements.length > 0) push(screwConnector(ctx, fx.between.screw, seamPlacements))
  if (fx.between.magnet && seamPlacements.length > 0) push(magnetConnector(ctx, seamPlacements))
  if (fx.wall.mode === 'screws' || fx.wall.mode === 'keyhole') push(wallBracket(ctx, back, backA.points, fx.wall.mode))
  if (fx.wall.mode === 'cleat') parts.push(...cleats(ctx, back, backA.points))
  if (fx.hangOnSkadis) push(skadisClips(ctx, back, backA.points))
  return parts
}

function pins(ctx: Ctx): Part | undefined {
  const { p, layout, nz, pegR } = ctx
  const placements: Mat4[] = []
  for (const face of ['right', 'top'] as const) {
    const fr = faceFrame(face, p.width, p.height, p.depth)
    const a = faceAnchors(p, layout, nz, face)
    for (const [u, v] of corners(a.points, fr.width, fr.height)) placements.push(placeAt(fr, u, v))
  }
  if (placements.length === 0) return undefined
  const ch = Math.min(0.6, pegR * 0.4)
  const mesh = lathe([[-PIN_HALF, pegR - ch], [-PIN_HALF + ch, pegR], [PIN_HALF - ch, pegR], [PIN_HALF, pegR - ch]])
  return fixPart({
    id: 'FIX_PINO', label: tr('Pino de alinhamento', 'Alignment pin'), assembled: mesh, placements,
    note: tr(`Pino de ${(2 * pegR).toFixed(1)} x ${2 * PIN_HALF} mm com pontas chanfradas, impresso em pé. 4 por emenda (lado direito e topo), nos furos de ancoragem dos dois gabinetes.`, `${(2 * pegR).toFixed(1)} x ${2 * PIN_HALF} mm pin with chamfered ends, printed standing. 4 per joint (right side and top), in the anchor holes of both cabinets.`),
  })
}

function butterflyOutline(len: number, lobe: number, neck: number): Vec2[] {
  return [[-len / 2, -lobe / 2], [0, -neck / 2], [len / 2, -lobe / 2], [len / 2, lobe / 2], [0, neck / 2], [-len / 2, lobe / 2]]
}

function butterfly(ctx: Ctx, placements: Mat4[]): Part {
  const { m, pegR, c } = ctx
  const tb = 2
  const lobe = 10
  const len = 2 * c + lobe
  const solids = [
    extrude(butterflyOutline(len, lobe, 4.5), [], 0, tb),
    cylinder(-c, 0, pegR, -PEG_LEN, 0),
    cylinder(c, 0, pegR, -PEG_LEN, 0),
  ]
  return fixPart({
    id: 'FIX_BORBOLETA', label: tr('Chave borboleta', 'Butterfly key'), assembled: merge(...solids), placements,
    orient: mat4RotX(Math.PI),
    note: tr(`Chave borboleta plana (${len.toFixed(1)} x ${lobe} x ${tb} mm) com dois pinos de ${(2 * pegR).toFixed(1)} mm (folga ${m.fit} mm) que entram nos furos das duas emendas. Imprime com os pinos para cima, sem suporte.`, `Flat butterfly key (${len.toFixed(1)} x ${lobe} x ${tb} mm) with two ${(2 * pegR).toFixed(1)} mm pins (clearance ${m.fit} mm) that go into the holes of the two joints. Prints with the pins facing up, without support.`),
  })
}

function screwConnector(ctx: Ctx, size: 'M3' | 'M4', placements: Mat4[]): Part {
  const { c, holeD } = ctx
  const d = size === 'M3' ? 3 : 4
  const af = (size === 'M3' ? 5.5 : 7) + 0.3
  const nutH = (size === 'M3' ? 2.4 : 3.2) + 0.4
  const floor = 1.6
  const T = nutH + floor
  const hole = d + 0.4
  const xs = [-c, c]
  const circ = xs.map((x) => circle(x, 0, hole / 2))
  const hex = xs.map((x) => hexRing(x, 0, af, 30))
  const len = 2 * c + af + 6
  const wid = af + 6
  const mesh = extrudeWithHoleProfile(slotPoly(0, 0, len, wid, 8), [
    { z: 0, holes: circ }, { z: floor, holes: circ }, { z: floor, holes: hex }, { z: T, holes: hex },
  ])
  const warn = hole > holeD ? tr(` O furo do esqueleto tem ${holeD} mm: alargar para ${hole.toFixed(1)} mm para ${size}.`, ` The skeleton hole is ${holeD} mm: widen it to ${hole.toFixed(1)} mm for ${size}.`) : ''
  return fixPart({
    id: `FIX_CONECTOR_${size}`, label: `${tr('Conector com parafuso', 'Screw connector')} ${size}`, assembled: mesh, placements,
    note: tr(`Placa ${len.toFixed(0)} x ${wid.toFixed(0)} x ${T.toFixed(1)} mm com dois furos ${size} e alojamento hexagonal aberto no topo para a porca. Imprime deitada, alojamento para cima, sem suporte.${warn}`, `${len.toFixed(0)} x ${wid.toFixed(0)} x ${T.toFixed(1)} mm plate with two ${size} holes and a hexagonal nut pocket open at the top. Prints lying flat, pocket facing up, without support.${warn}`),
  })
}

function magnetConnector(ctx: Ctx, placements: Mat4[]): Part {
  const { c } = ctx
  const dia = 6.2, depth = 2.2, floor = 0.8, T = depth + floor
  const xs = [-c, c]
  const len = 2 * c + dia + 3.2
  const wid = dia + 3.2
  const outline = slotPoly(0, 0, len, wid, 8)
  const mesh = merge(
    extrude(outline, [], 0, floor),
    extrude(outline, xs.map((x) => circle(x, 0, dia / 2)), floor - WELD, T),
  )
  return fixPart({
    id: 'FIX_CONECTOR_IMA', label: tr('Conector com ímã 6x2', 'Magnet connector 6x2'), assembled: mesh, placements,
    note: tr(`Placa ${len.toFixed(0)} x ${wid.toFixed(1)} x ${T.toFixed(1)} mm com dois bolsos de ${dia} mm para ímãs 6x2, abertos no topo. Imprime deitada sem suporte; colar na emenda com ímãs de polaridades opostas.`, `${len.toFixed(0)} x ${wid.toFixed(1)} x ${T.toFixed(1)} mm plate with two ${dia} mm pockets for 6x2 magnets, open at the top. Prints lying flat without support; glue it to the joint with magnets of opposite polarity.`),
  })
}

function topEdgePairs(pts: Vec2[], fr: FaceFrame, c: number): Array<[Vec2, Vec2]> {
  const row = pts.filter((q) => Math.abs(q[1] - (fr.height - c)) < 0.6).sort((a, b) => a[0] - b[0])
  if (row.length < 2) return []
  const pairs: Array<[Vec2, Vec2]> = [[row[0]!, row[1]!]]
  if (row.length >= 4) pairs.push([row[row.length - 2]!, row[row.length - 1]!])
  return pairs
}

/** Countersunk hole levels; the cone opens at z = 0, or at z = T when `atTop`. */
function countersinkLevels(cx: number, cy: number, shank: number, head: number, T: number, atTop = false) {
  const cs = (head - shank) / 2
  const big = circle(cx, cy, head / 2, 20), small = circle(cx, cy, shank / 2, 20)
  return atTop
    ? [{ z: 0, holes: [small] }, { z: T - cs, holes: [small] }, { z: T, holes: [big] }]
    : [{ z: 0, holes: [big] }, { z: cs, holes: [small] }, { z: T, holes: [small] }]
}

function wallBracket(ctx: Ctx, fr: FaceFrame, pts: Vec2[], mode: 'screws' | 'keyhole'): Part | undefined {
  const { c, pegR, fixing } = ctx
  const pairs = topEdgePairs(pts, fr, c)
  if (pairs.length === 0) return undefined
  const d = fixing.wall.screwDiameter
  const s = Math.abs(pairs[0]![1][0] - pairs[0]![0][0])
  const placements = pairs.map(([a, b]) => placeAt(fr, (a[0] + b[0]) / 2, fr.height - c))
  const pegs = [-s / 2, s / 2].map((x) => cylinder(x, 0, pegR, -PEG_LEN, 0))
  const shank = d + 0.5
  const head = 1.9 * d
  const xLen = s + 16
  let mesh: Mesh
  let T: number
  let note: string
  if (mode === 'screws') {
    const wb = Math.max(16, head + 8)
    const yc = c - wb / 2
    const cs = (head - shank) / 2
    T = Math.max(4, cs + 2)
    const xs = s / 2 > head + 4 ? [-s / 4, s / 4] : [0]
    const levels = xs.map((x) => countersinkLevels(x, yc, shank, head, T))
    mesh = extrudeWithHoleProfile(slotPoly(0, yc, xLen, wb, 8), levels[0]!.map((_, k) => ({ z: levels[0]![k]!.z, holes: levels.map((l) => l[k]!.holes[0]!) })))
    note = tr(`Placa de parede ${xLen.toFixed(0)} x ${wb.toFixed(0)} x ${T.toFixed(1)} mm com ${xs.length} furo(s) escareado(s) para parafuso de ${d} mm. Fixe na parede (a capacidade depende de parafuso e bucha) e encaixe o gabinete nos pinos. Imprime com o lado do gabinete para cima.`, `Wall plate ${xLen.toFixed(0)} x ${wb.toFixed(0)} x ${T.toFixed(1)} mm with ${xs.length} countersunk hole(s) for a ${d} mm screw. Fix it to the wall (capacity depends on the screw and anchor) and fit the cabinet onto the pegs. Prints with the cabinet side facing up.`)
  } else {
    const hd = Math.max(2, 0.6 * d)
    const ramp = 3
    T = hd + ramp + 1.2
    const bigS = head / 2 + 0.5
    const wS = shank + 0.2
    const bigR = bigS + 2.5
    const wR = head + 1
    const slotLen = 12
    const kc = c - 2 - bigR
    const bottom = kc - slotLen - wR / 2 - 2
    const xs = s / 2 >= 2 * bigR + 2 ? [-s / 4, s / 4] : [0]
    const sPolys = xs.map((x) => keyholePoly(x, kc, bigS, wS, slotLen))
    const rPolys = xs.map((x) => keyholePoly(x, kc, bigR, wR, slotLen))
    const wb = c - bottom
    mesh = extrudeWithHoleProfile(rectPoly(-xLen / 2, bottom, xLen / 2, c), [
      { z: 0, holes: sPolys }, { z: T - hd - ramp, holes: sPolys }, { z: T - hd, holes: rPolys }, { z: T, holes: rPolys },
    ])
    note = tr(`Placa de chave (fechadura) ${xLen.toFixed(0)} x ${wb.toFixed(0)} x ${T.toFixed(1)} mm com ${xs.length} rasgo(s) para parafuso de ${d} mm; o rebaixo da cabeça fica na face da parede, com rampa de 50 graus para imprimir sem suporte. Parafuso da parede com a cabeça saliente ${hd.toFixed(1)} mm. Imprime com o lado do gabinete para cima.`, `Keyhole plate ${xLen.toFixed(0)} x ${wb.toFixed(0)} x ${T.toFixed(1)} mm with ${xs.length} slot(s) for a ${d} mm screw; the head recess is on the wall face, with a 50 degree ramp to print without support. Wall screw with the head protruding ${hd.toFixed(1)} mm. Prints with the cabinet side facing up.`)
  }
  mesh = merge(mesh, ...pegs)
  return fixPart({
    id: mode === 'screws' ? 'FIX_PLACA_PAREDE' : 'FIX_PLACA_CHAVE',
    label: mode === 'screws' ? tr('Placa de parede (parafusos)', 'Wall plate (screws)') : tr('Placa de parede (fechadura)', 'Wall plate (keyhole)'),
    assembled: mesh, placements, orient: mat4RotX(Math.PI), note,
  })
}

function cleats(ctx: Ctx, fr: FaceFrame, pts: Vec2[]): Part[] {
  const { p, c, holeD, fixing } = ctx
  const t = 8, w = 30
  const L = Math.min(p.width, Math.max(p.printBed.x, p.printBed.y) - 10)
  const u0 = (p.width - L) / 2
  const v0 = p.height - w
  const d = fixing.wall.screwDiameter
  const shank = d + 0.5, head = 2 * d
  const wedge = (tri: Vec2[]) => transform(extrude(tri, [], 0, L), ALONG_X)
  const sink = (x: number, y: number, dia: number, hd: number) => countersinkLevels(x, y, dia, hd, t, true)
  const levelsFor = (list: Vec2[], dia: number, hd: number) => {
    const ls = list.map(([x, y]) => sink(x, y, dia, hd))
    return ls.length === 0
      ? [{ z: 0, holes: [] as Vec2[][] }, { z: t, holes: [] as Vec2[][] }]
      : ls[0]!.map((_, k) => ({ z: ls[0]![k]!.z, holes: ls.map((l) => l[k]!.holes[0]!) }))
  }

  const wallHoles: Vec2[] = []
  const nWall = Math.max(2, Math.floor(L / 60) + 1)
  for (let i = 0; i < nWall; i++) wallHoles.push([15 + ((L - 30) * i) / (nWall - 1), (w - t) / 2])
  const wallBlock = extrudeWithHoleProfile(rectPoly(0, 0, L, w - t), levelsFor(wallHoles, shank, head))
  const wallMesh = merge(wallBlock, wedge([[w - t - WELD, 0], [w, 0], [w - t - WELD, t - WELD]]))

  const cabHoles: Vec2[] = pts
    .filter((q) => Math.abs(q[1] - (p.height - c)) < 0.6 && q[0] > u0 + 3 && q[0] < u0 + L - 3)
    .map((q) => [q[0] - u0, q[1] - v0] as Vec2)
  const cabBlock = extrudeWithHoleProfile(rectPoly(0, t, L, w), levelsFor(cabHoles, holeD + 0.2, holeD + 0.2 + 2 * 1.5))
  const cabMesh = merge(cabBlock, wedge([[0, 0], [t + WELD, 0], [t + WELD, t - WELD]]))

  const yb = v0 + 2 * t - w
  return [
    fixPart({
      id: 'FIX_CLEAT_PAREDE', label: tr('Ripa francesa (parede)', 'French cleat (wall)'), assembled: wallMesh,
      placements: [mat4Mul(faceMatrix(fr, 0), mat4Mul(mat4Translate(u0 + L, yb, 2 * t), [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1]))],
      note: tr(`Tira de ${L.toFixed(0)} x ${w} x ${t} mm com chanfro de 45 graus, ${nWall} furos escareados para parafuso de ${d} mm. Imprime deitada (lado da parede na mesa), sem suporte. A capacidade depende de parafuso e bucha.`, `Strip ${L.toFixed(0)} x ${w} x ${t} mm with a 45 degree chamfer, ${nWall} countersunk holes for a ${d} mm screw. Prints lying flat (wall side on the bed), without support. Capacity depends on the screw and anchor.`),
    }),
    fixPart({
      id: 'FIX_CLEAT_GABINETE', label: tr('Ripa francesa (gabinete)', 'French cleat (cabinet)'), assembled: cabMesh,
      placements: [mat4Mul(faceMatrix(fr, 0), mat4Translate(u0, v0, 0))],
      note: tr(`Tira espelhada de ${L.toFixed(0)} x ${w} x ${t} mm com chanfro de 45 graus e ${cabHoles.length} furos escareados sobre os furos de ancoragem do fundo (parafuso M3 no esqueleto). Imprime deitada, sem suporte. Encaixa por cima da ripa da parede.`, `Mirrored strip ${L.toFixed(0)} x ${w} x ${t} mm with a 45 degree chamfer and ${cabHoles.length} countersunk holes over the back anchor holes (M3 screw into the skeleton). Prints lying flat, without support. Hooks over the wall cleat.`),
    }),
  ]
}

function skadisClips(ctx: Ctx, fr: FaceFrame, pts: Vec2[]): Part | undefined {
  const { c } = ctx
  const pairs = topEdgePairs(pts, fr, c)
  if (pairs.length === 0) return undefined
  const mids = pairs.map(([a, b]) => (a[0] + b[0]) / 2)
  const centres = [mids[0]!]
  if (mids.length > 1) {
    const k = Math.floor((mids[1]! - mids[0]!) / SKADIS_CLIP_PITCH)
    if (k >= 1) centres.push(mids[0]! + k * SKADIS_CLIP_PITCH)
  }
  const half = SKADIS_CLIP_PITCH / 2
  const tp = 3
  const yBlade = -14
  const slotW = 10, slotH = 3.4
  const cs = 1.3
  const xs = [-half, half]
  const nominal = xs.map((x) => slotPoly(x, 0, slotW, slotH, 8))
  const wide = xs.map((x) => slotPoly(x, 0, slotW + 2 * cs, slotH + 2 * cs, 8))
  const plate = extrudeWithHoleProfile(
    rectPoly(-half - 8, yBlade - 8, half + 8, c),
    [{ z: 0, holes: nominal }, { z: tp - cs, holes: nominal }, { z: tp, holes: wide }],
  )
  const blade = transform(extrude(SKADIS_CLIP_PROFILE, [], -SKADIS_CLIP_LENGTH / 2, SKADIS_CLIP_LENGTH / 2), ALONG_Y)
  const blades: Mesh[] = []
  for (const cx of xs) {
    const b = transform(blade, mat4Translate(cx, yBlade, tp))
    blades.push(b, transform(mirrorX(blade), mat4Translate(cx, yBlade, tp)))
  }
  const placements = centres.map((u) => placeAt(fr, u, fr.height - c))
  return fixPart({
    id: 'FIX_GANCHO_SKADIS', label: tr('Ganchos para pendurar no Skadis', 'Hooks for hanging on Skadis'), assembled: merge(plate, ...blades), placements,
    note: tr(`Barra com dois clipes (4 garras espelhadas de 1,5 mm com dente de 0,6 mm, ${SKADIS_CLIP_LENGTH} mm de comprimento) a ${SKADIS_CLIP_PITCH} mm, alinhados à grade do Skadis. Parafusos M3 escareados em rasgos sobre os furos de ancoragem do fundo (conferir o alinhamento). Imprime deitada, garras para cima; dentes a 45 graus, sem suporte.`, `Bar with two clips (4 mirrored 1.5 mm claws with a 0.6 mm tooth, ${SKADIS_CLIP_LENGTH} mm long) ${SKADIS_CLIP_PITCH} mm apart, aligned to the Skadis grid. Countersunk M3 screws in slots over the back anchor holes (check the alignment). Prints lying flat, claws facing up; teeth at 45 degrees, without support.`),
  })
}
