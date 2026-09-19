import { describe, expect, it } from 'vitest'
import { BED_PRESETS, CUSTOM_BED, bedPresetId } from './beds'

describe('bed presets', () => {
  it('recognises a preset by size or id and falls back to custom', () => {
    expect(bedPresetId({ x: 220, y: 220 })).toBe('ender220')
    expect(bedPresetId({ x: 256, y: 256, preset: 'bambu256' })).toBe('bambu256')
    expect(bedPresetId({ x: 123, y: 321 })).toBe(CUSTOM_BED)
  })

  it('keeps custom when chosen explicitly, even if the size matches a preset', () => {
    expect(bedPresetId({ x: 220, y: 220, preset: CUSTOM_BED })).toBe(CUSTOM_BED)
  })

  it('has unique ids and sane sizes', () => {
    expect(new Set(BED_PRESETS.map((b) => b.id)).size).toBe(BED_PRESETS.length)
    for (const b of BED_PRESETS) {
      expect(b.x).toBeGreaterThanOrEqual(100)
      expect(b.y).toBeGreaterThanOrEqual(100)
    }
  })
})
