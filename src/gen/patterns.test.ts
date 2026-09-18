import { describe, expect, it } from 'vitest'
import { generatePattern, type PatternRequest } from './patterns'
import { extrude, isWatertight, rectPoly, signedVolume } from '../geom/mesh'
import type { HolePattern } from '../model/types'

const base = (pattern: HolePattern, extra: Partial<PatternRequest> = {}): PatternRequest => ({
  pattern, width: 120, height: 60, openPercent: 50, web: 1.7, frame: 3, solidUpTo: 0, maxHole: 40, upright: false, ...extra,
})

describe('generatePattern', () => {
  for (const p of ['hexagon', 'diamond', 'circle', 'triangle'] as HolePattern[]) {
    it(`${p}: holes stay inside the frame and give a watertight extrusion`, () => {
      const r = generatePattern(base(p))
      expect(r.holes.length).toBeGreaterThan(4)
      for (const h of r.holes) for (const [x, y] of h) {
        expect(x).toBeGreaterThanOrEqual(3 - 1e-6); expect(x).toBeLessThanOrEqual(117 + 1e-6)
        expect(y).toBeGreaterThanOrEqual(3 - 1e-6); expect(y).toBeLessThanOrEqual(57 + 1e-6)
      }
      const m = extrude(rectPoly(0, 0, 120, 60), r.holes, 0, 1)
      expect(isWatertight(m)).toBe(true)
      expect(signedVolume(m)).toBeCloseTo(120 * 60 - r.openFraction * 120 * 60, 0)
    })
  }

  it('hexagon opening is within reach of the target on a large face', () => {
    const r = generatePattern(base('hexagon', { width: 300, height: 200, openPercent: 50, maxHole: 100 }))
    expect(r.openFraction).toBeGreaterThan(0.38)
    expect(r.openFraction).toBeLessThan(0.55)
  })

  it('respects solidUpTo and the smallest-item limit', () => {
    const r = generatePattern(base('hexagon', { solidUpTo: 20, maxHole: 6, openPercent: 70 }))
    for (const h of r.holes) for (const [, y] of h) expect(y).toBeGreaterThanOrEqual(20 - 1e-6)
    expect(r.holeSize).toBeLessThanOrEqual(6 + 1e-9)
    expect(r.warnings.length).toBeGreaterThan(0)
  })

  it('upright circles become teardrops with a 45° roof', () => {
    const r = generatePattern(base('circle', { upright: true, maxHole: 12 }))
    const h = r.holes[0]!
    const apex = h[h.length - 1]!
    const top = Math.max(...h.map((p) => p[1]))
    expect(apex[1]).toBeCloseTo(top, 6)
  })

  it('upright hexagons are flat-top: a horizontal roof edge and 60° sides', () => {
    const r = generatePattern(base('hexagon', { upright: true, maxHole: 8, solidUpTo: 10 }))
    expect(r.holes.length).toBeGreaterThan(4)
    for (const h of r.holes) {
      const top = Math.max(...h.map((p) => p[1]))
      expect(h.filter((p) => Math.abs(p[1] - top) < 1e-6)).toHaveLength(2)
      for (const [, y] of h) expect(y).toBeGreaterThanOrEqual(10 - 1e-6)
    }
  })

  it('returns no holes when nothing fits or openness is zero', () => {
    expect(generatePattern(base('hexagon', { openPercent: 0 })).holes).toEqual([])
    expect(generatePattern(base('hexagon', { width: 8, height: 8 })).holes).toEqual([])
  })
})
