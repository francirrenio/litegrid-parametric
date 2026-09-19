import { describe, expect, it } from 'vitest'
import { generate } from '.'
import { defaultProject } from '../model/defaults'
import { instanceBox } from '../ui/bounds'
import type { DrawerConfig } from '../model/types'

describe('nothing sticks out of the drawer front', () => {
  for (const handle of ['cutout', 'bar', 'none'] as const)
    for (const labelHolder of [false, true])
      it(`handle ${handle} / label holder ${labelHolder}`, () => {
        const p = defaultProject({ printBed: { x: 500, y: 500 } })
        Object.assign(p.drawerDefaults, { handle, labelHolder, front: 'flat' } as Partial<DrawerConfig>)
        const r = generate(p)
        for (const part of r.parts.filter((x) => x.group === 'gaveta')) {
          part.instances.forEach((_, i) => {
            const b = instanceBox(part, i)
            expect(b.hi[2]!).toBeLessThanOrEqual(p.depth + 1e-6)
          })
        }
        const bay = r.layout.bays[0]!
        const drawer = r.parts.find((x) => x.label.startsWith('Gaveta') || x.label.startsWith('Drawer'))!
        const b0 = instanceBox(drawer, 0)
        expect(b0.hi[2]! - b0.lo[2]!).toBeGreaterThan(bay.drawer.depth - 0.5)
      })
})
