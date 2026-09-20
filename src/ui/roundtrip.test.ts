import { describe, expect, it } from 'vitest'
import { defaultProject } from '../model/defaults'
import { migrateProject } from './storage'

describe('save and load keeps drawer settings at every level', () => {
  it('keeps section, row and drawer patches and auto/number settings', () => {
    const p = defaultProject()
    p.sections[0]!.drawer = { perimeters: 4 }
    p.sections[0]!.rows[0]!.drawer = { perimeters: 3, floorPerimeters: 5 }
    p.overrides['BAY_S1_R1_C1'] = { perimeters: 2, floorPerimeters: 'auto' }
    const back = migrateProject(JSON.parse(JSON.stringify(p)))
    expect(back.sections[0]!.drawer).toEqual({ perimeters: 4 })
    expect(back.sections[0]!.rows[0]!.drawer).toEqual({ perimeters: 3, floorPerimeters: 5 })
    expect(back.overrides['BAY_S1_R1_C1']).toEqual({ perimeters: 2, floorPerimeters: 'auto' })
  })
})

describe('bed arrangement', () => {
  it('is saved with the project and cleaned when invalid', () => {
    const p = defaultProject()
    p.plateLayout = { 'costas-1#1': { x: 10, y: -5, rotated: true, plate: 2 }, bad: { x: 'a' } as never }
    const back = migrateProject(JSON.parse(JSON.stringify(p)))
    expect(back.plateLayout).toEqual({ 'costas-1#1': { x: 10, y: -5, rotated: true, plate: 2 } })
  })
})
