import { tr } from '../i18n'

export interface BedPreset {
  id: string
  name: string
  x: number
  y: number
}

/** Common print bed sizes (mm). Anything else is entered as a custom size. */
export const BED_PRESETS: BedPreset[] = [
  { id: 'mini180', name: '180 × 180 · Bambu A1 mini', x: 180, y: 180 },
  { id: 'ender220', name: '220 × 220 · Ender 3, Creality K1', x: 220, y: 220 },
  { id: 'prusa250', name: tr('250 × 210 · Prusa MK3 e MK4', '250 × 210 · Prusa MK3 and MK4'), x: 250, y: 210 },
  { id: 'voron250', name: '250 × 250 · Voron 2.4 (250)', x: 250, y: 250 },
  { id: 'bambu256', name: tr('256 × 256 · Bambu A1, P1S e X1', '256 × 256 · Bambu A1, P1S and X1'), x: 256, y: 256 },
  { id: 'cr10300', name: '300 × 300 · CR-10, Voron 2.4 (300)', x: 300, y: 300 },
  { id: 'big350', name: '350 × 350 · Ender 5 Plus, Voron 2.4 (350)', x: 350, y: 350 },
  { id: 'max420', name: '420 × 420 · Elegoo Neptune 4 Max', x: 420, y: 420 },
]

export const CUSTOM_BED = 'custom'

export interface BedLike {
  x: number
  y: number
  preset?: string
}

/** Preset id for the bed, or 'custom' when chosen so or when no preset has these dimensions. */
export function bedPresetId(bed: BedLike): string {
  if (bed.preset === CUSTOM_BED) return CUSTOM_BED
  const byId = BED_PRESETS.find((b) => b.id === bed.preset)
  if (byId && byId.x === bed.x && byId.y === bed.y) return byId.id
  return BED_PRESETS.find((b) => b.x === bed.x && b.y === bed.y)?.id ?? CUSTOM_BED
}
