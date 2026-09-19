import { describe, expect, it } from 'vitest'
import { computeLayout } from '../core/layout'
import { deriveNozzle } from '../core/nozzle'
import { generateDrawerParts } from '../gen/drawer'
import { layoutInput } from '../gen'
import { defaultProject } from './defaults'
import { getIn, hasValues, pruneEmpty, resolveAt, resolveForBay, sourceOf, scopeRoot, type Scope } from './resolve'

const bay: Scope = { level: 'bay', section: 0, row: 1, bay: 'BAY_S1_R2_C1' }

describe('drawer settings cascade', () => {
  it('more specific levels win: bay over row over section over global', () => {
    const p = defaultProject()
    p.drawerDefaults.perimeters = 2
    p.sections[0]!.drawer = { perimeters: 3, front: 'flat' }
    p.sections[0]!.rows[1]!.drawer = { perimeters: 4 }
    p.overrides['BAY_S1_R2_C1'] = { front: 'lip' }
    const cfg = resolveForBay(p, 0, 1, 'BAY_S1_R2_C1')
    expect(cfg.perimeters).toBe(4)
    expect(cfg.front).toBe('lip')
    expect(resolveForBay(p, 0, 0, 'BAY_S1_R1_C1').perimeters).toBe(3)
    expect(resolveForBay(p, 0, 0, 'BAY_S1_R1_C1').front).toBe('flat')
    expect(resolveAt(p, { level: 'global', section: null, row: null, bay: null }).perimeters).toBe(2)
  })

  it('merges nested objects instead of replacing them', () => {
    const p = defaultProject()
    p.sections[0]!.rows[0]!.drawer = { sides: { fill: 'closed' } }
    const cfg = resolveForBay(p, 0, 0, 'BAY_S1_R1_C1')
    expect(cfg.sides.fill).toBe('closed')
    expect(cfg.sides.pattern).toBe(p.drawerDefaults.sides.pattern)
    expect(cfg.sides.openPercent).toBe(p.drawerDefaults.sides.openPercent)
  })

  it('reports where each value comes from', () => {
    const p = defaultProject()
    p.sections[0]!.drawer = { front: 'flat' }
    p.sections[0]!.rows[1]!.drawer = { sides: { openPercent: 20 } }
    expect(sourceOf(p, bay, 'front')).toBe('section')
    expect(sourceOf(p, bay, 'sides.openPercent')).toBe('row')
    expect(sourceOf(p, bay, 'handle')).toBe('global')
    p.overrides['BAY_S1_R2_C1'] = { handle: 'bar' }
    expect(sourceOf(p, bay, 'handle')).toBe('bay')
    expect(sourceOf(p, { ...bay, level: 'row', bay: null }, 'handle')).toBe('global')
  })

  it('addresses the patch object of each scope and prunes empties', () => {
    expect(scopeRoot(bay)).toBe('overrides.BAY_S1_R2_C1')
    expect(scopeRoot({ level: 'row', section: 2, row: 1, bay: null })).toBe('sections.2.rows.1.drawer')
    const root = { a: { b: { c: 1 } }, keep: 1 } as Record<string, unknown>
    delete ((root.a as Record<string, unknown>).b as Record<string, unknown>).c
    pruneEmpty(root, 'a.b.c')
    expect(root).toEqual({ keep: 1 })
    expect(hasValues({ sides: {} })).toBe(false)
    expect(hasValues({ sides: { fill: 'closed' } })).toBe(true)
  })

  it('reads and prunes paths that cross arrays (sections and rows)', () => {
    const p = defaultProject()
    p.sections[0]!.rows[1]!.drawer = { sides: { fill: 'closed' } }
    expect(getIn(p, 'sections.0.rows.1.drawer.sides.fill')).toBe('closed')
    const root = p as unknown as Record<string, unknown>
    delete (p.sections[0]!.rows[1]!.drawer!.sides as Record<string, unknown>).fill
    pruneEmpty(root, 'sections.0.rows.1.drawer.sides.fill')
    expect(p.sections[0]!.rows[1]!.drawer).toBeUndefined()
    expect(p.sections[0]!.rows[1]!.height).toBeDefined()
  })

  it('the generator honours row and section settings', () => {
    const p = defaultProject({ printBed: { x: 500, y: 500 } })
    const nz = deriveNozzle(p.nozzle)
    const layout = computeLayout(layoutInput(p))
    const count = () => generateDrawerParts(p, layout, nz).filter((x) => x.group === 'gaveta').length
    const base = count()
    p.sections[0]!.rows[0]!.drawer = { sides: { fill: 'closed' } }
    const withRow = generateDrawerParts(p, layout, nz).filter((x) => x.group === 'gaveta')
    expect(withRow.length).toBeGreaterThanOrEqual(base)
    p.sections[0]!.drawer = { handle: 'none', labelHolder: false }
    const bySection = generateDrawerParts(p, layout, nz).filter((x) => x.group === 'gaveta')
    const vol = (arr: typeof withRow) => arr.reduce((s, x) => s + x.mesh.length * x.instances.length, 0)
    expect(vol(bySection)).not.toBe(vol(withRow))
  })
})
