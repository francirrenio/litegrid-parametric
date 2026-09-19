import { describe, expect, it } from 'vitest'
import { generate } from '.'
import { defaultProject } from '../model/defaults'

describe('floor perimeters', () => {
  it('makes the drawer floor thicker with more floor perimeters, independent of the walls', () => {
    const p = defaultProject({ printBed: { x: 500, y: 500 } })
    p.drawerDefaults.perimeters = 2
    const thin = generate(p).parts.find((x) => x.label.startsWith('Gaveta'))!
    p.drawerDefaults.floorPerimeters = 5
    const thick = generate(p).parts.find((x) => x.label.startsWith('Gaveta'))!
    expect(thick.mesh.length).toBeGreaterThan(thin.mesh.length * 0.9)
    expect(thick.id).not.toBe(thin.id)
  })
})
