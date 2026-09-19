import { describe, expect, it } from 'vitest'
import { allPlates3mf, planPlates } from '.'
import { generate } from '../gen'
import { defaultProject } from '../model/defaults'

describe('all-beds 3MF', () => {
  it('builds one file containing every bed', async () => {
    const p = defaultProject({ printBed: { x: 180, y: 180 } })
    const r = generate(p)
    const plates = planPlates(r.parts, p.printBed)
    expect(plates.length).toBeGreaterThan(1)
    const blob = allPlates3mf(plates, r.parts, p.printBed.x)
    expect(blob.size).toBeGreaterThan(1000)
    expect(blob.type).toBe('model/3mf')
  })
})
