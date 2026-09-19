import type { Layout } from '../core/layout'
import type { Nozzle } from '../core/nozzle'
import { cylinder, mat4RotX, mat4Translate, type Mat4, type Mesh } from '../geom/mesh'
import type { Part } from '../model/part'
import { makePart } from '../model/part'
import { GLOBAL_SCOPE, resolveAt } from '../model/resolve'
import type { ProjectState } from '../model/types'
import { buildDrawer } from './drawer'
import { labelHolderMesh, labelSpec } from './drawer-label'
import { fitClearance, skeletonMetrics } from './metrics'
import { circle, diff, rect, shapeMesh, union, type Shape } from './plate2d'
import { knobFor, seamPostWidth, splitAt } from './split'

const TAB_LEN = 12
const PLATE_W = 70
const PLATE_H = 44
const SPLIT_W = 80
const GAP = 10
const PEG_H = 8
const CHECK = 'Encaixa sem folga excessiva? Se ficar solto, reduza a folga em Avançado; se emperrar, aumente.'

const TAB_X = [16, 40]
const HOLE_AT: [number, number] = [58, 30]
const SLOT_Y = 14

export interface TestFit {
  t: number
  fit: number
  holeD: number
  tabW: number
  slotW: number
  slotT: number
  pegD: number
}

export function testFit(p: ProjectState, nz: Nozzle): TestFit {
  const { t, holeD } = skeletonMetrics(p, nz)
  const fit = fitClearance(p)
  return { t, fit, holeD, tabW: TAB_LEN, slotW: TAB_LEN + 2 * fit, slotT: t + 2 * fit, pegD: holeD - 2 * fit }
}

/** Plate A: two slots sized tab + clearance on each side, plus a peg hole. */
export function slotPlateShape(f: TestFit): Shape {
  const slots = TAB_X.map((x) => rect(x - f.slotW / 2, SLOT_Y - f.slotT / 2, x + f.slotW / 2, SLOT_Y + f.slotT / 2))
  return diff(rect(0, 0, PLATE_W, PLATE_H), ...slots, circle(HOLE_AT[0], HOLE_AT[1], f.holeD / 2, 24))
}

/** Plate B: same size with two tabs (width TAB_LEN, protruding one plate thickness) on the top edge. */
export function tabPlateShape(f: TestFit): Shape {
  const tabs = TAB_X.map((x) => rect(x - f.tabW / 2, PLATE_H - 0.01, x + f.tabW / 2, PLATE_H + f.t))
  return union(rect(0, 0, PLATE_W, PLATE_H), ...tabs)
}

export function generateTestParts(p: ProjectState, layout: Layout, nz: Nozzle): Part[] {
  void layout
  const f = testFit(p, nz)
  const z0 = p.depth + 30
  const parts: Part[] = []
  let x = 0
  const at = (dx = 0, dy = 0, dz = 0): Mat4 => mat4Translate(x + dx, dy, z0 + dz)
  const group = 'teste' as const
  const flat = (id: string, label: string, mesh: Mesh, width: number, note: string) => {
    parts.push(makePart({ id, label, group, assembled: mesh, placements: [at()], note }))
    x += width + GAP
  }

  const cfg = resolveAt(p, GLOBAL_SCOPE)
  const dim = { width: 64, height: 45, depth: 56 }
  const built = buildDrawer(p, nz, dim, cfg, 'media')
  parts.push(makePart({
    id: 'teste-gaveta',
    label: 'Gaveta de teste',
    group,
    assembled: built.mesh,
    orient: mat4RotX(Math.PI / 2),
    placements: [at()],
    note: `Mini gaveta ${dim.width}x${dim.height}x${dim.depth} com as configurações da gaveta padrão. Imprimir de pé, sem suportes. Confira a qualidade das paredes, do fundo e da frente. ${CHECK}`,
  }))
  const c = built.ctx
  const spec = labelSpec(dim.width, c.w, c.fT, built.plan, cfg)
  if (spec) {
    parts.push(makePart({
      id: 'teste-porta-etiqueta',
      label: 'Porta-etiqueta de teste',
      group,
      assembled: labelHolderMesh(spec, nz),
      placements: [at((dim.width - spec.outerW) / 2, spec.y0, c.Zf)],
      note: 'Imprimir deitado. Cole na frente da gaveta de teste e deslize a etiqueta de papel: ela deve entrar com leve pressão.',
    }))
  }
  x += dim.width + GAP

  flat('teste-placa-ranhuras', 'Encaixe de teste: placa com ranhuras', shapeMesh(slotPlateShape(f), f.t), PLATE_W,
    `Placa com 2 ranhuras (${f.slotW.toFixed(2)} mm) e um furo de ${f.holeD.toFixed(1)} mm. As abas da placa com abas devem entrar com leve pressão, e o pino de teste deve caber no furo. ${CHECK}`)
  flat('teste-placa-abas', 'Encaixe de teste: placa com abas', shapeMesh(tabPlateShape(f), f.t), PLATE_W,
    `Placa com 2 abas de ${TAB_LEN} mm. Encaixe-as nas ranhuras da outra placa: devem deslizar com leve pressão, sem folga excessiva. ${CHECK}`)

  const postW = seamPostWidth(skeletonMetrics(p, nz).bw)
  const [left, right] = splitAt(rect(0, 0, SPLIT_W, PLATE_H), { xs: [SPLIT_W / 2], ys: [] }, f.fit, postW)
  const knob = knobFor(postW)
  const splitNote = `Emenda em cauda de andorinha igual à dos painéis do gabinete (nó de ${(knob.head * 2).toFixed(0)} mm). As duas metades devem deslizar uma na outra com leve pressão. ${CHECK}`
  if (left && right) {
    flat('teste-emenda-a', 'Emenda de teste: metade A', shapeMesh(left, f.t), SPLIT_W / 2 + knob.len, splitNote)
    flat('teste-emenda-b', 'Emenda de teste: metade B', shapeMesh(right, f.t), SPLIT_W / 2, splitNote)
  }

  parts.push(makePart({
    id: 'teste-pino',
    label: 'Pino de teste',
    group,
    assembled: cylinder(0, 0, f.pegD / 2, 0, PEG_H, 24),
    placements: [at()],
    note: `Pino de ${f.pegD.toFixed(2)} mm de diâmetro. Deve entrar no furo da placa com ranhuras com leve pressão. ${CHECK}`,
  }))
  return parts
}
