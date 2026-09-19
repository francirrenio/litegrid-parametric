import type { Layout } from '../core/layout'
import type { Nozzle } from '../core/nozzle'
import { IDENTITY, merge, transform, bbox, type Mat4, type Mesh } from '../geom/mesh'
import { makePart, type Part } from '../model/part'
import type { ProjectState } from '../model/types'
import { shapeMesh } from './plate2d'
import { buildSkeleton, type SkeletonPlate } from './skeleton'
import { tr } from '../i18n'

const GROUP_COLOR = '#7f93aa'

function shapeKey(pl: SkeletonPlate): string {
  return `${pl.kind}|${pl.thickness.toFixed(3)}|${JSON.stringify(pl.shape, (_k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v))}`
}

const fmt = (n: number) => String(Math.round(n))

function skeletonParts(p: ProjectState, layout: Layout, nz: Nozzle): Part[] {
  const geo = buildSkeleton(p, layout, nz, true)
  const groups = new Map<string, SkeletonPlate[]>()
  for (const pl of geo.plates) {
    const k = shapeKey(pl)
    const list = groups.get(k) ?? []
    list.push(pl)
    groups.set(k, list)
  }
  const parts: Part[] = []
  const counts = new Map<string, number>()
  for (const list of groups.values()) {
    const first = list[0]!
    const mesh = shapeMesh(first.shape, first.thickness)
    if (mesh.length === 0) continue
    const size = bbox(mesh).size
    const n = (counts.get(first.kind) ?? 0) + 1
    counts.set(first.kind, n)
    parts.push(
      makePart({
        id: `${first.kind}-${n}`,
        label: `${first.label} ${fmt(size[0])}x${fmt(size[1])}`,
        group: 'gabinete',
        assembled: mesh,
        orient: IDENTITY,
        placements: list.map((pl) => pl.matrix),
        color: GROUP_COLOR,
        assemblyStep: first.step,
        note: tr('Imprima deitada na mesa; as abas entram nas ranhuras das peças vizinhas.', 'Print lying flat on the bed; the tabs fit into the slots of the neighbouring parts.'),
      }),
    )
  }
  return parts.sort((a, b) => (a.assemblyStep ?? 9) - (b.assemblyStep ?? 9) || a.label.localeCompare(b.label))
}

/** One printable body: plates only abut each other (no tabs or slots), printed standing on its back. */
function monolithicParts(p: ProjectState, layout: Layout, nz: Nozzle): Part[] {
  const geo = buildSkeleton(p, layout, nz, false)
  const meshes: Mesh[] = geo.plates.map((pl) => transform(shapeMesh(pl.shape, pl.thickness), pl.matrix as Mat4))
  return [
    makePart({
      id: 'gabinete-monolitico',
      label: tr('Gabinete', 'Cabinet') + ` ${fmt(p.width)}x${fmt(p.height)}x${fmt(p.depth)}`,
      group: 'gabinete',
      assembled: merge(...meshes),
      orient: IDENTITY,
      color: GROUP_COLOR,
      assemblyStep: 1,
      note: tr('Peça única, impressa em pé apoiada nas costas. Confira o volume útil da sua mesa.', 'Single piece, printed standing on its back. Check the build volume of your printer.'),
    }),
  ]
}

export function generateCabinetParts(p: ProjectState, layout: Layout, nz: Nozzle): Part[] {
  return p.cabinetMode === 'monolithic' ? monolithicParts(p, layout, nz) : skeletonParts(p, layout, nz)
}
