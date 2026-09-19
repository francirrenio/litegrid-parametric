import { describe, expect, it } from 'vitest'
import { computeLayout } from '../core/layout'
import { deriveNozzle } from '../core/nozzle'
import { bbox, isWatertight } from '../geom/mesh'
import { defaultDrawer, defaultProject } from '../model/defaults'
import type { FillType, ProjectState } from '../model/types'
import { layoutInput } from './index'
import { boxOf } from './split'
import { generateTestParts, slotPlateShape, tabPlateShape, testFit } from './testpiece'

function run(p: ProjectState) {
  const nz = deriveNozzle(p.nozzle, p.advanced)
  return { nz, parts: generateTestParts(p, computeLayout(layoutInput(p)), nz) }
}

describe('generateTestParts', () => {
  for (const nozzle of [0.25, 0.4, 0.6, 0.8]) {
    it(`valid parts for nozzle ${nozzle}`, () => {
      const { parts } = run(defaultProject({ nozzle }))
      expect(parts.length).toBeGreaterThanOrEqual(6)
      for (const part of parts) {
        expect(part.group).toBe('teste')
        expect(part.note).toBeTruthy()
        expect(isWatertight(part.mesh), part.id).toBe(true)
        expect(part.instances.length).toBe(1)
        expect(Math.max(part.size[0], part.size[1]), part.id).toBeLessThanOrEqual(180)
      }
    })
  }

  for (const fill of ['closed', 'perforated', 'truss'] as FillType[]) {
    it(`mini drawer with ${fill} walls`, () => {
      const d0 = defaultDrawer()
      const p = defaultProject({
        drawerDefaults: defaultDrawer({ sides: { ...d0.sides, fill }, floor: { ...d0.floor, fill } }),
      })
      const { parts } = run(p)
      const d = parts.find((x) => x.id === 'teste-gaveta')!
      expect(isWatertight(d.mesh)).toBe(true)
      const b = bbox(d.mesh)
      // printed standing: footprint is width x depth, vertical extent is height
      expect(Math.abs(b.size[0] - 64)).toBeLessThan(0.2)
      expect(Math.abs(b.size[1] - 56)).toBeLessThan(0.2)
      expect(Math.abs(b.size[2] - 45)).toBeLessThan(0.2)
    })
  }

  it('slot width equals tab width plus clearance on both sides', () => {
    const p = defaultProject()
    const f = testFit(p, deriveNozzle(p.nozzle, p.advanced))
    const slots = slotPlateShape(f)[0]!.slice(1).map((r) => boxOf([[r]])).filter((b) => b.x1 - b.x0 > f.holeD + 0.5)
    expect(slots.length).toBe(2)
    const tb = boxOf(tabPlateShape(f))
    expect(tb.y1 - tb.y0).toBeCloseTo(44 + f.t, 5)
    for (const s of slots) {
      expect(s.x1 - s.x0).toBeCloseTo(f.tabW + 2 * f.fit, 5)
      expect(s.y1 - s.y0).toBeCloseTo(f.t + 2 * f.fit, 5)
    }
  })

  it('fitClearance changes slot size, min 0.1', () => {
    const nz = deriveNozzle(0.4, {})
    const w = (fc: number) => testFit(defaultProject({ advanced: { fitClearance: fc } }), nz).slotW
    expect(w(0.3)).toBeCloseTo(12.6, 5)
    expect(w(0.3)).toBeGreaterThan(w(0.15))
    expect(w(0)).toBeCloseTo(12.2, 5)
  })
})
