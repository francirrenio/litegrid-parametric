import { describe, expect, it, vi } from 'vitest'
import { generate } from '.'
import { bbox, isWatertight, signedVolume } from '../geom/mesh'
import { defaultDrawer, defaultFaceFill, defaultProject } from '../model/defaults'
import type { DrawerConfig, ProjectState } from '../model/types'
import { computeClearances } from '../ui/clearance'
import { instanceBox } from '../ui/bounds'

vi.setConfig({ testTimeout: 300000 })

const oneBay = (over: Partial<DrawerConfig>, extra: Partial<ProjectState> = {}) =>
  defaultProject({
    drawerDefaults: defaultDrawer(over),
    width: 420, height: 90, depth: 200, printBed: { x: 220, y: 220 },
    sections: [{ width: 'auto', rows: [{ height: 'auto', divisions: 1, load: 'media' }] }],
    ...extra,
  })

const fits = (s: number[], bed: { x: number; y: number }) =>
  (s[0]! <= bed.x + 1e-6 && s[1]! <= bed.y + 1e-6) || (s[1]! <= bed.x + 1e-6 && s[0]! <= bed.y + 1e-6)

describe('drawer split to fit the bed', () => {
  it('a 400 mm wide drawer on a 220 bed becomes watertight pieces that fit and cover the original box', () => {
    const p = oneBay({ labelHolder: true, labelMode: 'internal', handle: 'cutout' })
    const r = generate(p)
    const ds = r.parts.filter((x) => x.id.startsWith('gaveta'))
    expect(ds.length).toBeGreaterThanOrEqual(2)
    for (const d of ds) {
      expect(isWatertight(d.mesh), d.id).toBe(true)
      expect(signedVolume(d.mesh)).toBeGreaterThan(0)
      expect(fits(d.size, p.printBed), `${d.id} ${d.size}`).toBe(true)
      expect(d.instances).toHaveLength(1)
    }
    expect(r.warnings.some((w) => /não cabe na mesa|does not fit/.test(w.message) && /Gaveta|Drawer/.test(w.message))).toBe(false)
    expect(r.warnings.some((w) => /Gaveta dividida|Drawer split/.test(w.message))).toBe(true)
    const bay = r.layout.bays[0]!
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
    for (const d of ds) {
      const b = instanceBox(d, 0)
      for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k]!, b.lo[k]!); hi[k] = Math.max(hi[k]!, b.hi[k]!) }
    }
    expect(hi[0]! - lo[0]!).toBeCloseTo(bay.drawer.width, 1)
    expect(hi[1]! - lo[1]!).toBeCloseTo(bay.drawer.height, 1)
    expect(hi[2]! - lo[2]!).toBeCloseTo(bay.drawer.depth, 1)
    // Same drawer without a bed limit: the union of the pieces has the same volume, apart from the pegs' overlap.
    const whole = generate({ ...p, printBed: { x: 600, y: 600 } }).parts.find((x) => x.id.startsWith('gaveta'))!
    const wb = bbox(whole.mesh)
    expect(wb.size[0]).toBeCloseTo(bay.drawer.width, 1)
    const vSplit = ds.reduce((t, d) => t + signedVolume(d.mesh), 0)
    expect(Math.abs(vSplit / signedVolume(whole.mesh) - 1)).toBeLessThan(0.03)
    const clr = computeClearances(r)
    expect(clr.every((c) => !c.collision && c.min >= 0)).toBe(true)
  })

  it('a drawer that fits stays a single untouched part', () => {
    const p = oneBay({}, { width: 180, printBed: { x: 220, y: 220 } })
    const a = generate(p).parts.filter((x) => x.id.startsWith('gaveta'))
    expect(a).toHaveLength(1)
    expect(a[0]!.id).not.toMatch(/-[AB]$/)
    const big = generate({ ...p, printBed: { x: 600, y: 600 } }).parts.filter((x) => x.id.startsWith('gaveta'))
    expect(big[0]!.mesh).toEqual(a[0]!.mesh)
  })

  it('a group of identical drawers gives every piece one copy per drawer', () => {
    const p = oneBay({}, {
      width: 850, sections: [{ width: 'auto', rows: [{ height: 'auto', divisions: 2, load: 'media' }] }],
    })
    const r = generate(p)
    const ds = r.parts.filter((x) => x.id.startsWith('gaveta'))
    const n = r.layout.bays.length
    expect(n).toBeGreaterThanOrEqual(2)
    for (const d of ds) expect(d.instances).toHaveLength(n)
  })

  it('splits along the depth when the drawer is too deep', () => {
    const p = oneBay({ handle: 'none', labelHolder: false, dividerSlots: 2 }, { width: 150, depth: 420 })
    const r = generate(p)
    const ds = r.parts.filter((x) => x.id.startsWith('gaveta'))
    expect(ds.length).toBeGreaterThanOrEqual(2)
    for (const d of ds) {
      expect(isWatertight(d.mesh), d.id).toBe(true)
      expect(fits(d.size, p.printBed), d.id).toBe(true)
    }
  })
})

let seed = 777
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!
const between = (a: number, b: number) => a + rnd() * (b - a)

describe('fuzz: split drawers', () => {
  it('random parameters give closed pieces that fit the bed', () => {
    const bad: string[] = []
    for (let i = 0; i < 8; i++) {
      const p = defaultProject({
        printBed: { x: pick([180, 220, 256] as const), y: pick([180, 220, 256] as const) },
        width: between(200, 640), height: between(90, 200), depth: between(150, 480),
        sections: [{ width: 'auto', rows: [{ height: 'auto', divisions: 1, load: 'media' }] }],
      })
      const fill = () => defaultFaceFill({
        fill: pick(['closed', 'perforated', 'truss'] as const), openPercent: between(10, 60), solidUpTo: between(0, 30),
        reinforcement: pick(['auto', 'none', 'ribs', 'postsBeams', 'truss', 'x'] as const),
      })
      p.drawerDefaults = defaultDrawer({
        perimeters: pick([2, 3]), sides: fill(), floor: fill(), front: pick(['flat', 'slope', 'lip'] as const),
        handle: pick(['cutout', 'bar', 'none'] as const), labelHolder: rnd() > 0.3, labelMode: pick(['internal', 'external'] as const),
        dividerSlots: pick([0, 2, 3]), innerChamfer: rnd() > 0.5, topRim: rnd() > 0.5,
      })
      const tag = `#${i} bed ${p.printBed.x}x${p.printBed.y} ${p.width.toFixed(0)}x${p.depth.toFixed(0)}`
      const r = generate(p)
      for (const w of r.warnings) if (w.code === 'generator-error') bad.push(`${tag} ${w.message}`)
      for (const part of r.parts.filter((x) => x.group === 'gaveta' && /^gaveta/.test(x.id))) {
        if (part.mesh.some((v) => !Number.isFinite(v))) bad.push(`${tag} NaN ${part.id}`)
        else if (!isWatertight(part.mesh)) bad.push(`${tag} not watertight ${part.id}`)
        else if (!fits(part.size, p.printBed)) bad.push(`${tag} does not fit ${part.id} ${part.size.map((v) => v.toFixed(0))}`)
      }
      for (const c of computeClearances(r)) if (c.collision || c.min < 0) bad.push(`${tag} clearance ${c.bay}`)
    }
    expect(bad.slice(0, 6)).toEqual([])
  })
})
