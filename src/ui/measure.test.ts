import { describe, expect, it } from 'vitest'
import { measurement } from './measure'

describe('measurement', () => {
  it('reports bed axes: Y is depth (model Z) and Z is up (model Y)', () => {
    const m = measurement({ x: 0, y: 0, z: 0 }, { x: 3, y: 12, z: 4 })
    expect(m.dx).toBe(3)
    expect(m.dy).toBe(4)
    expect(m.dz).toBe(12)
    expect(m.dist).toBeCloseTo(Math.hypot(3, 4, 12))
  })
})
