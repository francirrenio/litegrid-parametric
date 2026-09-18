import { describe, expect, it } from 'vitest'
import { deriveNozzle } from './nozzle'
import { computeLayout } from './layout'
import { buildManifest } from './manifest'

describe('deriveNozzle', () => {
  it('derives line width, layer height and overlapped wall thickness for a 0.4 nozzle', () => {
    const nz = deriveNozzle(0.4)
    expect(nz.lineWidth).toBeCloseTo(0.45, 5)
    expect(nz.layerHeight).toBeCloseTo(0.28, 5)
    expect(nz.wall(1)).toBeCloseTo(0.45, 5)
    expect(nz.wall(2)).toBeCloseTo(0.84, 2)
    expect(nz.wall(3)).toBeCloseTo(1.23, 2)
  })

  it('scales to a 0.6 nozzle', () => {
    const nz = deriveNozzle(0.6)
    expect(nz.lineWidth).toBeCloseTo(0.675, 5)
    expect(nz.layerHeight).toBeCloseTo(0.4, 5)
  })

  it('honours overrides and rejects bad input', () => {
    expect(deriveNozzle(0.4, { extrusionFactor: 1.2 }).lineWidth).toBeCloseTo(0.48, 5)
    expect(() => deriveNozzle(0)).toThrow()
    expect(() => deriveNozzle(0.4).wall(0)).toThrow()
  })
})

describe('computeLayout', () => {
  const base = { nozzle: 0.4, width: 240, height: 180, depth: 120 }

  it('splits auto rows so walls and bays fill the cabinet exactly', () => {
    const l = computeLayout({
      ...base,
      sections: [{ width: 'auto', rows: [{ height: 'auto', divisions: 1 }, { height: 'auto', divisions: 1 }, { height: 'auto', divisions: 1 }] }],
    })
    const t = l.wallStructural
    const total = l.bays.reduce((s, b) => s + b.clearHeight, 0) + 4 * t
    expect(total).toBeCloseTo(180, 0)
    expect(l.warnings).toEqual([])
    expect(l.bays).toHaveLength(3)
    expect(l.bays[0]?.id).toBe('BAY_S1_R1_C1')
  })

  it('mixes fixed and auto widths across sections', () => {
    const l = computeLayout({
      ...base,
      sections: [
        { width: 60, rows: [{ height: 'auto', divisions: 1 }] },
        { width: 'auto', rows: [{ height: 'auto', divisions: 2 }] },
      ],
    })
    const s1 = l.bays.find((b) => b.section === 1)
    const s2 = l.bays.filter((b) => b.section === 2)
    expect(s1?.clearWidth).toBe(60)
    expect(s2).toHaveLength(2)
    const t = l.wallStructural
    const inner = 240 - 3 * t
    expect(s2[0]?.clearWidth).toBeCloseTo(((inner - 60) - t) / 2, 1)
  })

  it('applies drawer clearances', () => {
    const l = computeLayout({ ...base, sections: [{ width: 'auto', rows: [{ height: 40, divisions: 1 }] }] })
    const b = l.bays[0]!
    expect(b.drawer.width).toBeCloseTo(b.clearWidth - 0.6, 2)
    expect(b.drawer.height).toBeCloseTo(b.clearHeight - 0.6, 2)
    expect(b.drawer.depth).toBeCloseTo(b.clearDepth - 1.5, 2)
  })

  it('warns on overflow and leftover', () => {
    const over = computeLayout({ ...base, sections: [{ width: 'auto', rows: [{ height: 100, divisions: 1 }, { height: 100, divisions: 1 }] }] })
    expect(over.warnings.some((w) => w.code === 'overflow')).toBe(true)
    const left = computeLayout({ ...base, sections: [{ width: 'auto', rows: [{ height: 40, divisions: 1 }] }] })
    expect(left.warnings.some((w) => w.code === 'leftover')).toBe(true)
  })

  it('warns on narrow bays and rejects empty input', () => {
    const narrow = computeLayout({ ...base, sections: [{ width: 'auto', rows: [{ height: 'auto', divisions: 20 }] }] })
    expect(narrow.warnings.some((w) => w.code === 'bay-too-narrow')).toBe(true)
    expect(computeLayout({ ...base, sections: [] }).warnings[0]?.code).toBe('invalid-input')
  })
})

describe('buildManifest', () => {
  it('serialises bays and global parameters', () => {
    const m = buildManifest('Teste', {
      nozzle: 0.4, width: 240, height: 180, depth: 120,
      sections: [{ width: 'auto', rows: [{ height: 'auto', divisions: 2 }] }],
    })
    expect(m.project).toBe('Teste')
    expect(m.global_parameters.extrusion_width_mm).toBe(0.45)
    expect(m.bays).toHaveLength(2)
    expect(m.bays[0]?.recommended_drawer.width_mm).toBeGreaterThan(0)
  })
})
