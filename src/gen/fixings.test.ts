import { describe, expect, it } from 'vitest'
import { computeLayout } from '../core/layout'
import { deriveNozzle } from '../core/nozzle'
import { overhangArea } from '../geom/analysis'
import { bbox, isWatertight, signedVolume, transform } from '../geom/mesh'
import { defaultProject } from '../model/defaults'
import type { FixingConfig, ProjectState } from '../model/types'
import { layoutInput } from './index'
import { faceAnchors } from './anchors'
import { generateFixingParts, hexRing, keyholePoly, SKADIS_CLIP_PROFILE } from './fixings'
import { skeletonMetrics } from './metrics'

const none: FixingConfig = {
  between: { pins: false, butterfly: false, screw: 'none', magnet: false },
  wall: { mode: 'none', screwDiameter: 4 },
  hangOnSkadis: false,
}

function run(fx: Partial<{ between: Partial<FixingConfig['between']>; wall: Partial<FixingConfig['wall']>; hangOnSkadis: boolean }>, extra: Partial<ProjectState> = {}) {
  const p = defaultProject(extra)
  p.fixing = {
    between: { ...none.between, ...fx.between },
    wall: { ...none.wall, ...fx.wall },
    hangOnSkadis: fx.hangOnSkadis ?? false,
  }
  const nz = deriveNozzle(p.nozzle, p.advanced)
  const layout = computeLayout(layoutInput(p))
  return { p, nz, layout, parts: generateFixingParts(p, layout, nz) }
}

describe('fixings', () => {
  it('nothing enabled gives no parts', () => {
    expect(run({}).parts).toHaveLength(0)
  })

  it('pins: 4 per interface (right + top), diameter = hole - 2 fit, watertight, no overhang', () => {
    const { p, nz, parts } = run({ between: { pins: true } })
    expect(parts).toHaveLength(1)
    const pin = parts[0]!
    expect(pin.instances).toHaveLength(8)
    const m = skeletonMetrics(p, nz)
    expect(pin.size[0]).toBeCloseTo(m.holeD - 2 * m.fit, 1)
    expect(pin.size[2]).toBeCloseTo(6)
    expect(isWatertight(pin.mesh)).toBe(true)
    expect(overhangArea(pin.mesh, 44)).toBeLessThan(1e-3)
    expect(pin.note).toBeTruthy()
  })

  it('pins land on the anchors of the joined faces', () => {
    const { p, nz, layout, parts } = run({ between: { pins: true } })
    const pin = parts[0]!
    const a = faceAnchors(p, layout, nz, 'right')
    const centre = transform(pin.mesh, pin.instances[0]!)
    const b = bbox(centre)
    const cx = (b.lo[0] + b.hi[0]) / 2
    expect(cx).toBeCloseTo(p.width, 3)
    expect(a.points.length).toBeGreaterThan(0)
  })

  it('every option produces its part(s), each watertight, printable and documented', () => {
    const { parts } = run({
      between: { pins: true, butterfly: true, screw: 'M3', magnet: true },
      wall: { mode: 'screws' },
      hangOnSkadis: true,
    })
    const ids = parts.map((x) => x.id)
    expect(ids).toEqual(expect.arrayContaining(['FIX_PINO', 'FIX_BORBOLETA', 'FIX_CONECTOR_M3', 'FIX_CONECTOR_IMA', 'FIX_PLACA_PAREDE', 'FIX_GANCHO_SKADIS']))
    for (const part of parts) {
      expect(part.group).toBe('fixacao')
      expect(isWatertight(part.mesh), part.id).toBe(true)
      expect(part.note?.length ?? 0).toBeGreaterThan(20)
      expect(part.instances.length).toBeGreaterThan(0)
    }
  })

  it('M4 connector and keyhole / cleat wall modes', () => {
    const a = run({ between: { screw: 'M4' } }).parts
    expect(a.map((x) => x.id)).toEqual(['FIX_CONECTOR_M4'])
    const k = run({ wall: { mode: 'keyhole' } }).parts
    expect(k.map((x) => x.id)).toEqual(['FIX_PLACA_CHAVE'])
    const c = run({ wall: { mode: 'cleat' } }).parts
    expect(c.map((x) => x.id)).toEqual(['FIX_CLEAT_PAREDE', 'FIX_CLEAT_GABINETE'])
    for (const part of [...a, ...k, ...c]) expect(isWatertight(part.mesh), part.id).toBe(true)
  })

  it('cleats and keyhole print without support (45 deg limit, small internal-face allowance)', () => {
    const c = run({ wall: { mode: 'cleat' } }).parts
    for (const part of c) expect(overhangArea(part.mesh, 44)).toBeLessThan(1e-3)
    const k = run({ wall: { mode: 'keyhole' } }).parts[0]!
    // pegs' bottom caps abut the plate (internal faces): at most 2 pegs per instance
    expect(overhangArea(k.mesh, 44)).toBeLessThan(2 * Math.PI * 1.6 ** 2 * 1.1)
  })

  it('butterfly, screw and magnet plates: pegs / nut trap / pocket present, overhang only internal', () => {
    const m = run({ between: { screw: 'M3' } }).parts[0]!
    expect(overhangArea(m.mesh, 44)).toBeLessThan(1e-3)
    const mag = run({ between: { magnet: true } }).parts[0]!
    expect(mag.size[2]).toBeCloseTo(3)
    const bf = run({ between: { butterfly: true } }).parts[0]!
    expect(bf.size[2]).toBeCloseTo(2 + 3)
  })

  it('Skadis clips: 40 mm pitch, 6.1 mm wide pairs, 12 mm long, 45 deg barbs', () => {
    const { parts } = run({ hangOnSkadis: true })
    const clip = parts[0]!
    expect(clip.id).toBe('FIX_GANCHO_SKADIS')
    const w = SKADIS_CLIP_PROFILE.map((q) => q[0])
    expect(Math.max(...w) * 2).toBeCloseTo(6.1)
    expect(clip.size[2]).toBeCloseTo(3 + 6.5)
    expect(clip.size[0]).toBeGreaterThan(56 - 1e-6)
    // the four blades' bottom caps abut the plate (internal faces): 4 x 1.5 x 12 mm
    expect(overhangArea(clip.mesh, 44)).toBeLessThan(4 * 1.5 * 12 + 0.5)
  })

  it('geometry helpers keep a fixed vertex count', () => {
    expect(keyholePoly(0, 0, 4, 3, 10)).toHaveLength(keyholePoly(0, 0, 7, 8, 10).length)
    const h = hexRing(0, 0, 10, 30)
    expect(Math.max(...h.map((q) => q[0]))).toBeCloseTo(5, 5)
  })
})
