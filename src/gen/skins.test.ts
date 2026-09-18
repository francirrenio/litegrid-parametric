import { describe, expect, it } from 'vitest'
import { computeLayout } from '../core/layout'
import { deriveNozzle } from '../core/nozzle'
import { bbox, isWatertight, mat4RotX, signedVolume, transform } from '../geom/mesh'
import { overhangArea } from '../geom/analysis'
import { defaultProject, defaultSkin } from '../model/defaults'
import type { FaceId, ProjectState, SkinConfig } from '../model/types'
import { layoutInput } from './index'
import { faceAnchors } from './anchors'
import { skinThickness } from './metrics'
import { generateSkinParts, pocketMesh } from './skins'

function run(skins: Partial<Record<FaceId, Partial<SkinConfig>>>, extra: Partial<ProjectState> = {}) {
  const p = defaultProject(extra)
  for (const [f, s] of Object.entries(skins)) p.skins[f as FaceId] = defaultSkin({ enabled: true, ...s })
  const nz = deriveNozzle(p.nozzle, p.advanced)
  const layout = computeLayout(layoutInput(p))
  return { p, nz, layout, parts: generateSkinParts(p, layout, nz) }
}
const skin = (parts: ReturnType<typeof run>['parts'], f: string) => parts.find((x) => x.id === `SKIN_${f}`)!

describe('skins', () => {
  it('disabled skins and fill none produce nothing', () => {
    expect(run({}).parts).toHaveLength(0)
    expect(run({ left: { fill: 'none' } }).parts).toHaveLength(0)
  })

  it('every part is watertight for every fill type, attach mode and standoff', () => {
    const combos: Array<[SkinConfig['fill'], SkinConfig['attach'], SkinConfig['standoff']]> = [
      ['closed', 'tabs', 'none'], ['closed', 'screws', 'spacers'], ['closed', 'glue', 'none'], ['closed', 'clips', 'none'],
      ['perforated', 'tabs', 'none'], ['perforated', 'screws', 'none'], ['truss', 'tabs', 'none'],
      ['panel', 'tabs', 'none'], ['panel', 'tabs', 'spacers'], ['panel', 'glue', 'pockets'], ['panel', 'tabs', 'pockets'],
    ]
    for (const [fill, attach, standoff] of combos) {
      const { parts } = run({ left: { fill, attach, standoff }, top: { fill, attach, standoff, panelSystem: 'hsw' } }, { width: 160, height: 120, depth: 100 })
      expect(parts.length).toBeGreaterThan(0)
      for (const part of parts) expect(isWatertight(part.mesh), `${part.id} ${fill}/${attach}/${standoff}`).toBe(true)
    }
  }, 60000)

  it('plate bbox equals the face size plus thickness (closed, glue)', () => {
    const { p, nz, parts } = run({
      left: { fill: 'closed', attach: 'glue', standoff: 'none' },
      top: { fill: 'closed', attach: 'glue', standoff: 'none' },
    })
    const t = skinThickness({ thickness: 'auto' }, nz)
    const l = skin(parts, 'LEFT')
    expect(l.size[0]).toBeCloseTo(p.depth)
    expect(l.size[1]).toBeCloseTo(p.height)
    expect(l.size[2]).toBeCloseTo(t)
    const tp = skin(parts, 'TOP')
    expect(tp.size[0]).toBeCloseTo(p.width)
    expect(tp.size[1]).toBeCloseTo(p.depth)
  })

  it('placement puts the plate outside the envelope', () => {
    const { p, parts } = run({
      left: { fill: 'closed', attach: 'glue', standoff: 'none' },
      right: { fill: 'closed', attach: 'glue', standoff: 'none' },
    })
    const l = transform(skin(parts, 'LEFT').mesh, skin(parts, 'LEFT').instances[0]!)
    expect(bbox(l).hi[0]).toBeCloseTo(0)
    expect(bbox(l).lo[0]).toBeLessThan(0)
    const r = transform(skin(parts, 'RIGHT').mesh, skin(parts, 'RIGHT').instances[0]!)
    expect(bbox(r).lo[0]).toBeCloseTo(p.width)
  })

  it('perforated and truss are lighter than closed', () => {
    const c = run({ left: { fill: 'closed', attach: 'glue' } }).parts[0]!
    const pf = run({ left: { fill: 'perforated', attach: 'glue' } }).parts[0]!
    const tr = run({ left: { fill: 'truss', attach: 'glue', openPercent: 60 } }).parts[0]!
    expect(signedVolume(pf.mesh)).toBeLessThan(signedVolume(c.mesh) * 0.9)
    expect(signedVolume(tr.mesh)).toBeLessThan(signedVolume(c.mesh) * 0.9)
    expect(pf.size[2]).toBeCloseTo(c.size[2])
  })

  it('tabs put pegs on the inner face and print outer face down', () => {
    const { p, nz, layout, parts } = run({ left: { fill: 'closed', attach: 'tabs', standoff: 'none' } })
    const part = skin(parts, 'LEFT')
    expect(part.size[2]).toBeGreaterThan(skinThickness({ thickness: 'auto' }, nz) + 2)
    const w = transform(part.mesh, part.instances[0]!)
    expect(bbox(w).hi[0]).toBeGreaterThan(1)
    expect(bbox(w).lo[0]).toBeLessThan(-1)
    expect(faceAnchors(p, layout, nz, 'left').points.length).toBeGreaterThan(3)
    // only the pegs' own bottom caps (internal faces where they abut the plate) count as downward area
    const pegArea = faceAnchors(p, layout, nz, 'left').points.length * 0.5 * 20 * 1.6 ** 2 * Math.sin((2 * Math.PI) / 20)
    expect(overhangArea(part.mesh, 44)).toBeLessThan(pegArea * 1.05)
  })

  it('Skadis skin: 5 mm plate, one spacer per anchor, plate offset 20 mm', () => {
    const { p, nz, layout, parts } = run({ back: { fill: 'panel', panelSystem: 'skadis', standoff: 'spacers' } })
    const plate = skin(parts, 'BACK')
    expect(plate.size[2]).toBeCloseTo(5)
    const sp = parts.find((x) => x.id === 'ESPACADOR_BACK')!
    expect(sp.group).toBe('espacador')
    expect(sp.instances).toHaveLength(faceAnchors(p, layout, nz, 'back').points.length)
    expect(sp.size[2]).toBeCloseTo(20)
    const w = transform(plate.mesh, plate.instances[0]!)
    expect(bbox(w).hi[2]).toBeCloseTo(-20)
    expect(bbox(w).lo[2]).toBeCloseTo(-25)
    const s0 = transform(sp.mesh, sp.instances[0]!)
    expect(bbox(s0).lo[2]).toBeCloseTo(-20)
    expect(bbox(s0).hi[2]).toBeCloseTo(0)
    expect(overhangArea(sp.mesh, 44)).toBeLessThan(1e-3)
  })

  it('non-panel skins get no spacers by default but do when standoffMm is set', () => {
    expect(run({ left: { fill: 'closed', standoff: 'spacers' } }).parts.some((x) => x.group === 'espacador')).toBe(false)
    const r = run({ left: { fill: 'closed', standoff: 'spacers', standoffMm: 10 } })
    expect(r.parts.find((x) => x.group === 'espacador')!.size[2]).toBeCloseTo(10)
  })

  it('Skadis pockets: no spacers, plate on the skeleton, 12 mm deep, prints without support', () => {
    const { parts } = run({ back: { fill: 'panel', panelSystem: 'skadis', standoff: 'pockets', standoffMm: 'auto' } })
    expect(parts.some((x) => x.group === 'espacador')).toBe(false)
    const plate = skin(parts, 'BACK')
    expect(plate.size[2]).toBeGreaterThan(5 + 12 - 0.01)
    const pocket = transform(pocketMesh(0, 0, 12, 1.3), mat4RotX(Math.PI))
    expect(bbox(pocket).lo[2]).toBeCloseTo(0)
    expect(isWatertight(pocket)).toBe(true)
    expect(overhangArea(pocket, 44)).toBeLessThan(1e-3)
    const w = transform(plate.mesh, plate.instances[0]!)
    expect(bbox(w).lo[2]).toBeCloseTo(-5)
    expect(bbox(w).hi[2]).toBeCloseTo(12 * 1 - 0, 5)
  })

  it('panel skins use the system thickness', () => {
    expect(skin(run({ left: { fill: 'panel', panelSystem: 'hsw', hswVariant: 'sd' } }).parts, 'LEFT').size[2]).toBeCloseTo(8)
    expect(skin(run({ left: { fill: 'panel', panelSystem: 'hsw', hswVariant: 'hd' } }).parts, 'LEFT').size[2]).toBeCloseTo(10)
    expect(
      skin(run({ left: { fill: 'panel', panelSystem: 'pegboard', standoff: 'none', attach: 'glue' } }).parts, 'LEFT').size[2],
    ).toBeCloseTo(4)
  })

  it('HSW skin (front up) has no overhang beyond 44 deg', () => {
    const { parts } = run({ left: { fill: 'panel', panelSystem: 'hsw', hswVariant: 'hd', standoff: 'none' } })
    expect(overhangArea(skin(parts, 'LEFT').mesh, 44)).toBeLessThan(1e-3)
  })
})
