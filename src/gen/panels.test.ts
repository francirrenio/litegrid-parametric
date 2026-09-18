import { describe, expect, it } from 'vitest'
import { extrudeWithHoleProfile, isWatertight, rectPoly, bbox, signedVolume, type Vec2 } from '../geom/mesh'
import { buildPanel, hswProfile, panelCentres, panelThickness, HSW, type PanelRequest } from './panels'

const req = (extra: Partial<PanelRequest> = {}): PanelRequest => ({
  system: 'skadis', width: 240, height: 180, margin: 9, thickness: 'auto', staggered: true, pegboardHole: '1/4', hswVariant: 'sd', ...extra,
})
const width = (poly: Vec2[]) => Math.max(...poly.map((p) => p[0])) - Math.min(...poly.map((p) => p[0]))
const uniq = (a: number[]) => [...new Set(a.map((n) => Math.round(n * 100) / 100))].sort((x, y) => x - y)

describe('Skadis', () => {
  it('keeps the 40 mm pitch in a row, 20 mm between rows and a 20 mm stagger', () => {
    const c = panelCentres(req())
    const ys = uniq(c.map((p) => p[1]))
    for (let i = 1; i < ys.length; i++) expect(ys[i]! - ys[i - 1]!).toBeCloseTo(20, 2)
    const rows = ys.map((y) => c.filter((p) => Math.abs(p[1] - y) < 0.01).map((p) => p[0]).sort((a, b) => a - b))
    for (const r of rows) for (let i = 1; i < r.length; i++) expect(r[i]! - r[i - 1]!).toBeCloseTo(40, 2)
    for (let j = 1; j < rows.length; j++) {
      const d = Math.abs(rows[j]![0]! - rows[j - 1]![0]!) % 40
      expect(Math.min(d, 40 - d)).toBeCloseTo(20, 2)
    }
  })

  it('non-staggered grid is plain 40 x 40', () => {
    const c = panelCentres(req({ staggered: false }))
    expect(uniq(c.map((p) => p[0])).every((x, i, a) => i === 0 || Math.abs(x - a[i - 1]! - 40) < 0.02)).toBe(true)
    const ys = uniq(c.map((p) => p[1]))
    for (let i = 1; i < ys.length; i++) expect(ys[i]! - ys[i - 1]!).toBeCloseTo(40, 2)
  })

  it('slot has 5 x 15.2 bore and 7.2 x 17.1 chamfered faces, 3 mm min thickness', () => {
    const g = buildPanel(req())
    expect(g.thickness).toBe(5)
    const [face, bore, bore2, face2] = g.levels
    const w = (l: typeof face) => width(l!.holes[0]!)
    expect(w(face)).toBeCloseTo(7.2, 2)
    expect(w(bore)).toBeCloseTo(5, 2)
    expect(w(bore2)).toBeCloseTo(5, 2)
    expect(w(face2)).toBeCloseTo(7.2, 2)
    const h = (l: typeof face) => { const ys = l!.holes[0]!.map((p) => p[1]); return Math.max(...ys) - Math.min(...ys) }
    expect(h(bore)).toBeCloseTo(15.2, 2)
    expect(h(face)).toBeCloseTo(17.1, 2)
    expect(bore!.z).toBeCloseTo(1.1)
    expect(bore2!.z).toBeCloseTo(3.9)
  })

  it('all slots stay inside the margin and give a watertight plate', () => {
    const g = buildPanel(req())
    for (const [x, y] of g.centres) {
      expect(x - g.extent[0]).toBeGreaterThanOrEqual(9 - 1e-6)
      expect(y + g.extent[1]).toBeLessThanOrEqual(171 + 1e-6)
    }
    const m = extrudeWithHoleProfile(rectPoly(0, 0, 240, 180), g.levels)
    expect(isWatertight(m)).toBe(true)
    expect(signedVolume(m)).toBeLessThan(240 * 180 * 5)
  })

  it('warns above 5 mm', () => {
    expect(panelThickness('skadis', 'sd', 6).warnings.length).toBe(1)
    expect(panelThickness('skadis', 'sd', 3).warnings.length).toBe(0)
  })
})

describe('Pegboard', () => {
  it('holes sit on a 25.4 mm square grid', () => {
    const g = buildPanel(req({ system: 'pegboard' }))
    expect(g.thickness).toBe(4)
    const xs = uniq(g.centres.map((p) => p[0])), ys = uniq(g.centres.map((p) => p[1]))
    for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeCloseTo(25.4, 2)
    for (let i = 1; i < ys.length; i++) expect(ys[i]! - ys[i - 1]!).toBeCloseTo(25.4, 2)
  })
  it('hole diameters follow the 1/4" and 1/8" options', () => {
    const d = (h: '1/4' | '1/8') => {
      const poly = buildPanel(req({ system: 'pegboard', pegboardHole: h })).levels[0]!.holes[0]!
      return Math.max(...poly.map((p) => p[0])) - Math.min(...poly.map((p) => p[0]))
    }
    expect(d('1/4')).toBeCloseTo(6.35, 1)
    expect(d('1/8')).toBeCloseTo(3.175, 1)
  })
})

describe('HSW', () => {
  const vv = (af: number) => af / Math.cos(Math.PI / 6)
  it('SD profile widths at each level (vertex to vertex)', () => {
    const g = buildPanel(req({ system: 'hsw', hswVariant: 'sd' }))
    expect(g.thickness).toBe(8)
    const expected: Array<[number, number]> = [[0, 20.8], [0.5, 20], [5.1, 20], [6, 22], [8, 22]]
    expect(g.levels.map((l) => l.z)).toEqual(expected.map((e) => e[0]))
    g.levels.forEach((l, i) => expect(width(l.holes[0]!)).toBeCloseTo(vv(expected[i]![1]), 3))
    expect(width(g.levels[2]!.holes[0]!)).toBeCloseTo(23.09, 2)
    expect(width(g.levels[4]!.holes[0]!)).toBeCloseTo(25.4, 1)
  })
  it('HD adds the return ramp, bore and face chamfer', () => {
    const g = buildPanel(req({ system: 'hsw', hswVariant: 'hd', width: 300, height: 200 }))
    expect(g.thickness).toBe(10)
    const z = g.levels.map((l) => l.z)
    expect(z.slice(-4)).toEqual([8, 9.19, 9.7, 10])
    const ws = g.levels.slice(-4).map((l) => width(l.holes[0]!))
    expect(ws[0]).toBeCloseTo(vv(22), 3)
    expect(ws[1]).toBeCloseTo(vv(20), 3)
    expect(ws[2]).toBeCloseTo(vv(20), 3)
    expect(ws[3]).toBeCloseTo(vv(20.6), 3)
    expect(hswProfile('hd')).toHaveLength(8)
  })
  it('grid: 23.6 neighbours, 20.44 columns, 11.8 offset', () => {
    const c = buildPanel(req({ system: 'hsw', width: 300, height: 200 })).centres
    const cols = uniq(c.map((p) => p[0]))
    for (let i = 1; i < cols.length; i++) expect(cols[i]! - cols[i - 1]!).toBeCloseTo(HSW.columnPitch, 2)
    const col = (x: number) => c.filter((p) => Math.abs(p[0] - x) < 0.01).map((p) => p[1]).sort((a, b) => a - b)
    const a = col(cols[0]!), b = col(cols[1]!)
    for (let i = 1; i < a.length; i++) expect(a[i]! - a[i - 1]!).toBeCloseTo(23.6, 2)
    expect(Math.abs(b[0]! - a[0]!) % 23.6).toBeGreaterThan(0)
    const d = Math.abs(b[0]! - a[0]!)
    expect(Math.min(d, 23.6 - d)).toBeCloseTo(11.8, 2)
  })
  it('plates are watertight and HD ramps have no overhang beyond 44 deg', async () => {
    const { overhangArea } = await import('../geom/analysis')
    for (const v of ['sd', 'hd'] as const) {
      const g = buildPanel(req({ system: 'hsw', hswVariant: v, width: 80, height: 60 }))
      const m = extrudeWithHoleProfile(rectPoly(0, 0, 80, 60), g.levels)
      expect(isWatertight(m)).toBe(true)
      expect(bbox(m).size[2]).toBeCloseTo(g.thickness)
      expect(overhangArea(m, 44)).toBeLessThan(1e-6)
    }
  })
})
