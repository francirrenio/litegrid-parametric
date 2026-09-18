import type { Mesh } from '../geom/mesh'

export interface NamedMesh {
  name: string
  mesh: Mesh
}

/** Binary STL for one or more meshes (already positioned). */
export function stlBytes(items: NamedMesh[], header = 'LiteGrid Parametric'): Uint8Array<ArrayBuffer> {
  let n = 0
  for (const it of items) n += it.mesh.length / 9
  const buf = new ArrayBuffer(84 + n * 50)
  const dv = new DataView(buf)
  new Uint8Array(buf, 0, 80).set(new TextEncoder().encode(header.slice(0, 79)))
  dv.setUint32(80, n, true)
  let o = 84
  for (const it of items) {
    const v = it.mesh
    for (let i = 0; i < v.length; i += 9) {
      const ux = v[i + 3]! - v[i]!, uy = v[i + 4]! - v[i + 1]!, uz = v[i + 5]! - v[i + 2]!
      const wx = v[i + 6]! - v[i]!, wy = v[i + 7]! - v[i + 1]!, wz = v[i + 8]! - v[i + 2]!
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx
      const len = Math.hypot(nx, ny, nz) || 1
      dv.setFloat32(o, nx / len, true)
      dv.setFloat32(o + 4, ny / len, true)
      dv.setFloat32(o + 8, nz / len, true)
      for (let k = 0; k < 9; k++) dv.setFloat32(o + 12 + k * 4, v[i + k]!, true)
      dv.setUint16(o + 48, 0, true)
      o += 50
    }
  }
  return new Uint8Array(buf)
}

export const stlBlob = (items: NamedMesh[]) => new Blob([stlBytes(items)], { type: 'model/stl' })
