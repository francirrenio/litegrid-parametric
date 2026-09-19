import { describe, expect, it, vi } from 'vitest'
vi.setConfig({ testTimeout: 120000 })
import { computeLayout } from '../core/layout'
import { deriveNozzle } from '../core/nozzle'
import { bbox, isWatertight, mat4Apply, mat4InvertRigid, signedVolume, transform } from '../geom/mesh'
import { defaultProject } from '../model/defaults'
import type { ProjectState } from '../model/types'
import { generateCabinetParts } from './cabinet'
import { layoutInput } from './index'
import { skeletonMetrics } from './metrics'
import { buildSkeleton } from './skeleton'

function setup(over: Partial<ProjectState> = {}) {
  const p = defaultProject(over)
  const nz = deriveNozzle(p.nozzle, p.advanced)
  const layout = computeLayout(layoutInput(p))
  return { p, nz, layout }
}

describe('skeleton', () => {
  it('produces watertight, bed-flat parts that assemble inside the envelope', () => {
    const { p, nz, layout } = setup()
    const parts = generateCabinetParts(p, layout, nz)
    expect(parts.length).toBeGreaterThan(3)
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
    for (const part of parts) {
      expect(isWatertight(part.mesh), part.label).toBe(true)
      expect(signedVolume(part.mesh), part.label).toBeGreaterThan(0)
      expect(bbox(part.mesh).lo[2]).toBeCloseTo(0, 5)
      for (const m of part.instances) {
        const b = bbox(transform(part.mesh, m))
        lo = lo.map((v, k) => Math.min(v, b.lo[k]!))
        hi = hi.map((v, k) => Math.max(v, b.hi[k]!))
      }
    }
    for (let k = 0; k < 3; k++) expect(lo[k]!).toBeGreaterThan(-0.01)
    expect(hi[0]!).toBeLessThan(p.width + 0.01)
    expect(hi[1]!).toBeLessThan(p.height + 0.01)
    expect(hi[2]!).toBeLessThan(p.depth + 0.01)
  })

  it('has one back, base, top, one frame per divider line and shelves per section', () => {
    const { p, nz, layout } = setup({
      printBed: { x: 500, y: 500 },
      sections: [
        { width: 'auto', rows: [{ height: 'auto', divisions: 2 }, { height: 'auto', divisions: 1 }] },
        { width: 'auto', rows: [{ height: 'auto', divisions: 1 }] },
      ],
    })
    const geo = buildSkeleton(p, layout, nz)
    expect(geo.plates.filter((x) => x.kind === 'costas')).toHaveLength(1)
    expect(geo.plates.filter((x) => x.kind === 'quadro')).toHaveLength(3)
    expect(geo.plates.filter((x) => x.kind === 'prateleira')).toHaveLength(1)
  })

  it('stays watertight for every bracing mode', () => {
    for (const bracing of ['auto', 'none', 'corners', 'diagonal', 'back'] as const) {
      const { p, nz, layout } = setup({ skeleton: { perimeters: 3, barWidth: 'auto', bracing } })
      for (const part of generateCabinetParts(p, layout, nz)) expect(isWatertight(part.mesh), `${bracing} ${part.label}`).toBe(true)
    }
  })

  it('material level changes shelf openness (reforcado is heavier than minimo)', () => {
    const vol = (level: 'minimo' | 'reforcado') => {
      const { p, nz, layout } = setup({ materialLevel: level })
      return generateCabinetParts(p, layout, nz).reduce((s, part) => s + signedVolume(part.mesh) * part.instances.length, 0)
    }
    expect(vol('reforcado')).toBeGreaterThan(vol('minimo'))
  })

  it('skeleton does not depend on skins being enabled', () => {
    const a = setup()
    const b = setup()
    b.p.skins.left.enabled = true
    b.p.skins.left.fill = 'panel'
    const va = generateCabinetParts(a.p, a.layout, a.nz).map((x) => x.mesh.length)
    const vb = generateCabinetParts(b.p, b.layout, b.nz).map((x) => x.mesh.length)
    expect(vb).toEqual(va)
  })

  it('leaves holes for anchor pegs on the outer bars', () => {
    const { p, nz } = setup()
    const m = skeletonMetrics(p, nz)
    expect(m.bw).toBeGreaterThanOrEqual(8)
    expect(m.holeD).toBeGreaterThanOrEqual(3)
  })
})

describe('monolithic', () => {
  it('returns one watertight-ish body with volume close to the sum of plates', () => {
    const { p, nz, layout } = setup({ cabinetMode: 'monolithic' })
    const parts = generateCabinetParts(p, layout, nz)
    expect(parts).toHaveLength(1)
    expect(parts[0]!.instances).toHaveLength(1)
    expect(signedVolume(parts[0]!.mesh)).toBeGreaterThan(0)
    const b = bbox(parts[0]!.mesh).size
    expect(Math.max(...b)).toBeLessThanOrEqual(Math.max(p.width, p.height, p.depth) + 0.01)
  })
})

describe('assembly interference', () => {
  type Ring = number[][]
  const pip = (ring: Ring, x: number, y: number) => {
    let inside = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!, [xj, yj] = ring[j]!
      if (yi! > y !== yj! > y && x < ((xj! - xi!) * (y - yi!)) / (yj! - yi!) + xi!) inside = !inside
    }
    return inside
  }
  const inShape = (shape: number[][][][], x: number, y: number) =>
    shape.some((poly) => pip(poly[0]!, x, y) && !poly.slice(1).some((h) => pip(h, x, y)))

  function overlaps(joinery: boolean, over: Partial<ProjectState> = {}) {
    const { p, nz, layout } = setup(over)
    const geo = buildSkeleton(p, layout, nz, joinery)
    const inv = geo.plates.map((pl) => mat4InvertRigid(pl.matrix))
    let bad = 0
    const where = new Set<string>()
    geo.plates.forEach((a, ai) => {
      const xs = a.shape.flat(2).map((v) => v[0]!), ys = a.shape.flat(2).map((v) => v[1]!)
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
      for (let x = x0 + 0.4; x < x1; x += 1.3) for (let y = y0 + 0.4; y < y1; y += 1.3) {
        if (!inShape(a.shape, x, y)) continue
        const q = mat4Apply(a.matrix, [x, y, a.thickness / 2])
        geo.plates.forEach((b, bi) => {
          if (bi === ai) return
          const l = mat4Apply(inv[bi]!, q)
          if (l[2] > 0 && l[2] < b.thickness && inShape(b.shape, l[0], l[1])) {
            bad++
            where.add(`${a.key} x ${b.key}`)
          }
        })
      }
    })
    return { bad, where: [...where] }
  }

  it('skeleton plates never occupy the same volume (tabs sit in their slots)', () => {
    const r = overlaps(true)
    expect(r.where).toEqual([])
  })

  it('holds for several sections, rows and every material level', () => {
    for (const level of ['minimo', 'equilibrado', 'reforcado'] as const) {
      const r = overlaps(true, {
        materialLevel: level,
        width: 300,
        depth: 150,
        sections: [
          { width: 'auto', rows: [{ height: 'auto', divisions: 2 }, { height: 'auto', divisions: 1 }] },
          { width: 'auto', rows: [{ height: 'auto', divisions: 3 }, { height: 40, divisions: 1 }, { height: 'auto', divisions: 1 }] },
        ],
      })
      expect(r.where, level).toEqual([])
    }
  })

  it('monolithic plates only abut', () => {
    expect(overlaps(false).where).toEqual([])
  })
})

describe('bed splitting', () => {
  it('splits plates that exceed the bed into pieces that each fit, joined in-plane', () => {
    const { p, nz, layout } = setup({ width: 260, printBed: { x: 220, y: 220 } })
    const geo = buildSkeleton(p, layout, nz)
    const backs = geo.plates.filter((x) => x.kind === 'costas')
    expect(backs.length).toBeGreaterThan(1)
    const parts = generateCabinetParts(p, layout, nz)
    for (const part of parts) {
      const [w, d] = part.size
      const fits = (w <= 216 && d <= 216) || (d <= 216 && w <= 216)
      expect(fits, `${part.label} ${w.toFixed(0)}x${d.toFixed(0)}`).toBe(true)
      expect(isWatertight(part.mesh), part.label).toBe(true)
    }
    expect(geo.warnings.some((w) => w.includes('dividida'))).toBe(true)
  })

  it('does not split when everything fits', () => {
    const { p, nz, layout } = setup({ printBed: { x: 400, y: 400 } })
    const geo = buildSkeleton(p, layout, nz)
    expect(geo.plates.filter((x) => x.kind === 'costas')).toHaveLength(1)
  })
})

describe('dividers between drawers', () => {
  it('creates one divider per neighbouring pair in each row', () => {
    const { p, nz, layout } = setup({
      printBed: { x: 500, y: 500 },
      sections: [{ width: 'auto', rows: [{ height: 'auto', divisions: 3 }, { height: 'auto', divisions: 2 }, { height: 'auto', divisions: 1 }] }],
    })
    const geo = buildSkeleton(p, layout, nz)
    expect(geo.plates.filter((x) => x.kind === 'divisoria')).toHaveLength(2 + 1)
    const parts = generateCabinetParts(p, layout, nz)
    const div = parts.find((x) => x.label.startsWith('Divisória'))
    expect(div).toBeDefined()
    expect(isWatertight(div!.mesh)).toBe(true)
  })

  it('shelf and base windows leave wide rails and cross bars', () => {
    const { p, nz, layout } = setup({ printBed: { x: 500, y: 500 }, materialLevel: 'minimo' })
    const geo = buildSkeleton(p, layout, nz)
    const shelf = geo.plates.find((x) => x.kind === 'prateleira')!
    const xs = shelf.shape.flat(2).map((v) => v[0]!)
    const x0 = Math.min(...xs)
    const holes = shelf.shape[0]!.slice(1)
    const holeMinX = Math.min(...holes.flat().map((v) => v[0]!))
    expect(holeMinX - x0).toBeGreaterThanOrEqual(13.9)
    expect(holes.length).toBeGreaterThan(2)
  })
})
