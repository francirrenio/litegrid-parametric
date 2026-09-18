export interface NozzleOverrides {
  extrusionFactor?: number
  layerHeight?: number
}

export interface Nozzle {
  nozzle: number
  lineWidth: number
  layerHeight: number
  perimeterSpacing: number
  wall: (perimeters: number) => number
}

const DEFAULT_EXTRUSION_FACTOR = 1.125
const LAYER_RATIO = 0.65
const LAYER_STEP = 0.04

export function deriveNozzle(nozzle: number, overrides: NozzleOverrides = {}): Nozzle {
  if (!(nozzle > 0)) throw new RangeError('nozzle must be positive')
  const lineWidth = nozzle * (overrides.extrusionFactor ?? DEFAULT_EXTRUSION_FACTOR)
  const layerHeight =
    overrides.layerHeight ?? Math.round((nozzle * LAYER_RATIO) / LAYER_STEP) * LAYER_STEP
  // Adjacent perimeters overlap by the rounded-edge area, so they sit closer than one line width.
  const perimeterSpacing = lineWidth - layerHeight * (1 - Math.PI / 4)
  return {
    nozzle,
    lineWidth,
    layerHeight,
    perimeterSpacing,
    wall: (n) => {
      if (!Number.isInteger(n) || n < 1) throw new RangeError('perimeters must be an integer >= 1')
      return lineWidth + (n - 1) * perimeterSpacing
    },
  }
}
