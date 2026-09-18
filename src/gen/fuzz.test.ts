import { describe, expect, it, vi } from 'vitest'
import { computeLayout, type Section } from '../core/layout'
import { deriveNozzle } from '../core/nozzle'
import { isWatertight } from '../geom/mesh'
import { defaultProject } from '../model/defaults'
import { generateCabinetParts } from './cabinet'
import { layoutInput } from './index'

vi.setConfig({ testTimeout: 240000 })

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

describe('cabinet fuzz', () => {
  it('never throws and always yields closed meshes for random valid projects', () => {
    const r = rng(42)
    const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]!
    for (let i = 0; i < 25; i++) {
      const sections: Section[] = Array.from({ length: 1 + Math.floor(r() * 3) }, () => ({
        width: r() < 0.3 ? 40 + Math.round(r() * 60) : 'auto',
        rows: Array.from({ length: 1 + Math.floor(r() * 4) }, () => ({
          height: r() < 0.3 ? 25 + Math.round(r() * 40) : 'auto',
          divisions: 1 + Math.floor(r() * 3),
          load: pick(['leve', 'media', 'pesada'] as const),
        })),
      }))
      const p = defaultProject({
        nozzle: pick([0.25, 0.4, 0.6, 0.8]),
        width: 160 + Math.round(r() * 260),
        height: 120 + Math.round(r() * 200),
        depth: 80 + Math.round(r() * 160),
        materialLevel: pick(['minimo', 'equilibrado', 'reforcado'] as const),
        cabinetMode: pick(['skeleton', 'skeleton', 'monolithic'] as const),
        skeleton: { perimeters: pick([2, 3, 4]), barWidth: 'auto', bracing: pick(['auto', 'none', 'corners', 'diagonal', 'back'] as const) },
        printBed: { x: pick([180, 220, 256, 350]), y: pick([180, 220, 256, 350]) },
        sections,
      })
      const layout = computeLayout(layoutInput(p))
      if (layout.bays.length === 0) continue
      const parts = generateCabinetParts(p, layout, deriveNozzle(p.nozzle, p.advanced))
      expect(parts.length, `case ${i}`).toBeGreaterThan(0)
      if (p.cabinetMode === 'skeleton') for (const part of parts) expect(isWatertight(part.mesh), `case ${i} ${part.label}`).toBe(true)
    }
  })
})
