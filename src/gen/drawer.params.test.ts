import { describe, expect, it } from 'vitest'
import { generate } from '.'
import { isWatertight } from '../geom/mesh'
import { defaultDrawer, defaultFaceFill, defaultProject } from '../model/defaults'
import type { DrawerConfig, Reinforcement } from '../model/types'
import { instanceBox } from '../ui/bounds'

function drawerOf(cfg: Partial<DrawerConfig>) {
  const p = defaultProject({ printBed: { x: 500, y: 500 }, height: 220 })
  p.drawerDefaults = defaultDrawer(cfg)
  const r = generate(p)
  const part = r.parts.find((x) => x.label.startsWith('Gaveta'))!
  return { p, r, part }
}

describe('drawer parameters', () => {
  for (const reinforcement of ['ribs', 'postsBeams', 'truss', 'x'] as Reinforcement[])
    it(`slope front with ${reinforcement} reinforcement is watertight and the struts reach the full wall height`, () => {
      const { part } = drawerOf({
        front: 'slope', handle: 'none', labelHolder: false,
        sides: defaultFaceFill({ fill: 'closed', reinforcement, reinforcementWidth: 3 }),
      })
      expect(isWatertight(part.mesh)).toBe(true)
    })

  it('front height and chamfer length change the drawer shape', () => {
    const a = drawerOf({ front: 'slope', frontHeight: 'auto', chamferLength: 'auto' }).part.mesh
    const b = drawerOf({ front: 'slope', frontHeight: 40, chamferLength: 30 }).part.mesh
    expect(a.length !== b.length || a.some((v, i) => v !== b[i])).toBe(true)
    expect(isWatertight(drawerOf({ front: 'slope', frontHeight: 40, chamferLength: 30 }).part.mesh)).toBe(true)
  })

  for (const labelMode of ['internal', 'external'] as const)
    for (const handle of ['cutout', 'bar', 'none'] as const)
      it(`label ${labelMode} with handle ${handle} is watertight and stays inside the depth`, () => {
        const { p, r, part } = drawerOf({ labelHolder: true, labelMode, handle, frontLip: true, lipDepth: 6, topRim: true, rimWidth: 3 })
        expect(isWatertight(part.mesh)).toBe(true)
        for (const x of r.parts.filter((q) => q.group === 'gaveta'))
          x.instances.forEach((_, i) => expect(instanceBox(x, i).hi[2]!).toBeLessThanOrEqual(p.depth + 1e-6))
        const holders = r.parts.filter((q) => q.id.startsWith('porta-etiqueta'))
        expect(holders.length).toBe(labelMode === 'external' ? 1 : 0)
      })
})
