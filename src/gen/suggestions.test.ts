import { describe, expect, it } from 'vitest'
import { computeLayout } from '../core/layout'
import { deriveNozzle } from '../core/nozzle'
import { defaultProject } from '../model/defaults'
import type { ProjectState } from '../model/types'
import { layoutInput } from './index'
import { buildSuggestions } from './suggestions'

const run = (over: Partial<ProjectState>) => {
  const p = defaultProject(over)
  return buildSuggestions(p, computeLayout(layoutInput(p)), deriveNozzle(p.nozzle, p.advanced)).map((s) => s.id)
}

describe('suggestions', () => {
  it('flags an unbraced skeleton', () => {
    expect(run({ skeleton: { perimeters: 3, barWidth: 'auto', bracing: 'none' } })).toContain('skeleton-bracing')
  })

  it('flags minimum level with heavy drawers and PLA creep', () => {
    const ids = run({
      materialLevel: 'minimo',
      sections: [{ width: 'auto', rows: [{ height: 'auto', divisions: 1, load: 'pesada' }] }],
    })
    expect(ids).toContain('level-heavy')
    expect(ids).toContain('material-creep')
  })

  it('warns about panel skins without standoff', () => {
    const p = defaultProject()
    p.skins.back.enabled = true
    p.skins.back.fill = 'panel'
    p.skins.back.standoff = 'none'
    const ids = buildSuggestions(p, computeLayout(layoutInput(p)), deriveNozzle(p.nozzle)).map((s) => s.id)
    expect(ids).toContain('skin-standoff-back')
  })

  it('every suggestion carries an applicable patch', () => {
    const p = defaultProject({ materialLevel: 'minimo', cabinetMode: 'monolithic', width: 400 })
    for (const s of buildSuggestions(p, computeLayout(layoutInput(p)), deriveNozzle(p.nozzle))) {
      expect(s.patches.length).toBeGreaterThan(0)
      expect(s.title.length).toBeGreaterThan(3)
    }
  })

  it('suggests splitting a row whose drawers exceed the bed', () => {
    const ids = run({ width: 300, printBed: { x: 200, y: 200 }, sections: [{ width: 'auto', rows: [{ height: 'auto', divisions: 1 }] }] })
    expect(ids.some((i) => i.startsWith('drawer-bed-'))).toBe(true)
  })

  it('stays quiet for a sensible default project', () => {
    expect(run({})).not.toContain('skeleton-bracing')
  })
})
