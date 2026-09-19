import { describe, expect, it } from 'vitest'
import { orca3mf, planPlates } from '.'
import { generate } from '../gen'
import { defaultProject } from '../model/defaults'
import { orcaPlateOrigin } from './orca3mf'

describe('Orca 3MF', () => {
  it('places plates on Orca grid', () => {
    expect(orcaPlateOrigin(0, 5, 100, 100)).toEqual([0, -0])
    expect(orcaPlateOrigin(1, 5, 100, 100)[0]).toBeCloseTo(120)
    expect(orcaPlateOrigin(3, 5, 100, 100)).toEqual([0, -120])
  })

  it('assigns every object to a numbered plate', async () => {
    const p = defaultProject({ printBed: { x: 180, y: 180 } })
    const r = generate(p)
    const plates = planPlates(r.parts, p.printBed)
    const text = await orca3mf(plates, r.parts, 180, 180).text()
    expect(text).toContain('Metadata/model_settings.config')
    expect(text).toContain('OrcaSlicer-')
    const nPlates = (text.match(/<plate>/g) ?? []).length
    expect(nPlates).toBe(plates.length)
    const nObjs = plates.reduce((s, x) => s + x.items.length, 0)
    expect((text.match(/<model_instance>/g) ?? []).length).toBe(nObjs)
    expect((text.match(/<item objectid=/g) ?? []).length).toBe(nObjs)
    expect(text).toContain('key="plater_id" value="2"')
  })
})
