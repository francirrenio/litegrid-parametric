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
