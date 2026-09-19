import type { Bay, Layout } from '../core/layout'
import type { Nozzle } from '../core/nozzle'
import { mat4RotX, mat4Translate, merge, translate, type Mat4, type Mesh, type Vec2 } from '../geom/mesh'
import type { Part } from '../model/part'
import { makePart } from '../model/part'
import type { DrawerConfig, Load, ProjectState } from '../model/types'
import { fitClearance } from './metrics'
import { resolveForBay } from '../model/resolve'
import { hashString, prismAxis } from './drawer-prims'
import { frontMeshes, planFront, type FrontPlan } from './drawer-front'
import { labelHolderMesh, labelSpec, type LabelSpec } from './drawer-label'
import {
  chamfers, faceHoles, frameOf, GROOVE_DEPTH, grooveRibs, reinforcement, resolveReinforcement, rims, topAt,
  wallPlates, type DrawerCtx,
} from './drawer-walls'

const MAX_SLOTS = 6
const OV = 0.3

interface Group {
  key: string
  bays: Bay[]
  cfg: DrawerConfig
  load: Load
}

function floorThickness(nz: Nozzle, w: number, cfg: DrawerConfig, load: Load, W: number, D: number): number {
  const lh = nz.layerHeight
  const layers = (mm: number) => lh * Math.ceil(mm / lh - 1e-9)
  const r = cfg.floor.reinforcement
  const heavy = r === 'auto' ? load === 'pesada' && Math.max(W, D) > 70 : r !== 'none'
  return layers(Math.max(0.9, w, heavy ? 1.8 : 0))
}

function floorMesh(c: DrawerCtx, D: number): Mesh {
  const { W, w, wf, Zf, fT } = c
  const f = c.cfg.floor
  const z0 = w / 2, z1 = Zf - wf / 2
  const cs = 3
  const rib = c.reinf === 'ribs' || c.reinf === 'postsBeams' ? 3 : 0
  const frame = Math.max(frameOf(c, f), cs + 1.5 + rib) + Math.max(w, wf) / 2
  const holes: Vec2[][] = faceHoles(c, f, W - w, z1 - z0, false, 0, frame).map((h) =>
    h.map(([x, z]) => [x + w / 2, z + z0] as Vec2))
  void D
  return prismAxis('y', [[w / 2, z0], [W - w / 2, z0], [W - w / 2, z1], [w / 2, z1]], holes, 0, fT)
}

function slotZs(c: DrawerCtx, n: number): number[] {
  const a = c.w, b = c.Zf - c.wf
  return Array.from({ length: n }, (_, i) => a + ((i + 1) * (b - a)) / (n + 1))
}

interface Built {
  plan: FrontPlan
  mesh: Mesh
  pieces: Mesh[]
  ctx: DrawerCtx
  slots: number[]
  dividerT: number
  slotW: number
}

export function buildDrawer(p: ProjectState, nz: Nozzle, dim: Bay['drawer'], cfg: DrawerConfig, load: Load): Built {
  const W = dim.width, H = dim.height, D = dim.depth
  const w = nz.wall(cfg.perimeters)
  const fT = floorThickness(nz, w, cfg, load, W, D)
  const plan = planFront(W, H, w, fT, nz, cfg, D)
  const base = {
    W, H, Zf: D - plan.barOut, w, wf: plan.wf, fT, s: plan.s, Hf: plan.Hf, nz, cfg, load, smallest: p.smallestItem,
  }
  const ctx: DrawerCtx = { ...base, reinf: resolveReinforcement({ ...base }) }
  const dividerT = nz.wall(2)
  const slotW = dividerT + 2 * fitClearance(p)
  const nSlots = Math.min(MAX_SLOTS, Math.max(0, Math.floor(cfg.dividerSlots)))
  const slots = nSlots > 0 && W - 2 * w > 20 ? slotZs(ctx, nSlots) : []
  const gaps = slots.map((z) => [z - slotW / 2 - dividerT - 1, z + slotW / 2 + dividerT + 1] as [number, number])
  const parts: Mesh[] = [floorMesh(ctx, D), ...wallPlates(ctx), ...frontMeshes(ctx, plan), ...reinforcement(ctx)]
  if (cfg.topRim || ctx.reinf === 'postsBeams') parts.push(...rims(ctx, ctx.reinf === 'postsBeams', gaps))
  if (cfg.innerChamfer) parts.push(...chamfers(ctx))
  if (slots.length > 0) parts.push(...grooveRibs(ctx, slots, slotW))
  return { plan, mesh: merge(...parts), pieces: parts, ctx, slots, dividerT, slotW }
}

function dividerMesh(b: Built, chamfer: boolean): Mesh {
  const c = b.ctx
  const dw = c.W - 2 * c.w - 0.6
  const hd = Math.min(...b.slots.map((z) => topAt(c, z + b.slotW))) - c.fT - 1.2
  const k = 2
  const cut = chamfer ? 3 + 0.1 : 0.5
  const poly: Vec2[] = [
    [cut, 0], [dw - cut, 0], [dw, cut], [dw, hd - k], [dw - k, hd], [k, hd], [0, hd - k], [0, cut],
  ]
  return prismAxis('z', poly, [], -b.dividerT / 2, b.dividerT / 2)
}

export function generateDrawerParts(p: ProjectState, layout: Layout, nz: Nozzle): Part[] {
  const groups = new Map<string, Group>()
  for (const bay of layout.bays) {
    const d = bay.drawer
    if (d.width < 20 || d.depth < 24 || d.height < 14) continue
    const cfg = resolveForBay(p, bay.section - 1, bay.row - 1, bay.id)
    const load: Load = p.sections[bay.section - 1]?.rows[bay.row - 1]?.load ?? 'media'
    const key = JSON.stringify([d.width, d.height, d.depth, cfg, load])
    const g = groups.get(key)
    if (g) g.bays.push(bay)
    else groups.set(key, { key, bays: [bay], cfg, load })
  }

  const parts: Part[] = []
  const holders = new Map<string, { spec: LabelSpec; placements: Mat4[] }>()
  const labelCount = new Map<string, number>()
  const origin = (bay: Bay): [number, number, number] => [
    bay.x + (bay.clearWidth - bay.drawer.width) / 2,
    bay.y,
    p.depth - bay.drawer.depth,
  ]
  for (const g of groups.values()) {
    const ref = g.bays[0]!
    const d = ref.drawer
    const built = buildDrawer(p, nz, d, g.cfg, g.load)
    const [ox, oy, oz] = origin(ref)
    const placements: Mat4[] = g.bays.map((b) => {
      const [x, y, z] = origin(b)
      return mat4Translate(x - ox, y - oy, z - oz)
    })
    const hash = hashString(g.key)
    const baseLabel = `Gaveta ${Math.round(d.width)}x${Math.round(d.height)}`
    const n = (labelCount.get(baseLabel) ?? 0) + 1
    labelCount.set(baseLabel, n)
    const c = built.ctx
    const hints = [
      'Imprimir de pé, apoiada no fundo, sem suportes.',
      c.reinf !== 'none' && c.reinf !== 'auto' ? `Reforço das paredes: ${c.reinf}.` : '',
      g.cfg.perimeters < 2 ? 'Com 1 perímetro a parede fica frágil.' : '',
    ].filter(Boolean)
    parts.push(makePart({
      id: `gaveta-${Math.round(d.width)}x${Math.round(d.height)}x${Math.round(d.depth)}-${hash}`,
      label: n > 1 ? `${baseLabel} (${String.fromCharCode(64 + n)})` : baseLabel,
      group: 'gaveta',
      assembled: translate(built.mesh, ox, oy, oz),
      orient: mat4RotX(Math.PI / 2),
      placements,
      note: hints.join(' '),
    }))

    const spec = labelSpec(d.width, c.w, c.fT, built.plan, g.cfg)
    if (spec) {
      const hk = `${spec.lw}x${spec.lh}`
      const entry = holders.get(hk) ?? { spec, placements: [] }
      for (const b of g.bays) {
        const [x, y, z] = origin(b)
        entry.placements.push(mat4Translate(x + (b.drawer.width - spec.outerW) / 2, y + spec.y0, z + c.Zf))
      }
      holders.set(hk, entry)
    }

    if (built.slots.length > 0) {
      const z0 = built.slots[0]!
      const refMesh = translate(dividerMesh(built, g.cfg.innerChamfer), ox + c.w + 0.3, oy + c.fT + 0.2, oz + z0)
      const divPlacements: Mat4[] = []
      for (const b of g.bays) {
        const [x, y, z] = origin(b)
        for (const zi of built.slots) divPlacements.push(mat4Translate(x - ox, y - oy, z - oz + (zi - z0)))
      }
      parts.push(makePart({
        id: `divisoria-${Math.round(d.width)}x${Math.round(d.depth)}-${hash}`,
        label: n > 1 ? `Divisória ${Math.round(d.width)}x${Math.round(d.height)} (${String.fromCharCode(64 + n)})` : `Divisória ${Math.round(d.width)}x${Math.round(d.height)}`,
        group: 'gaveta',
        assembled: refMesh,
        placements: divPlacements,
        note: 'Imprimir deitada. Encaixa nas ranhuras das laterais da gaveta.',
      }))
    }
  }
  for (const [hk, { spec, placements }] of holders) {
    parts.push(makePart({
      id: `porta-etiqueta-${hk}`,
      label: `Porta-etiqueta ${Math.round(spec.lw)}x${Math.round(spec.lh)}`,
      group: 'gaveta',
      assembled: labelHolderMesh(spec, nz),
      placements,
      note: 'Imprimir deitada, sem suportes. Cole na frente da gaveta; a etiqueta de papel desliza por cima.',
    }))
  }
  void OV
  void GROOVE_DEPTH
  return parts
}
