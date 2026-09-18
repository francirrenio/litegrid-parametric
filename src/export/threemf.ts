import type { NamedMesh } from './stl'
import { zipStore } from './zip'

const ESC: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }
const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ESC[c]!)

/** 3MF with one object per mesh (positions already applied), millimetres. */
export function threeMfBlob(items: NamedMesh[], app = 'LiteGrid Parametric'): Blob {
  const objs: string[] = []
  const build: string[] = []
  const r = (x: number) => +x.toFixed(4)
  items.forEach((it, idx) => {
    const map = new Map<string, number>()
    const verts: string[] = []
    const tri: number[] = []
    const v = it.mesh
    for (let i = 0; i < v.length; i += 3) {
      const key = `${r(v[i]!)},${r(v[i + 1]!)},${r(v[i + 2]!)}`
      let id = map.get(key)
      if (id === undefined) {
        id = verts.length
        map.set(key, id)
        verts.push(`<vertex x="${r(v[i]!)}" y="${r(v[i + 1]!)}" z="${r(v[i + 2]!)}"/>`)
      }
      tri.push(id)
    }
    const tris: string[] = []
    for (let i = 0; i < tri.length; i += 3) {
      if (tri[i] === tri[i + 1] || tri[i + 1] === tri[i + 2] || tri[i] === tri[i + 2]) continue
      tris.push(`<triangle v1="${tri[i]}" v2="${tri[i + 1]}" v3="${tri[i + 2]}"/>`)
    }
    objs.push(
      `<object id="${idx + 1}" type="model" name="${esc(it.name)}"><mesh><vertices>${verts.join('')}</vertices><triangles>${tris.join('')}</triangles></mesh></object>`,
    )
    build.push(`<item objectid="${idx + 1}"/>`)
  })
  const model = `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="pt-BR" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Application">${esc(app)}</metadata><resources>${objs.join('')}</resources><build>${build.join('')}</build></model>`
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
