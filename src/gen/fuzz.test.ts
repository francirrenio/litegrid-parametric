import { describe, expect, it } from 'vitest'
import { generate } from '.'
import { isWatertight } from '../geom/mesh'
import { defaultDrawer, defaultFaceFill, defaultProject } from '../model/defaults'
import { computeClearances } from '../ui/clearance'

let seed = 12345
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!
const between = (a: number, b: number) => a + rnd() * (b - a)

describe('fuzz: random drawer settings', () => {
  it('always produces closed meshes, finite numbers and drawers that fit their bays', () => {
    const bad: string[] = []
    for (let i = 0; i < 12; i++) {
      const p = defaultProject({ printBed: { x: 600, y: 600 }, width: between(120, 420), height: between(90, 360), depth: between(120, 380) })
      const fill = () => defaultFaceFill({
        fill: pick(['closed', 'perforated', 'truss'] as const), pattern: pick(['triangle', 'hexagon', 'diamond', 'circle'] as const),
        openPercent: between(10, 70), solidUpTo: between(0, 40), frame: pick(['auto', between(1, 8)] as const),
        reinforcement: pick(['auto', 'none', 'ribs', 'postsBeams', 'truss', 'x', 'corrugated'] as const),
        reinforcementWidth: pick(['auto', between(2, 12)] as const), reinforcementHeight: pick(['auto', between(0.5, 4)] as const),
      })
      p.drawerDefaults = defaultDrawer({
        perimeters: pick([1, 2, 3, 4]), floorPerimeters: pick(['auto', 2, 4] as const),
        sides: fill(), floor: fill(), front: pick(['flat', 'slope', 'lip'] as const),
        frontHeight: pick(['auto', between(15, 80)] as const), chamferLength: pick(['auto', between(8, 60)] as const),
        frontLip: rnd() > 0.5, lipDepth: between(3, 14), handle: pick(['cutout', 'bar', 'none'] as const),
        labelHolder: rnd() > 0.3, labelMode: pick(['internal', 'external'] as const), labelWidth: between(20, 70), labelHeight: between(8, 24),
        dividerSlots: pick([0, 0, 2, 4]), innerChamfer: rnd() > 0.5, topRim: rnd() > 0.5, rimWidth: pick(['auto', between(1.5, 8)] as const),
      })
      const r = generate(p)
      const tag = `#${i} ${JSON.stringify(p.drawerDefaults).slice(0, 0)}`
      for (const part of r.parts) {
        if (part.mesh.some((v) => !Number.isFinite(v))) bad.push(`${tag} NaN in ${part.id}`)
        else if (part.group === 'gaveta' && !isWatertight(part.mesh)) bad.push(`${tag} not watertight ${part.id} ${JSON.stringify(p.drawerDefaults)}`)
      }
      for (const c of computeClearances(r)) if (c.collision || c.min < 0) bad.push(`${tag} clearance ${c.bay} ${c.min.toFixed(2)} ${c.collision}`)
    }
    expect(bad.slice(0, 5)).toEqual([])
  }, 300000)
})
