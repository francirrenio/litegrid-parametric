import { describe, expect, it } from 'vitest'
import { generate } from '../gen'
import { defaultProject } from './defaults'
import { clearBelow, countBelow, resolveForBay } from './resolve'

describe('clearBelow', () => {
  it('makes every drawer of a row follow the row after clearing the drawers overrides', () => {
    const p = defaultProject({ printBed: { x: 500, y: 500 } })
    p.sections[0]!.rows[0]!.divisions = 3
    const bays = generate(p).layout.bays.filter((b) => b.section === 1 && b.row === 1)
    expect(bays.length).toBe(3)
    p.sections[0]!.rows[0]!.drawer = { perimeters: 4 }
    p.overrides[bays[1]!.id] = { perimeters: 2 }
    const all = generate(p).layout.bays
    const scope = { level: 'row' as const, section: 0, row: 0, bay: null }
    expect(countBelow(p, scope, all)).toBe(1)
    expect(resolveForBay(p, 0, 0, bays[1]!.id).perimeters).toBe(2)
    expect(clearBelow(p, scope, all)).toBe(1)
    for (const b of bays) expect(resolveForBay(p, 0, 0, b.id).perimeters).toBe(4)
    expect(countBelow(p, scope, all)).toBe(0)
  })
})
