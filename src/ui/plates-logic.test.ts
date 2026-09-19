import { describe, expect, it } from 'vitest'
import { plateMeshes, planPlates } from '../export'
import { box, extrude, type Vec2 } from '../geom/mesh'
import { makePart } from '../model/part'
import { computeFootprint, findFreeSpot, outlinesOverlap, placedOutline, plateIssues, snapCentre } from './plates-logic'

const area = (l: Vec2[]) => l.reduce((a, p, i) => { const q = l[(i + 1) % l.length]!; return a + (p[0] * q[1] - q[0] * p[1]) / 2 }, 0)

describe('footprint', () => {
  it('extracts outer contour and hole of a plate with a hole', () => {
    const m = extrude([[0, 0], [20, 0], [20, 10], [0, 10]], [[[5, 3], [5, 7], [15, 7], [15, 3]]], 0, 2)
    const o = computeFootprint(m)
    expect(o).toHaveLength(2)
    const areas = o.map((l) => Math.abs(area(l as Vec2[]))).sort((a, b) => b - a)
    expect(areas[0]).toBeCloseTo(200, 3)
    expect(areas[1]).toBeCloseTo(40, 3)
  })
  it('falls back to the bounding rectangle for a box', () => {
    const o = computeFootprint(box(-5, -5, 0, 5, 5, 3))
    expect(o).toHaveLength(1)
    expect(o[0]).toHaveLength(4)
  })
})

const mk = (id: string, w: number, d: number, copies = 1) =>
  makePart({
    id, label: id, group: 'gabinete', assembled: box(0, 0, 0, w, d, 2),
    placements: Array.from({ length: copies }, (_, i) => [1, 0, 0, i, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
  })

describe('planPlates with overrides', () => {
  const bed = { x: 220, y: 220 }
  it('is identical without overrides', () => {
    const parts = [mk('a', 100, 60, 3)]
    expect(planPlates(parts, bed, {})).toEqual(planPlates(parts, bed))
  })
  it('honours position, rotation and plate', () => {
    const parts = [mk('a', 100, 60, 2)]
    const p = planPlates(parts, bed, { 'a#2': { x: 10, y: -20, rotated: true, plate: 2 } })
    expect(p).toHaveLength(2)
    const it = p[1]!.items[0]!
    expect(it).toMatchObject({ copy: 2, x: 10, y: -20, width: 60, depth: 100, rotated: true })
    expect(p[0]!.items).toHaveLength(1)
    const meshes = plateMeshes(p[1]!, parts)
    expect(meshes).toHaveLength(1)
  })
})

describe('collisions', () => {
  const bed = { x: 100, y: 100 }
  const rect = (x: number, y: number, w: number, d: number) => ({ partId: 'p', label: 'p', copy: 1, x, y, width: w, depth: d })
  const outlineOf = (it: { width: number; depth: number }) => [[[-it.width / 2, -it.depth / 2], [it.width / 2, -it.depth / 2], [it.width / 2, it.depth / 2], [-it.width / 2, it.depth / 2]]] as [number, number][][]
  it('detects overlap, touching is fine', () => {
    const a = placedOutline(outlineOf(rect(0, 0, 20, 20)), rect(0, 0, 20, 20))
    expect(outlinesOverlap(a, placedOutline(outlineOf(rect(0, 0, 20, 20)), rect(10, 0, 20, 20)))).toBe(true)
    expect(outlinesOverlap(a, placedOutline(outlineOf(rect(0, 0, 20, 20)), rect(20, 0, 20, 20)))).toBe(false)
    expect(outlinesOverlap(a, placedOutline(outlineOf(rect(0, 0, 20, 20)), rect(0, 0, 20, 20)))).toBe(true)
  })
  it('flags parts sticking out of the bed', () => {
    const items = [rect(0, 0, 20, 20), rect(45, 0, 20, 20)]
    const r = plateIssues(items, bed, outlineOf)
    expect(r[0]).toEqual({ outside: false, overlaps: [] })
    expect(r[1]!.outside).toBe(true)
  })
  it('snaps to bed edge and neighbour with a 2 mm gap; finds free spots', () => {
    const o = rect(0, 0, 20, 20)
    const [x] = snapCentre(rect(0, 0, 10, 10), 15.5, 0, [o], bed)
    expect(x).toBeCloseTo(17, 6)
    expect(snapCentre(rect(0, 0, 10, 10), 44, 0, [], bed)[0]).toBeCloseTo(45, 6)
    const spot = findFreeSpot(rect(0, 0, 30, 30), [rect(-35, 35, 30, 30)], bed)
    expect(spot).not.toBeNull()
  })
})
