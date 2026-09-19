import { plateMeshes, type Plate } from './plates'
import { esc, meshObject, r } from './threemf'
import { zipStore } from './zip'
import type { Part } from '../model/part'

/** Orca and Bambu place plate k on a grid: columns = ceil(sqrt(n)), stride = bed size * 1.2, rows going toward -Y. */
export function orcaPlateOrigin(index: number, count: number, bedX: number, bedY: number): [number, number] {
  const cols = Math.ceil(Math.sqrt(Math.max(1, count)))
  return [(index % cols) * bedX * 1.2, -Math.floor(index / cols) * bedY * 1.2]
}

/**
 * 3MF in the layout OrcaSlicer/Bambu Studio write themselves: every part is an object (a component wrapping its mesh),
 * placed inside its plate's area, and Metadata/model_settings.config assigns each object to plate 1, 2, 3...
 */
export function orca3mf(plates: Plate[], parts: Part[], bedX: number, bedY: number, name = 'LiteGrid'): Blob {
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
    ],
    'model/3mf',
  )
}
