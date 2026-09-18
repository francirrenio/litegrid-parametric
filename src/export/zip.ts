let CRC: Uint32Array | undefined

export function crc32(u8: Uint8Array): number {
  if (!CRC) {
    CRC = new Uint32Array(256)
    for (let i = 0; i < 256; i++) {
      let c = i
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      CRC[i] = c >>> 0
    }
  }
  let c = 0xffffffff
  for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]!) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export interface ZipFile {
  name: string
  data: Uint8Array<ArrayBuffer>
}

/** ZIP without compression (method 0), UTF-8 file names. */
export function zipStore(files: ZipFile[], mime = 'application/zip'): Blob {
  const enc = new TextEncoder()
  const body: Uint8Array<ArrayBuffer>[] = []
  const dir: Uint8Array<ArrayBuffer>[] = []
  let off = 0
  for (const f of files) {
    const name = enc.encode(f.name) as Uint8Array<ArrayBuffer>
    const data = f.data
    const crc = crc32(data)
    const lh = new DataView(new ArrayBuffer(30))
    lh.setUint32(0, 0x04034b50, true)
    lh.setUint16(4, 20, true)
    lh.setUint16(6, 0x0800, true)
    lh.setUint32(14, crc, true)
    lh.setUint32(18, data.length, true)
    lh.setUint32(22, data.length, true)
    lh.setUint16(26, name.length, true)
    body.push(new Uint8Array(lh.buffer), name, data)
    const ch = new DataView(new ArrayBuffer(46))
    ch.setUint32(0, 0x02014b50, true)
    ch.setUint16(4, 20, true)
    ch.setUint16(6, 20, true)
    ch.setUint16(8, 0x0800, true)
    ch.setUint32(16, crc, true)
    ch.setUint32(20, data.length, true)
    ch.setUint32(24, data.length, true)
    ch.setUint16(28, name.length, true)
    ch.setUint32(42, off, true)
    dir.push(new Uint8Array(ch.buffer), name)
    off += 30 + name.length + data.length
  }
  const dirSize = dir.reduce((s, c) => s + c.length, 0)
  const eo = new DataView(new ArrayBuffer(22))
  eo.setUint32(0, 0x06054b50, true)
  eo.setUint16(8, files.length, true)
  eo.setUint16(10, files.length, true)
  eo.setUint32(12, dirSize, true)
  eo.setUint32(16, off, true)
  return new Blob([...body, ...dir, new Uint8Array(eo.buffer)], { type: mime })
}
