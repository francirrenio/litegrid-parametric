import { describe, expect, it } from 'vitest'
import { generate } from '.'
import { defaultProject } from '../model/defaults'

describe('skin wall thickness', () => {
  it('changes the skin plate thickness', () => {
    const make = (thickness: number | 'auto') => {
      const p = defaultProject({ printBed: { x: 500, y: 500 } })
      p.skins.left = { ...p.skins.left, enabled: true, fill: 'closed', thickness }
      return generate(p).parts.find((x) => x.label.startsWith('Skin'))!
    }
    const thin = make(1)
    const thick = make(4)
    expect(thick.size[2]).toBeGreaterThan(thin.size[2]! + 2)
  })
})
