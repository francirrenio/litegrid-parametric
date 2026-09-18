import { describe, expect, it } from 'vitest'
import {
  bbox, box, cylinder, extrude, extrudeWithHoleProfile, frustumSquare, isWatertight, mirrorX, rectPoly,
  regularPolygon, rotateY, scalePoly, signedVolume, slotPoly, toBed, translate, transform, mat4RotX,
  mat4InvertRigid, mat4Apply, mat4Compose, mat4Translate,
} from './mesh'

describe('primitives', () => {
  it('box is a closed outward mesh with the right volume', () => {
    const b = box(0, 0, 0, 2, 3, 4)
    expect(isWatertight(b)).toBe(true)
    expect(signedVolume(b)).toBeCloseTo(24, 6)
  })

  it('extrude with a hole subtracts the hole volume', () => {
    const m = extrude(rectPoly(0, 0, 10, 10), [rectPoly(3, 3, 6, 6)], 0, 2)
    expect(isWatertight(m)).toBe(true)
    expect(signedVolume(m)).toBeCloseTo((100 - 9) * 2, 5)
  })

  it('extrude is independent of input polygon winding', () => {
    const cw = rectPoly(0, 0, 4, 4).reverse()
    expect(signedVolume(extrude(cw, [], 0, 1))).toBeCloseTo(16, 6)
  })

  it('hole profile with ramp and step stays watertight', () => {
    const hole = regularPolygon(5, 5, 2, 6)
    const wide = scalePoly(hole, 1.2, 1.2, 5, 5)
    const m = extrudeWithHoleProfile(rectPoly(0, 0, 10, 10), [
      { z: 0, holes: [hole] },
      { z: 3, holes: [hole] },
      { z: 4, holes: [wide] },
      { z: 6, holes: [wide] },
    ])
    expect(isWatertight(m)).toBe(true)
    expect(signedVolume(m)).toBeGreaterThan(0)
  })

  it('slot, cylinder and frustum are closed', () => {
    expect(isWatertight(extrude(rectPoly(-5, -5, 5, 5), [slotPoly(0, 0, 2, 6)], 0, 1))).toBe(true)
    expect(isWatertight(cylinder(0, 0, 3, 0, 5))).toBe(true)
    const f = frustumSquare(0, 0, 4, 2, 0, 6)
    expect(isWatertight(f)).toBe(true)
    expect(signedVolume(f)).toBeGreaterThan(0)
  })
})

describe('transforms', () => {
  it('mirror keeps outward orientation', () => {
    const m = mirrorX(box(1, 0, 0, 3, 1, 1))
    expect(signedVolume(m)).toBeGreaterThan(0)
    expect(bbox(m).lo[0]).toBeCloseTo(-3, 6)
  })

  it('rotation preserves volume and toBed drops the part to z=0', () => {
    const b = translate(rotateY(box(0, 0, 0, 2, 3, 4), 0.7), 5, 5, 5)
    expect(signedVolume(b)).toBeCloseTo(24, 5)
    const { mesh, matrix } = toBed(b, mat4RotX(Math.PI / 2))
    const bb = bbox(mesh)
    expect(bb.lo[2]).toBeCloseTo(0, 6)
    expect((bb.lo[0] + bb.hi[0]) / 2).toBeCloseTo(0, 6)
    expect(mesh).toEqual(transform(b, matrix))
  })

  it('rigid inverse round-trips a point', () => {
    const m = mat4Compose(mat4Translate(1, 2, 3), mat4RotX(0.4))
    const p = mat4Apply(mat4InvertRigid(m), mat4Apply(m, [4, 5, 6]))
    expect(p[0]).toBeCloseTo(4, 9)
    expect(p[1]).toBeCloseTo(5, 9)
    expect(p[2]).toBeCloseTo(6, 9)
  })
})
