import { describe, expect, it } from 'vitest'
import { generate } from '../gen'
import { defaultProject } from '../model/defaults'
import { assemblySteps, rawStepAt } from './assembly'

describe('assembly steps', () => {
  it('orders steps and lists the parts of each', () => {
    const r = generate(defaultProject({ printBed: { x: 500, y: 500 } }))
    const steps = assemblySteps(r.parts)
    expect(steps.length).toBeGreaterThan(3)
    expect(steps[0]!.title).toBe('Costas')
    expect(steps.some((s) => s.title === 'Gavetas')).toBe(true)
    expect(steps.every((s) => s.parts.length > 0)).toBe(true)
    expect(rawStepAt(steps, r.parts, steps.length)).toBeGreaterThanOrEqual(rawStepAt(steps, r.parts, 1))
  })
})
