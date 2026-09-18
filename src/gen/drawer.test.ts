import { describe, expect, it, vi } from 'vitest'
import { computeLayout } from '../core/layout'
import { deriveNozzle } from '../core/nozzle'
import { bbox, isWatertight, signedVolume, type Mesh } from '../geom/mesh'
import { defaultDrawer, defaultFaceFill, defaultProject } from '../model/defaults'
import type { DrawerConfig, FaceFill, ProjectState } from '../model/types'
import { generateDrawerParts } from './drawer'
import { layoutInput } from './index'

vi.setConfig({ testTimeout: 180000 })

function run(p: ProjectState) {
  const nz = deriveNozzle(p.nozzle, p.advanced)
  const layout = computeLayout(layoutInput(p))
  return { layout, nz, parts: generateDrawerParts(p, layout, nz) }
}

function withDrawer(over: Partial<DrawerConfig>, extra: Partial<ProjectState> = {}): ProjectState {
  return defaultProject({ drawerDefaults: defaultDrawer(over), ...extra })
}

const oneBay = (over: Partial<DrawerConfig>, extra: Partial<ProjectState> = {}) =>
  withDrawer(over, {
    width: 120, height: 90, depth: 120,
    sections: [{ width: 'auto', rows: [{ height: 'auto', divisions: 1, load: 'media' }] }],
    ...extra,
  })

/** Area of slanted downward faces steeper than 45 deg; flat ceilings (short bridges) and the bed are excluded. */
function overhangArea(mesh: Mesh): number {
  let area = 0
  for (let i = 0; i < mesh.length; i += 9) {
    if (Math.max(mesh[i + 2]!, mesh[i + 5]!, mesh[i + 8]!) <= 0.02) continue
    const ux = mesh[i + 3]! - mesh[i]!, uy = mesh[i + 4]! - mesh[i + 1]!, uz = mesh[i + 5]! - mesh[i + 2]!
    const vx = mesh[i + 6]! - mesh[i]!, vy = mesh[i + 7]! - mesh[i + 1]!, vz = mesh[i + 8]! - mesh[i + 2]!
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz)
    if (len === 0) continue
    const c = nz / len
    if (c < -Math.SQRT1_2 && c > -0.999) area += len / 2
  }
  return area
}

const drawers = (parts: ReturnType<typeof run>['parts']) => parts.filter((x) => x.id.startsWith('gaveta'))

describe('generateDrawerParts', () => {
  it('deduplicates identical bays into one part with many instances', () => {
    const p = defaultProject()
    const { layout, parts } = run(p)
    const ds = drawers(parts)
    const total = ds.reduce((s, x) => s + x.instances.length, 0)
    expect(total).toBe(layout.bays.length)
    expect(ds.length).toBeLessThan(layout.bays.length)
    expect(ds.some((x) => x.instances.length === 3)).toBe(true)
  })

  it('all default-project parts are watertight and match bay dimensions', () => {
    const { layout, parts } = run(defaultProject())
    for (const part of parts) expect(isWatertight(part.mesh), part.id).toBe(true)
    for (const part of drawers(parts)) {
      const bay = layout.bays.find((b) => part.id.includes(`${Math.round(b.drawer.width)}x${Math.round(b.drawer.height)}x${Math.round(b.drawer.depth)}`))!
      const b = bbox(part.mesh)
      expect(b.lo[2]).toBeCloseTo(0, 5)
      expect(b.size[0]).toBeCloseTo(bay.drawer.width, 1)
      expect(b.size[1]).toBeCloseTo(bay.drawer.depth, 1)
      expect(b.size[2]).toBeCloseTo(bay.drawer.height, 1)
    }
  })

  const fills: FaceFill['fill'][] = ['closed', 'perforated', 'truss']
  for (const fill of fills)
    for (const floorFill of ['closed', 'perforated'] as const)
      it(`sides ${fill} / floor ${floorFill} is watertight`, () => {
        const p = oneBay({
          sides: defaultFaceFill({ fill, openPercent: 40, solidUpTo: 8, reinforcement: 'none' }),
          floor: defaultFaceFill({ fill: floorFill, openPercent: 30, reinforcement: 'none' }),
        }, { smallestItem: 10 })
        const { parts } = run(p)
        const d = drawers(parts)
        expect(d).toHaveLength(1)
        expect(isWatertight(d[0]!.mesh)).toBe(true)
        expect(signedVolume(d[0]!.mesh)).toBeGreaterThan(0)
      })

  for (const r of ['none', 'ribs', 'postsBeams', 'truss', 'x', 'corrugated', 'auto'] as const)
    for (const front of ['flat', 'slope'] as const)
      it(`reinforcement ${r} with ${front} front is watertight`, () => {
        const p = oneBay({
          front, sides: defaultFaceFill({ fill: 'perforated', solidUpTo: 10, reinforcement: r }),
        }, { height: 120 })
        const d = drawers(run(p).parts)
        expect(isWatertight(d[0]!.mesh)).toBe(true)
        expect(overhangArea(d[0]!.mesh)).toBeLessThan(5)
      })

  for (const front of ['flat', 'slope', 'lip'] as const)
    for (const handle of ['cutout', 'bar', 'none'] as const)
      for (const labelHolder of [false, true])
        it(`front ${front} / handle ${handle} / label ${labelHolder}`, () => {
          const p = oneBay({ front, handle, labelHolder })
          const { layout, parts } = run(p)
          const d = drawers(parts)[0]!
          expect(isWatertight(d.mesh)).toBe(true)
          const b = bbox(d.mesh)
          expect(b.size[1]).toBeCloseTo(layout.bays[0]!.drawer.depth, 1)
          expect(overhangArea(d.mesh)).toBeLessThan(5)
        })

  it('top rim, inner chamfer off and on', () => {
    for (const [topRim, innerChamfer] of [[true, true], [true, false], [false, false]] as const) {
      const d = drawers(run(oneBay({ topRim, innerChamfer })).parts)[0]!
      expect(isWatertight(d.mesh)).toBe(true)
      expect(overhangArea(d.mesh)).toBeLessThan(5)
    }
  })

  it('divider slots create grooves and a divider part with matching instances', () => {
    const p = oneBay({ dividerSlots: 2, topRim: true })
    const { parts, layout, nz } = run(p)
    const div = parts.find((x) => x.label.startsWith('Divis'))!
    expect(div).toBeDefined()
    expect(div.instances).toHaveLength(2)
    expect(isWatertight(div.mesh)).toBe(true)
    expect(div.size[2]).toBeCloseTo(nz.wall(2), 2)
    expect(div.size[0]).toBeLessThan(layout.bays[0]!.drawer.width)
    const d = drawers(parts)[0]!
    expect(isWatertight(d.mesh)).toBe(true)
    const plain = drawers(run(oneBay({ dividerSlots: 0, topRim: true })).parts)[0]!
    expect(signedVolume(d.mesh)).toBeGreaterThan(signedVolume(plain.mesh))
  })

  it('per-bay overrides split the deduplication group', () => {
    const p = defaultProject()
    const ids = computeLayout(layoutInput(p)).bays.map((b) => b.id)
    p.overrides[ids[0]!] = { handle: 'bar', front: 'lip' }
    const { parts, layout } = run(p)
    const ds = drawers(parts)
    expect(ds.reduce((s, x) => s + x.instances.length, 0)).toBe(layout.bays.length)
    const first = ds.find((x) => x.note?.length !== undefined && x.instances.length === 1 && x.label.includes('('))
    expect(ds.length).toBeGreaterThan(drawers(run(defaultProject()).parts).length - 1)
    expect(first === undefined || isWatertight(first.mesh)).toBe(true)
    const overridden = ds.filter((x) => x.instances.length === 1)
    expect(overridden.length).toBeGreaterThan(0)
  })

  it('perforated sides take less volume than closed sides', () => {
    const closed = drawers(run(oneBay({ sides: defaultFaceFill({ fill: 'closed', reinforcement: 'none' }) })).parts)[0]!
    const perf = drawers(run(oneBay({ sides: defaultFaceFill({ fill: 'perforated', openPercent: 50, solidUpTo: 6, reinforcement: 'none' }) })).parts)[0]!
    expect(signedVolume(perf.mesh)).toBeLessThan(signedVolume(closed.mesh))
  })

  it('auto reinforcement adds structure to a heavy tall drawer but not a light short one', () => {
    const mk = (h: number, load: 'leve' | 'pesada') =>
      oneBay({ sides: defaultFaceFill({ fill: 'closed', reinforcement: 'auto' }), floor: defaultFaceFill({ fill: 'closed', reinforcement: 'none' }), innerChamfer: false, labelHolder: false, handle: 'none', front: 'flat' }, {
        height: h,
        sections: [{ width: 'auto', rows: [{ height: 'auto', divisions: 1, load }] }],
      })
    const short = drawers(run(mk(24, 'leve')).parts)[0]!
    const tall = drawers(run(mk(140, 'pesada')).parts)[0]!
    const noReinf = drawers(run({ ...mk(140, 'pesada'), drawerDefaults: defaultDrawer({ sides: defaultFaceFill({ fill: 'closed', reinforcement: 'none' }), floor: defaultFaceFill({ fill: 'closed', reinforcement: 'none' }), innerChamfer: false, labelHolder: false, handle: 'none', front: 'flat' }) }).parts)[0]!
    expect(signedVolume(tall.mesh)).toBeGreaterThan(signedVolume(noReinf.mesh) * 1.02)
    const shortNo = drawers(run({ ...mk(24, 'leve'), drawerDefaults: defaultDrawer({ sides: defaultFaceFill({ fill: 'closed', reinforcement: 'none' }), floor: defaultFaceFill({ fill: 'closed', reinforcement: 'none' }), innerChamfer: false, labelHolder: false, handle: 'none', front: 'flat' }) }).parts)[0]!
    expect(signedVolume(short.mesh)).toBeCloseTo(signedVolume(shortNo.mesh), 3)
    expect(isWatertight(tall.mesh)).toBe(true)
  })

  it('upright overhang stays within tolerance for the default drawer', () => {
    for (const d of drawers(run(defaultProject()).parts)) expect(overhangArea(d.mesh)).toBeLessThan(5)
  })
})
