import { describe, expect, it } from 'vitest'
import { generate } from '../gen'
import { defaultProject } from '../model/defaults'
import { box } from '../geom/mesh'
import { makePart } from '../model/part'
import { assemblyGuide, manifestJson, planPlates, plateMeshes, projectZip, slicerProfileText, slug } from './index'
import { stlBytes } from './stl'
import { threeMfBlob } from './threemf'
import { crc32 } from './zip'

describe('stl', () => {
  it('writes a binary STL with the right size and triangle count', () => {
    const m = box(0, 0, 0, 1, 2, 3)
    const bytes = stlBytes([{ name: 'a', mesh: m }])
    expect(bytes.length).toBe(84 + 12 * 50)
    expect(new DataView(bytes.buffer).getUint32(80, true)).toBe(12)
  })
})

describe('zip and 3mf', () => {
  it('crc32 matches the known check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it('3mf is a zip containing the model part', async () => {
    const blob = threeMfBlob([{ name: 'cubo', mesh: box(0, 0, 0, 1, 1, 1) }])
    const text = new TextDecoder('latin1').decode(await blob.arrayBuffer())
    expect(text.startsWith('PK')).toBe(true)
    expect(text).toContain('3D/3dmodel.model')
    expect(text).toContain('<vertex')
  })
})

describe('plates', () => {
  const mk = (id: string, w: number, d: number, copies = 1) =>
    makePart({
      id, label: id, group: 'gabinete', assembled: box(0, 0, 0, w, d, 2),
      placements: Array.from({ length: copies }, (_, i) => [1, 0, 0, i, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
    })

  it('packs many small parts on one bed and spills to a second', () => {
    const parts = [mk('a', 100, 100, 4), mk('b', 100, 100, 4)]
    const plates = planPlates(parts, { x: 220, y: 220 })
    expect(plates.length).toBeGreaterThanOrEqual(2)
    expect(plates.flatMap((p) => p.items)).toHaveLength(8)
    for (const pl of plates) for (const it of pl.items) {
      expect(Math.abs(it.x) + it.width / 2).toBeLessThanOrEqual(110.001)
      expect(Math.abs(it.y) + it.depth / 2).toBeLessThanOrEqual(110.001)
    }
  })

  it('centres the group of parts on every bed', () => {
    const one = planPlates([mk('a', 80, 50)], { x: 220, y: 220 })
    expect(one[0]!.items[0]!.x).toBeCloseTo(0, 6)
    expect(one[0]!.items[0]!.y).toBeCloseTo(0, 6)
    const many = planPlates([mk('b', 100, 60, 3), mk('c', 40, 40, 2)], { x: 220, y: 220 })
    for (const pl of many) {
      const xs = pl.items.flatMap((i) => [i.x - i.width / 2, i.x + i.width / 2])
      const ys = pl.items.flatMap((i) => [i.y - i.depth / 2, i.y + i.depth / 2])
      expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0, 6)
      expect(Math.min(...ys) + Math.max(...ys)).toBeCloseTo(0, 6)
    }
  })

  it('rotates a long part to fit and flags the oversize ones', () => {
    const plates = planPlates([mk('long', 230, 100), mk('huge', 400, 400)], { x: 220, y: 240 })
    const long = plates.flatMap((p) => p.items).find((i) => i.partId === 'long')!
    expect(long.rotated).toBe(true)
    expect(plates.some((p) => p.oversize)).toBe(true)
    expect(plateMeshes(plates[0]!, [mk('long', 230, 100), mk('huge', 400, 400)]).length).toBeGreaterThan(0)
  })
})

describe('project bundle', () => {
  it('builds a zip plus text artefacts for the default project', async () => {
    const p = defaultProject()
    const r = generate(p)
    expect(r.parts.length).toBeGreaterThan(0)
    const zip = projectZip(r, p)
    const text = new TextDecoder('latin1').decode(await zip.arrayBuffer())
    for (const name of ['layout_manifest.json', 'projeto.json', 'perfil-fatiador.txt', 'guia-montagem.md', 'pecas/gabinete/']) {
      expect(text).toContain(name)
    }
    expect(JSON.parse(manifestJson(r)).bays.length).toBe(r.layout.bays.length)
    expect(slicerProfileText(p, r.parts)).toContain('Preenchimento (infill): 0 %')
    expect(assemblyGuide(r, p)).toContain('Lista de peças')
    expect(slug('Quadro lateral 120x180')).toBe('quadro-lateral-120x180')
  })
})
