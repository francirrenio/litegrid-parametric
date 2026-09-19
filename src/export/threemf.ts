import type { NamedMesh } from './stl'
import { zipStore } from './zip'

const ESC: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }
export const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ESC[c]!)
export const r = (x: number) => +x.toFixed(4)

export function meshObject(id: number, name: string, v: number[]): string {
  const map = new Map<string, number>()
  const verts: string[] = []
  const tri: number[] = []
  for (let i = 0; i < v.length; i += 3) {
    const key = `${r(v[i]!)},${r(v[i + 1]!)},${r(v[i + 2]!)}`
    let vi = map.get(key)
    if (vi === undefined) {
      vi = verts.length
      map.set(key, vi)
      verts.push(`<vertex x="${r(v[i]!)}" y="${r(v[i + 1]!)}" z="${r(v[i + 2]!)}"/>`)
    }
    tri.push(vi)
  }
  const tris: string[] = []
  for (let i = 0; i < tri.length; i += 3) {
    if (tri[i] === tri[i + 1] || tri[i + 1] === tri[i + 2] || tri[i] === tri[i + 2]) continue
    tris.push(`<triangle v1="${tri[i]}" v2="${tri[i + 1]}" v3="${tri[i + 2]}"/>`)
  }
  return `<object id="${id}" type="model" name="${esc(name)}"><mesh><vertices>${verts.join('')}</vertices><triangles>${tris.join('')}</triangles></mesh></object>`
}

function pack(resources: string[], build: string[], app: string): Blob {
  const model = `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="pt-BR" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Application">${esc(app)}</metadata><resources>${resources.join('')}</resources><build>${build.join('')}</build></model>`
  const ct = `<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`
  const rels = `<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`
  const enc = new TextEncoder()
  return zipStore(
    [
      { name: '[Content_Types].xml', data: enc.encode(ct) },
      { name: '_rels/.rels', data: enc.encode(rels) },
      { name: '3D/3dmodel.model', data: enc.encode(model) },
    ],
    'model/3mf',
  )
}

/** 3MF with one object per mesh (positions already applied), millimetres. */
export function threeMfBlob(items: NamedMesh[], app = 'LiteGrid Parametric'): Blob {
  const objs = items.map((it, idx) => meshObject(idx + 1, it.name, it.mesh))
  const build = items.map((_, idx) => `<item objectid="${idx + 1}"/>`)
  return pack(objs, build, app)
}

export interface MeshGroup {
  name: string
  items: NamedMesh[]
  /** Where the group's origin sits in the build area (mm). */
  offset: [number, number]
}

/** 3MF where each group (a print bed) is one object made of components (its parts), placed by a build transform. */
export function threeMfGroups(groups: MeshGroup[], app = 'LiteGrid Parametric'): Blob {
  const objs: string[] = []
  const build: string[] = []
  let id = 1
  for (const g of groups) {
    const childIds: number[] = []
    for (const it of g.items) {
      objs.push(meshObject(id, it.name, it.mesh))
      childIds.push(id++)
    }
    const comps = childIds.map((c) => `<component objectid="${c}"/>`).join('')
    objs.push(`<object id="${id}" type="model" name="${esc(g.name)}"><components>${comps}</components></object>`)
    build.push(`<item objectid="${id}" transform="1 0 0 0 1 0 0 0 1 ${r(g.offset[0])} ${r(g.offset[1])} 0"/>`)
    id++
  }
  return pack(objs, build, app)
}
