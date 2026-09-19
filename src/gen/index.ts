import { computeLayout, type Layout, type Warning } from '../core/layout'
import { buildManifest } from '../core/manifest'
import { deriveNozzle, type Nozzle } from '../core/nozzle'
import type { GenerateResult, Part } from '../model/part'
import type { ProjectState } from '../model/types'
import { generateCabinetParts } from './cabinet'
import { generateDrawerParts } from './drawer'
import { generateFixingParts } from './fixings'
import { generateSkinParts } from './skins'
import { buildSuggestions } from './suggestions'

type PartGenerator = (p: ProjectState, layout: Layout, nz: Nozzle) => Part[]

export function layoutInput(p: ProjectState) {
  return {
    nozzle: p.nozzle,
    width: p.width,
    height: p.height,
    depth: p.depth,
    sections: p.sections,
    structuralPerimeters: p.skeleton.perimeters,
    advanced: p.advanced,
  }
}

/** Runs every generator; a failing generator becomes a warning instead of breaking the whole result. */
export function generate(p: ProjectState): GenerateResult {
  const nz = deriveNozzle(p.nozzle, p.advanced)
  const layout = computeLayout(layoutInput(p))
  const warnings: Warning[] = [...layout.warnings]
  const parts: Part[] = []
  const generators: Array<[string, PartGenerator]> = [
    ['gabinete', generateCabinetParts],
    ['gavetas', generateDrawerParts],
    ['skins', generateSkinParts],
    ['fixações', generateFixingParts],
  ]
  if (layout.bays.length > 0) {
    for (const [name, gen] of generators) {
      try {
        parts.push(...gen(p, layout, nz))
      } catch (e) {
        warnings.push({ code: 'generator-error', where: name, message: `Falha ao gerar ${name}: ${(e as Error).message}` })
      }
    }
  }
  for (const part of parts) {
    const [w, d] = part.size
    const fits = (w <= p.printBed.x && d <= p.printBed.y) || (d <= p.printBed.x && w <= p.printBed.y)
    if (!fits) {
      warnings.push({
        code: 'design',
        where: part.id,
        message: `${part.label}: ${w.toFixed(0)} x ${d.toFixed(0)} mm não cabe na mesa de ${p.printBed.x} x ${p.printBed.y} mm.`,
      })
    }
  }
  let suggestions: GenerateResult['suggestions'] = []
  try {
    suggestions = buildSuggestions(p, layout, nz)
  } catch (e) {
    warnings.push({ code: 'generator-error', where: 'sugestões', message: `Falha nas sugestões: ${(e as Error).message}` })
  }
  return { layout, parts, warnings, suggestions, manifest: buildManifest(p.name, layoutInput(p)) }
}
