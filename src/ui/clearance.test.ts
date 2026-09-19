import { describe, expect, it } from 'vitest'
import { generate } from '../gen'
import { defaultProject } from '../model/defaults'
import { computeClearances, levelOf, summarize } from './clearance'

describe('clearance analysis', () => {
  it('reports the configured gaps for every bay and no collisions', () => {
    const p = defaultProject({ printBed: { x: 500, y: 500 } })
    const r = generate(p)
    const list = computeClearances(r)
    expect(list).toHaveLength(r.layout.bays.length)
    for (const c of list) {
      expect(c.lateral).toBeCloseTo(0.3, 1)
      expect(c.top).toBeCloseTo(0.6, 1)
      expect(c.back).toBeGreaterThan(1.3)
      expect(c.collision).toBe(false)
      expect(levelOf(c)).toBe('ok')
    }
    expect(summarize(list).bad).toBe(0)
  })

  it('follows the clearance settings', () => {
    const p = defaultProject({ printBed: { x: 500, y: 500 } })
    p.advanced.clearances = { lateral: 0.12, top: 0.15, back: 1.5 }
    const list = computeClearances(generate(p))
    for (const c of list) expect(c.lateral).toBeCloseTo(0.12, 1)
    expect(summarize(list).tight + summarize(list).bad).toBeGreaterThan(0)
  })

  it('grades tight and bad clearances', () => {
    expect(levelOf({ bay: 'x', lateral: 0.15, top: 0.5, back: 1, min: 0.15, collision: false })).toBe('tight')
    expect(levelOf({ bay: 'x', lateral: 0.05, top: 0.5, back: 1, min: 0.05, collision: false })).toBe('bad')
    expect(levelOf({ bay: 'x', lateral: 0.5, top: 0.5, back: 1, min: 0.5, collision: true })).toBe('bad')
  })
})
