import { describe, expect, it, vi } from 'vitest'
import { generate } from '.'
import { isWatertight } from '../geom/mesh'
import { defaultProject, PRESETS } from '../model/defaults'
import { FACE_IDS, type FillType, type PanelSystem } from '../model/types'

vi.setConfig({ testTimeout: 600000 })

const errors = (r: ReturnType<typeof generate>) => r.warnings.filter((w) => w.code === 'generator-error')

describe('generate: presets', () => {
  for (const [name, make] of Object.entries(PRESETS)) {
    it(`${name}: no generator errors and closed meshes`, () => {
      const p = make()
      const r = generate(p)
      expect(errors(r)).toEqual([])
      expect(r.parts.length).toBeGreaterThan(3)
      expect(r.parts.some((x) => x.group === 'gaveta')).toBe(true)
      for (const part of r.parts) if (part.group !== 'gabinete' || p.cabinetMode === 'skeleton') expect(isWatertight(part.mesh), part.label).toBe(true)
    })
  }
})

describe('generate: every skin and fixing option', () => {
  it('produces parts without errors for all skin fills and panel systems', () => {
    const fills: FillType[] = ['closed', 'perforated', 'truss', 'panel']
    const systems: PanelSystem[] = ['skadis', 'pegboard', 'hsw']
    for (const fill of fills) for (const sys of fill === 'panel' ? systems : (['skadis'] as PanelSystem[])) {
      const p = defaultProject({ width: 200, depth: 110, height: 150, sections: [{ width: 'auto', rows: [{ height: 'auto', divisions: 2, load: 'leve' }] }] })
      for (const f of FACE_IDS) {
        Object.assign(p.skins[f], { enabled: true, fill, panelSystem: sys })
      }
      const r = generate(p)
      expect(errors(r), `${fill}/${sys}`).toEqual([])
      expect(r.parts.filter((x) => x.group === 'skin').length, `${fill}/${sys}`).toBeGreaterThanOrEqual(FACE_IDS.length)
    }
  })

  it('produces fixing parts for every option', () => {
    const p = defaultProject({ width: 200, depth: 110, height: 150 })
    p.fixing = {
      between: { pins: true, butterfly: true, screw: 'M3', magnet: true },
      wall: { mode: 'cleat', screwDiameter: 4 },
      hangOnSkadis: true,
    }
    const r = generate(p)
    expect(errors(r)).toEqual([])
    expect(r.parts.filter((x) => x.group === 'fixacao').length).toBeGreaterThanOrEqual(5)
    for (const mode of ['screws', 'keyhole'] as const) {
      p.fixing.wall.mode = mode
      expect(errors(generate(p))).toEqual([])
    }
  })
})

describe('generate: structure thickness vs drawers', () => {
  it('drawers never intersect skeleton plates, whatever the structural perimeters', async () => {
    const { bbox, transform } = await import('../geom/mesh')
    for (const perimeters of [2, 3, 5, 8]) {
      const p = defaultProject({ skeleton: { perimeters, barWidth: 'auto', bracing: 'auto' }, printBed: { x: 500, y: 500 } })
      const r = generate(p)
      expect(r.layout.wallStructural, `perimeters ${perimeters}`).toBeGreaterThan(0)
      const boxes = (group: string) =>
        r.parts.filter((x) => x.group === group).flatMap((part) => part.instances.map((m) => bbox(transform(part.mesh, m))))
      const drawers = boxes('gaveta'), plates = boxes('gabinete')
      expect(drawers.length).toBeGreaterThan(0)
      for (const d of drawers) for (const pl of plates) {
        const ov = [0, 1, 2].map((k) => Math.min(d.hi[k]!, pl.hi[k]!) - Math.max(d.lo[k]!, pl.lo[k]!))
        expect(ov.every((o) => o > 0.02), `perimeters ${perimeters}: drawer overlaps a plate by ${ov.map((o) => o.toFixed(2)).join('/')}`).toBe(false)
      }
    }
  })
})

describe('generate: drawer front slope', () => {
  it('a tall shallow drawer keeps its depth (the slope never projects past the bay)', async () => {
    const { defaultProject: mk } = await import('../model/defaults')
    const p = mk({ nozzle: 0.8, width: 300, height: 320, depth: 60, printBed: { x: 500, y: 500 }, sections: [{ width: 'auto', rows: [{ height: 'auto', divisions: 1, load: 'leve' }] }] })
    p.drawerDefaults.front = 'slope'
    const r = generate(p)
    const bay = r.layout.bays[0]!
    const dr = r.parts.find((x) => x.group === 'gaveta' && x.label.startsWith('Gaveta'))!
    expect(dr.size[1]).toBeLessThanOrEqual(bay.drawer.depth + 0.1)
  })
})

describe('generate: label holder and joint clearance', () => {
  it('the label holder is a separate part as wide as the label, one per drawer', async () => {
    const { defaultProject: mk } = await import('../model/defaults')
    const p = mk({ printBed: { x: 500, y: 500 } })
    p.drawerDefaults.labelHolder = true
    p.drawerDefaults.labelWidth = 30
    p.drawerDefaults.labelHeight = 12
    const r = generate(p)
    const holder = r.parts.find((x) => x.id.startsWith('porta-etiqueta'))
    expect(holder).toBeDefined()
    expect(holder!.size[0]).toBeGreaterThan(30)
    expect(holder!.size[0]).toBeLessThan(30 + 10)
    expect(holder!.instances.length).toBeGreaterThan(0)
    expect(isWatertight(holder!.mesh)).toBe(true)
    p.drawerDefaults.labelHolder = false
    expect(generate(p).parts.some((x) => x.id.startsWith('porta-etiqueta'))).toBe(false)
  })

  it('joint clearance never goes below 0.1 mm and joints scale with the bar width', async () => {
    const { defaultProject: mk } = await import('../model/defaults')
    const { fitClearance } = await import('./metrics')
    const { knobFor, seamPostWidth } = await import('./split')
    const p = mk()
    p.advanced.fitClearance = 0.02
    expect(fitClearance(p)).toBe(0.1)
    p.advanced.fitClearance = 0.25
    expect(fitClearance(p)).toBe(0.25)
    expect(seamPostWidth(8)).toBeGreaterThanOrEqual(26)
    expect(seamPostWidth(40)).toBeLessThanOrEqual(30)
    expect(knobFor(seamPostWidth(8)).head).toBeLessThan(knobFor(seamPostWidth(12)).head + 1e-9)
    expect(knobFor(30).head).toBeLessThanOrEqual(7.5)
    expect(knobFor(10).head).toBeGreaterThanOrEqual(4)
  })
})

describe('generate: test piece', () => {
  it('adds the test kit only when asked, without generator errors', async () => {
    const { defaultProject: mk } = await import('../model/defaults')
    const p = mk()
    expect(generate(p).parts.some((x) => x.group === 'teste')).toBe(false)
    p.includeTestPiece = true
    const r = generate(p)
    expect(errors(r)).toEqual([])
    const test = r.parts.filter((x) => x.group === 'teste')
    expect(test.length).toBeGreaterThanOrEqual(5)
    for (const t of test) expect(isWatertight(t.mesh), t.label).toBe(true)
  })
})
