import { deriveNozzle } from './nozzle'
import { computeLayout, type Bay, type LayoutInput } from './layout'

export interface LayoutManifest {
  project: string
  global_parameters: {
    nozzle_diameter_mm: number
    extrusion_width_mm: number
    layer_height_mm: number
  }
  cabinet_metadata: {
    total_width_mm: number
    total_height_mm: number
    total_depth_mm: number
    structural_wall_mm: number
  }
  bays: Array<{
    bay_id: string
    section: number
    row: number
    col: number
    x_mm: number
    y_mm: number
    clear_width_mm: number
    clear_height_mm: number
    clear_depth_mm: number
    recommended_drawer: { width_mm: number; height_mm: number; depth_mm: number }
  }>
}

const round2 = (n: number) => Math.round(n * 100) / 100

function bayEntry(b: Bay): LayoutManifest['bays'][number] {
  return {
    bay_id: b.id,
    section: b.section,
    row: b.row,
    col: b.col,
    x_mm: b.x,
    y_mm: b.y,
    clear_width_mm: b.clearWidth,
    clear_height_mm: b.clearHeight,
    clear_depth_mm: b.clearDepth,
    recommended_drawer: {
      width_mm: b.drawer.width,
      height_mm: b.drawer.height,
      depth_mm: b.drawer.depth,
    },
  }
}

export function buildManifest(project: string, input: LayoutInput): LayoutManifest {
  const nz = deriveNozzle(input.nozzle, input.advanced)
  const layout = computeLayout(input)
  return {
    project,
    global_parameters: {
      nozzle_diameter_mm: nz.nozzle,
      extrusion_width_mm: round2(nz.lineWidth),
      layer_height_mm: round2(nz.layerHeight),
    },
    cabinet_metadata: {
      total_width_mm: input.width,
      total_height_mm: input.height,
      total_depth_mm: input.depth,
      structural_wall_mm: layout.wallStructural,
    },
    bays: layout.bays.map(bayEntry),
  }
}
