import { describe, expect, it } from 'vitest'
import { generate } from '../gen'
import { box, IDENTITY } from '../geom/mesh'
import { defaultProject } from '../model/defaults'
import type { Part } from '../model/part'
import { computeDiff } from './diff'

const part = (id: string, mesh: number[]): Part => ({ id, label: id, group: 'gabinete', mesh, instances: [IDENTITY], size: [1, 1, 1] })

describe('computeDiff', () => {
  it('reports nothing when nothing changed', () => {
    const a = part('a', box(0, 0, 0, 1, 1, 1))
    expect(computeDiff([a], [part('a', box(0, 0, 0, 1, 1, 1))])).toEqual([])
  })

  it('reports only the triangles that are new', () => {
    const before = part('a', box(0, 0, 0, 1, 1, 1))
    const after = part('a', [...box(0, 0, 0, 1, 1, 1), ...box(5, 0, 0, 6, 1, 1)])
    const d = computeDiff([before], [after])
    expect(d).toHaveLength(1)
    expect(d[0]!.whole).toBe(false)
    expect(d[0]!.tris.length).toBe(box(5, 0, 0, 6, 1, 1).length)
  })

  it('a part without an earlier version is reported whole', () => {
    const d = computeDiff([], [part('n', box(0, 0, 0, 1, 1, 1))])
    expect(d[0]!.whole).toBe(true)
  })

  it('finds the drawers changed by a parameter and leaves the skeleton alone', () => {
    const p = defaultProject({ printBed: { x: 500, y: 500 } })
    const a = generate(p).parts
    p.drawerDefaults.sides.fill = 'closed'
    const b = generate(p).parts
    const d = computeDiff(a, b)
    expect(d.length).toBeGreaterThan(0)
    for (const item of d) expect(item.partId.startsWith('gaveta')).toBe(true)
  })

  it('matches a drawer whose id changed with its settings (same family)', () => {
    const p = defaultProject({ printBed: { x: 500, y: 500 } })
    const a = generate(p).parts
    p.drawerDefaults.perimeters = 3
    const b = generate(p).parts
    const d = computeDiff(a, b)
    expect(d.some((x) => !x.whole && x.partId.startsWith('gaveta'))).toBe(true)
  })
})
