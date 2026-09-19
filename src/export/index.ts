import { deriveNozzle } from '../core/nozzle'
import type { GenerateResult, Part } from '../model/part'
import type { ProjectState } from '../model/types'
import { planPlates, plateMeshes, type Plate, type PlateOverrides } from './plates'
import { stlBlob, stlBytes } from './stl'
import { threeMfBlob, threeMfGroups } from './threemf'
import { zipStore, type ZipFile } from './zip'
import { tr } from '../i18n'

export { planPlates, plateMeshes, plateKey } from './plates'
export type { Plate, PlateItem, PlateOverride, PlateOverrides } from './plates'
export { stlBlob } from './stl'
export { threeMfBlob } from './threemf'

const GROUP_DIR: Record<Part['group'], string> = {
  gabinete: 'gabinete',
  gaveta: 'gavetas',
  skin: 'skins',
  espacador: 'espacadores',
  fixacao: 'fixacoes',
  teste: 'teste',
}

export const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'peca'

/** One part, print orientation, centred on the bed origin. */
export function partStl(part: Part): Blob {
  return stlBlob([{ name: part.label, mesh: part.mesh }])
}

export function plateStl(plate: Plate, parts: Part[]): Blob {
  return stlBlob(plateMeshes(plate, parts))
}

export function plate3mf(plate: Plate, parts: Part[]): Blob {
  return threeMfBlob(plateMeshes(plate, parts))
}

/** Every bed in one 3MF: one object per bed holding its parts, beds side by side along X with a gap. */
export function allPlates3mf(plates: Plate[], parts: Part[], bedX: number): Blob {
  const step = bedX + 30
  return threeMfGroups(
    plates.map((pl, i) => ({ name: `${tr('Mesa', 'Bed')} ${pl.index}`, items: plateMeshes(pl, parts), offset: [i * step, 0] as [number, number] })),
  )
}

export function manifestJson(result: GenerateResult): string {
  return JSON.stringify(result.manifest, null, 2)
}

export function projectJson(project: ProjectState): string {
  return JSON.stringify(project, null, 2)
}

/** Recommended slicer settings (plain text, readable in any slicer). */
export function slicerProfileText(project: ProjectState, parts: Part[]): string {
  const nz = deriveNozzle(project.nozzle, project.advanced)
  const topBottom = Math.max(3, Math.ceil(1.0 / nz.layerHeight))
  const groups = new Map<string, string>()
  const perim = (g: Part['group']): string => {
    switch (g) {
      case 'gabinete': return String(project.skeleton.perimeters)
      case 'gaveta': return String(project.drawerDefaults.perimeters)
      case 'skin': return '3 a 4'
      default: return '3'
    }
  }
  for (const p of parts) groups.set(p.group, perim(p.group))
  const lines = [
    tr(`Perfil recomendado - ${project.name}`, `Recommended profile - ${project.name}`),
    '',
    tr(`Bico: ${nz.nozzle} mm | largura de linha: ${nz.lineWidth.toFixed(2)} mm | altura de camada: ${nz.layerHeight.toFixed(2)} mm`, `Nozzle: ${nz.nozzle} mm | line width: ${nz.lineWidth.toFixed(2)} mm | layer height: ${nz.layerHeight.toFixed(2)} mm`),
    tr('Preenchimento (infill): 0 %  (a rigidez vem da geometria e dos perímetros)', 'Infill: 0 %  (stiffness comes from the geometry and the perimeters)'),
    tr(`Camadas sólidas de topo e base: ${topBottom}`, `Solid top and bottom layers: ${topBottom}`),
    tr('Suportes: desligados (nenhuma peça precisa)', 'Supports: off (no part needs them)'),
    tr('Posição da costura: traseira ou alinhada, de preferência em cantos internos', 'Seam position: rear or aligned, preferably in inner corners'),
    tr('Gerador de paredes: Arachne, se disponível (paredes finas de largura variável)', 'Wall generator: Arachne, if available (thin walls of variable width)'),
    tr('Aba de aderência (brim): desligada, salvo peças altas e finas', 'Brim: off, except for tall, thin parts'),
    '',
    tr('Perímetros por grupo de peças:', 'Perimeters per part group:'),
    ...[...groups].map(([g, n]) => `  ${g}: ${n}`),
    '',
    tr('Paredes de 1 perímetro só onde a peça descreve nervuras internas; não force preenchimento.', '1-perimeter walls only where the part describes internal ribs; do not force infill.'),
  ]
  return lines.join('\n')
}

/** Assembly guide in Markdown. */
export function assemblyGuide(result: GenerateResult, project: ProjectState): string {
  const rows = result.parts
    .slice()
    .sort((a, b) => (a.assemblyStep ?? 99) - (b.assemblyStep ?? 99) || a.group.localeCompare(b.group) || a.label.localeCompare(b.label))
  const fmt = (n: number) => n.toFixed(1)
  const out = [
    tr(`# Guia de montagem - ${project.name}`, `# Assembly guide - ${project.name}`),
    '',
    tr(`Gabinete ${fmt(project.width)} x ${fmt(project.height)} x ${fmt(project.depth)} mm (largura x altura x profundidade), esqueleto sem paredes externas.`, `Cabinet ${fmt(project.width)} x ${fmt(project.height)} x ${fmt(project.depth)} mm (width x height x depth), skeleton without outer walls.`),
    '',
    tr('## Lista de peças', '## Parts list'),
    '',
    tr('| Passo | Peça | Grupo | Qtd | Tamanho na mesa (mm) | Observação |', '| Step | Part | Group | Qty | Size on the bed (mm) | Note |'),
    '|---|---|---|---|---|---|',
    ...rows.map(
      (p) =>
        `| ${p.assemblyStep ?? '-'} | ${p.label} | ${p.group} | ${p.instances.length} | ${p.size.map(fmt).join(' x ')} | ${p.note ?? ''} |`,
    ),
    '',
    tr('## Ordem sugerida', '## Suggested order'),
    '',
    tr('1. Imprima todas as peças do grupo "gabinete" e confira o encaixe de uma aba em uma ranhura antes de imprimir o resto.', '1. Print all the parts of the "gabinete" group and check how a tab fits into a slot before printing the rest.'),
    tr('2. Monte as costas e a base, encaixe os quadros verticais e depois as prateleiras e o topo. As abas ficam rentes à face externa; use uma gota de cola nas juntas se quiser.', '2. Assemble the back and the base, fit the vertical frames, then the shelves and the top. The tabs sit flush with the outer face; use a drop of glue on the joints if you like.'),
    tr('3. Encaixe as gavetas. Skins, espaçadores e fixações entram por último e podem ser impressos depois.', '3. Fit the drawers. Skins, spacers and fixings go in last and can be printed afterwards.'),
    '',
  ]
  if (result.warnings.length) {
    out.push(tr('## Avisos', '## Warnings'), '', ...result.warnings.map((w) => `- ${w.message}`), '')
  }
  return out.join('\n')
}

/** Everything in one ZIP: STL per part, 3MF per bed, manifest, project, slicer profile, assembly guide. */
export function projectZip(result: GenerateResult, project: ProjectState, overrides?: PlateOverrides): Blob {
  const enc = new TextEncoder()
  const files: ZipFile[] = []
  const text = (name: string, s: string) => files.push({ name, data: enc.encode(s) })
  for (const p of result.parts) {
    files.push({
      name: `pecas/${GROUP_DIR[p.group]}/${slug(p.id)}_x${p.instances.length}.stl`,
      data: stlBytes([{ name: p.label, mesh: p.mesh }]),
    })
  }
  const plates = planPlates(result.parts, project.printBed, overrides)
  for (const pl of plates) {
    files.push({ name: `mesas/mesa-${pl.index}.stl`, data: stlBytes(plateMeshes(pl, result.parts)) })
  }
  text('layout_manifest.json', manifestJson(result))
  text('projeto.json', projectJson(project))
  text('perfil-fatiador.txt', slicerProfileText(project, result.parts))
  text('guia-montagem.md', assemblyGuide(result, project))
  return zipStore(files)
}

export { zipStore }
