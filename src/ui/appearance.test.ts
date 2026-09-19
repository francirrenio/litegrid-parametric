import { describe, expect, it } from 'vitest'
import { ALL_VISIBLE, anyHidden, GROUP_DEFAULT, isInstanceVisible, partColor, type Visibility } from './appearance'

const part = { id: 'gaveta-1', group: 'gaveta' as const, color: undefined }

describe('part colours', () => {
  it('prefers the part override, then the group override, then the built-in colour', () => {
    expect(partColor(undefined, part)).toBe(GROUP_DEFAULT.gaveta)
    expect(partColor({ groups: { gaveta: '#111111' }, parts: {} }, part)).toBe('#111111')
    expect(partColor({ groups: { gaveta: '#111111' }, parts: { 'gaveta-1': '#222222' } }, part)).toBe('#222222')
  })

  it('a skin keeps the colour chosen for it until overridden', () => {
    expect(partColor(undefined, { id: 's', group: 'skin', color: '#abcdef' })).toBe('#abcdef')
    expect(partColor({ groups: { skin: '#010203' }, parts: {} }, { id: 's', group: 'skin', color: '#abcdef' })).toBe('#010203')
  })
})

describe('visibility', () => {
  it('shows everything by default', () => {
    expect(isInstanceVisible(ALL_VISIBLE, 'gaveta', 'g', 3)).toBe(true)
    expect(anyHidden(ALL_VISIBLE)).toBe(false)
  })

  it('hides by group and by part', () => {
    const v: Visibility = { ...ALL_VISIBLE, hiddenGroups: ['gaveta'], hiddenParts: ['quadro-1'] }
    expect(isInstanceVisible(v, 'gaveta', 'g', 0)).toBe(false)
    expect(isInstanceVisible(v, 'gabinete', 'quadro-1', 0)).toBe(false)
    expect(isInstanceVisible(v, 'gabinete', 'costas', 0)).toBe(true)
    expect(anyHidden(v)).toBe(true)
  })

  it('isolating shows one copy of one part type, or all its copies', () => {
    const one: Visibility = { ...ALL_VISIBLE, isolate: 'g', isolateOne: true }
    expect(isInstanceVisible(one, 'gaveta', 'g', 0)).toBe(true)
    expect(isInstanceVisible(one, 'gaveta', 'g', 1)).toBe(false)
    expect(isInstanceVisible(one, 'gaveta', 'x', 0)).toBe(false)
    const all: Visibility = { ...one, isolateOne: false }
    expect(isInstanceVisible(all, 'gaveta', 'g', 4)).toBe(true)
  })

  it('isolating wins over hidden groups', () => {
    const v: Visibility = { hiddenGroups: ['gaveta'], hiddenParts: [], isolate: 'g', isolateOne: false }
    expect(isInstanceVisible(v, 'gaveta', 'g', 0)).toBe(true)
  })
})

describe('hidden drawers in a bay', () => {
  it('finds what is hidden at a bay and how to bring it back', async () => {
    const { generate } = await import('../gen')
    const { defaultProject } = await import('../model/defaults')
    const { hiddenInBay, partsInBay } = await import('./bayparts')
    const r = generate(defaultProject())
    const bay = r.layout.bays[0]!
    const here = partsInBay(r, bay.id)
    expect(here.length).toBeGreaterThan(0)
    const drawer = here.find((x) => x.label.startsWith('Gaveta'))!
    expect(hiddenInBay(r, ALL_VISIBLE, bay.id)).toEqual([])
    const hiddenPart = hiddenInBay(r, { ...ALL_VISIBLE, hiddenParts: [drawer.id] }, bay.id)
    expect(hiddenPart.map((e) => e.kind)).toContain('part')
    const hiddenGroup = hiddenInBay(r, { ...ALL_VISIBLE, hiddenGroups: ['gaveta'] }, bay.id)
    expect(hiddenGroup.map((e) => e.kind)).toContain('group')
    const isolated = hiddenInBay(r, { ...ALL_VISIBLE, isolate: 'costas-1', isolateOne: false }, bay.id)
    expect(isolated.map((e) => e.kind)).toEqual(['all'])
  })
})
