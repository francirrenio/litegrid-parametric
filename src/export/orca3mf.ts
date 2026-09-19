import { plateMeshes, type Plate } from './plates'
import { esc, meshObject, r } from './threemf'
import { zipStore } from './zip'
import { deriveNozzle } from '../core/nozzle'
import type { Part } from '../model/part'
import type { ProjectState } from '../model/types'

/** Orca and Bambu place plate k on a grid: columns = ceil(sqrt(n)), stride = bed size * 1.2, rows going toward -Y. */
export function orcaPlateOrigin(index: number, count: number, bedX: number, bedY: number): [number, number] {
  const cols = Math.ceil(Math.sqrt(Math.max(1, count)))
  return [(index % cols) * bedX * 1.2, -Math.floor(index / cols) * bedY * 1.2]
}

/**
 * 3MF in the layout OrcaSlicer/Bambu Studio write themselves: every part is an object (a component wrapping its mesh),
 * placed inside its plate's area, and Metadata/model_settings.config assigns each object to plate 1, 2, 3...
 */
/** Orca only loads the plates of a project that carries settings, so the file brings a small LiteGrid profile (bed, nozzle, layer, walls, no infill, no supports). */
function projectSettings(project: ProjectState): string {
  const nz = deriveNozzle(project.nozzle, project.advanced)
  const w = project.printBed.x
  const d = project.printBed.y
  const lw = nz.lineWidth.toFixed(2)
  const perimeters = Math.max(project.skeleton.perimeters, project.drawerDefaults.perimeters)
  return JSON.stringify(
    {
      name: 'project_settings',
      from: 'project',
      print_settings_id: 'LiteGrid',
      printer_settings_id: 'LiteGrid printer',
      filament_settings_id: ['LiteGrid filament'],
      printable_area: ['0x0', w + 'x0', w + 'x' + d, '0x' + d],
      printable_height: '300',
      nozzle_diameter: [String(nz.nozzle)],
      filament_colour: ['#2DD4BF'],
      filament_type: [project.material],
      layer_height: nz.layerHeight.toFixed(2),
      initial_layer_print_height: nz.layerHeight.toFixed(2),
      line_width: lw,
      outer_wall_line_width: lw,
      inner_wall_line_width: lw,
      wall_loops: String(perimeters),
      sparse_infill_density: '0%',
      enable_support: '0',
      brim_type: 'no_brim',
    },
    null,
    2,
  )
}

export function orca3mf(plates: Plate[], parts: Part[], project: ProjectState): Blob {
  const bedX = project.printBed.x
  const bedY = project.printBed.y
  const name = project.name
  const resources: string[] = []
  const build: string[] = []
  const objectCfg: string[] = []
  const plateCfg: string[] = []
  let id = 1
  plates.forEach((pl, pi) => {
    const [ox, oy] = orcaPlateOrigin(pi, plates.length, bedX, bedY)
    const inst: string[] = []
    for (const m of plateMeshes(pl, parts)) {
      const meshId = id++
      const objId = id++
      resources.push(meshObject(meshId, m.name, m.mesh))
      resources.push(`<object id="${objId}" type="model"><components><component objectid="${meshId}"/></components></object>`)
      // Plate-local coordinates have the bed centre at 0,0; Orca's plate starts at its corner.
      build.push(`<item objectid="${objId}" transform="1 0 0 0 1 0 0 0 1 ${r(ox + bedX / 2)} ${r(oy + bedY / 2)} 0" printable="1"/>`)
      objectCfg.push(
        `  <object id="${objId}">\n    <metadata key="name" value="${esc(m.name)}"/>\n    <metadata key="extruder" value="1"/>\n    <part id="${meshId}" subtype="normal_part">\n      <metadata key="name" value="${esc(m.name)}"/>\n      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>\n    </part>\n  </object>`,
      )
      inst.push(
        `    <model_instance>\n      <metadata key="object_id" value="${objId}"/>\n      <metadata key="instance_id" value="0"/>\n      <metadata key="identify_id" value="${objId + 1000}"/>\n    </model_instance>`,
      )
    }
    plateCfg.push(
      `  <plate>\n    <metadata key="plater_id" value="${pi + 1}"/>\n    <metadata key="plater_name" value=""/>\n    <metadata key="locked" value="false"/>\n${inst.join('\n')}\n  </plate>`,
    )
  })
  const model = `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Application">OrcaSlicer-2.2.0</metadata><metadata name="BambuStudio:3mfVersion">1</metadata><metadata name="Title">${esc(name)}</metadata><resources>${resources.join('')}</resources><build>${build.join('')}</build></model>`
  const config = `<?xml version="1.0" encoding="UTF-8"?>\n<config>\n${objectCfg.join('\n')}\n${plateCfg.join('\n')}\n</config>\n`
  const ct = `<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`
  const rels = `<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`
  const enc = new TextEncoder()
  return zipStore(
    [
      { name: '[Content_Types].xml', data: enc.encode(ct) },
      { name: '_rels/.rels', data: enc.encode(rels) },
      { name: '3D/3dmodel.model', data: enc.encode(model) },
      { name: 'Metadata/model_settings.config', data: enc.encode(config) },
      { name: 'Metadata/project_settings.config', data: enc.encode(projectSettings(project)) },
    ],
    'model/3mf',
  )
}
