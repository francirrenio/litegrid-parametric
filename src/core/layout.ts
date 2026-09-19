import { tr } from '../i18n'
import { deriveNozzle, type NozzleOverrides } from './nozzle'

export type Size = number | 'auto'

export interface Row {
  height: Size
  divisions: number
  /** Expected load per drawer in this row. Does not affect the layout itself. */
  load?: 'leve' | 'media' | 'pesada'
  /** Drawer settings that override the section and global ones for this row (partial DrawerConfig). */
  drawer?: Record<string, unknown>
}

export interface Section {
  width: Size
  rows: Row[]
  /** Drawer settings that override the global ones for this whole section (partial DrawerConfig). */
  drawer?: Record<string, unknown>
}

export interface Clearances {
  lateral: number
  top: number
  back: number
}

export const DEFAULT_CLEARANCES: Clearances = { lateral: 0.3, top: 0.6, back: 1.5 }

export interface LayoutInput {
  nozzle: number
  width: number
  height: number
  depth: number
  sections: Section[]
  /** Perimeters of the structural plates between drawers (must match the skeleton). Default 3. */
  structuralPerimeters?: number
  advanced?: NozzleOverrides & { clearances?: Partial<Clearances> }
}

export type WarningCode =
  | 'overflow'
  | 'leftover'
  | 'bay-too-narrow'
  | 'bay-too-short'
  | 'invalid-input'
  | 'generator-error'
  | 'design'

export interface Warning {
  code: WarningCode
  message: string
  where?: string
}

export interface Bay {
  id: string
  section: number
  row: number
  col: number
  x: number
  y: number
  clearWidth: number
  clearHeight: number
  clearDepth: number
  drawer: { width: number; height: number; depth: number }
}

export interface Layout {
  wallStructural: number
  bays: Bay[]
  warnings: Warning[]
}

const MIN_BAY_WIDTH = 14
const MIN_BAY_HEIGHT = 16
const EPS = 1e-6

interface Resolved {
  sizes: number[]
  leftover: number
}

function resolveSizes(specs: Size[], available: number): Resolved {
  const fixed = specs.reduce<number>((s, v) => s + (v === 'auto' ? 0 : v), 0)
  const autos = specs.filter((v) => v === 'auto').length
  const remaining = available - fixed
  if (autos === 0) return { sizes: specs as number[], leftover: remaining }
  const each = Math.max(0, remaining) / autos
  return { sizes: specs.map((v) => (v === 'auto' ? each : v)), leftover: remaining < 0 ? remaining : 0 }
}

function checkAvailable(
  res: Resolved,
  where: string,
  unit: string,
  warnings: Warning[],
  unitEn: string,
  whereEn: string,
): void {
  const unitT = tr(unit, unitEn)
  const whereT = tr(where, whereEn)
  if (res.leftover < -EPS) {
    warnings.push({
      code: 'overflow',
      where,
      message: tr(`${where}: as ${unit} fixas passam do espaço em ${(-res.leftover).toFixed(1)} mm.`, `${whereT}: the fixed ${unitT} exceed the available space by ${(-res.leftover).toFixed(1)} mm.`),
    })
  } else if (res.leftover > EPS) {
    warnings.push({
      code: 'leftover',
      where,
      message: tr(`${where}: sobram ${res.leftover.toFixed(1)} mm sem ${unit} definidas.`, `${whereT}: ${res.leftover.toFixed(1)} mm left without defined ${unitT}.`),
    })
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function computeLayout(input: LayoutInput): Layout {
  const warnings: Warning[] = []
  const nz = deriveNozzle(input.nozzle, input.advanced)
  const t = nz.wall(input.structuralPerimeters ?? 3)
  const cl: Clearances = { ...DEFAULT_CLEARANCES, ...input.advanced?.clearances }
  const bays: Bay[] = []

  const nSections = input.sections.length
  if (nSections === 0 || !(input.width > 0 && input.height > 0 && input.depth > 0)) {
    warnings.push({ code: 'invalid-input', message: tr('Informe largura, altura, profundidade e ao menos uma seção.', 'Enter width, height, depth and at least one section.') })
    return { wallStructural: t, bays, warnings }
  }

  const innerW = input.width - 2 * t - (nSections - 1) * t
  const secs = resolveSizes(input.sections.map((s) => s.width), innerW)
  checkAvailable(secs, 'Seções', 'larguras', warnings, 'widths', 'Sections')

  const clearDepth = input.depth - t
  let x = t
  input.sections.forEach((section, si) => {
    const secW = secs.sizes[si] ?? 0
    const nRows = section.rows.length
    const innerH = input.height - 2 * t - Math.max(0, nRows - 1) * t
    const rows = resolveSizes(section.rows.map((r) => r.height), innerH)
    checkAvailable(rows, `Seção ${si + 1}`, 'alturas', warnings, 'heights', `Section ${si + 1}`)

    let yTop = input.height - t
    section.rows.forEach((row, ri) => {
      const rowH = rows.sizes[ri] ?? 0
      const div = Math.max(1, Math.round(row.divisions))
      const cellW = (secW - (div - 1) * t) / div
      const y = yTop - rowH
      for (let ci = 0; ci < div; ci++) {
        const id = `BAY_S${si + 1}_R${ri + 1}_C${ci + 1}`
        const bx = x + ci * (cellW + t)
        if (cellW < MIN_BAY_WIDTH) {
          warnings.push({ code: 'bay-too-narrow', where: id, message: tr(`${id}: largura útil de ${cellW.toFixed(1)} mm (mínimo ${MIN_BAY_WIDTH}).`, `${id}: usable width of ${cellW.toFixed(1)} mm (minimum ${MIN_BAY_WIDTH}).`) })
        }
        if (rowH < MIN_BAY_HEIGHT) {
          warnings.push({ code: 'bay-too-short', where: id, message: tr(`${id}: altura útil de ${rowH.toFixed(1)} mm (mínimo ${MIN_BAY_HEIGHT}).`, `${id}: usable height of ${rowH.toFixed(1)} mm (minimum ${MIN_BAY_HEIGHT}).`) })
        }
        bays.push({
          id,
          section: si + 1,
          row: ri + 1,
          col: ci + 1,
          x: round2(bx),
          y: round2(y),
          clearWidth: round2(cellW),
          clearHeight: round2(rowH),
          clearDepth: round2(clearDepth),
          drawer: {
            width: round2(cellW - 2 * cl.lateral),
            height: round2(rowH - cl.top),
            depth: round2(clearDepth - cl.back),
          },
        })
      }
      yTop = y - t
    })
    x += secW + t
  })

  return { wallStructural: round2(t), bays, warnings }
}
