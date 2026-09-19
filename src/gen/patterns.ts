import { polyArea, regularPolygon, type Vec2 } from '../geom/mesh'
import type { HolePattern } from '../model/types'
import { tr } from '../i18n'

export interface PatternRequest {
  pattern: HolePattern
  /** Face size in its own plane (origin at the lower-left corner). */
  width: number
  height: number
  /** Target open area, 0–100 %. */
  openPercent: number
  /** Minimum solid web between holes (mm). */
  web: number
  /** Solid border around the face (mm). */
  frame: number
  /** Holes only above this height (mm). */
  solidUpTo: number
  /** Largest inscribed hole size allowed (mm); usually the smallest stored item. */
  maxHole: number
  /**
   * Preferred hole size (mm). With a thin web the target openness would need tiny holes; instead the web grows so
   * holes reach this size (same material, far fewer holes). Never exceeds maxHole.
   */
  holeSize?: number
  /**
   * True when the face is printed standing up (holes are horizontal): use overhang-safe shapes
   * (pointed roofs, no long bridges). False for faces printed flat: any shape works.
   */
  upright: boolean
}

export interface PatternResult {
  holes: Vec2[][]
  /** Achieved open fraction of the whole face (0–1). */
  openFraction: number
  /** Inscribed hole size actually used (mm). */
  holeSize: number
  warnings: string[]
}

const SQRT3 = Math.sqrt(3)
const MAX_BRIDGE = 8

interface Rect { x0: number; y0: number; x1: number; y1: number }

function inside(pts: Vec2[], r: Rect): boolean {
  for (const [x, y] of pts) if (x < r.x0 - 1e-6 || x > r.x1 + 1e-6 || y < r.y0 - 1e-6 || y > r.y1 + 1e-6) return false
  return true
}

function centreOn(holes: Vec2[][], r: Rect): Vec2[][] {
  if (holes.length === 0) return holes
  let lx = Infinity, hx = -Infinity, ly = Infinity, hy = -Infinity
  for (const h of holes) for (const [x, y] of h) { lx = Math.min(lx, x); hx = Math.max(hx, x); ly = Math.min(ly, y); hy = Math.max(hy, y) }
  const dx = (r.x0 + r.x1) / 2 - (lx + hx) / 2
  const dy = (r.y0 + r.y1) / 2 - (ly + hy) / 2
  return holes.map((h) => h.map(([x, y]) => [x + dx, y + dy] as Vec2))
}

function teardrop(cx: number, cy: number, r: number, seg = 14): Vec2[] {
  const pts: Vec2[] = []
  for (let k = 0; k <= seg; k++) {
    const a = ((135 + (270 * k) / seg) * Math.PI) / 180
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  pts.push([cx, cy + r * Math.SQRT2])
  return pts
}

function hexagon(cx: number, cy: number, across: number): Vec2[] {
  return regularPolygon(cx, cy, across / SQRT3, 6, Math.PI / 2)
}

function lattice(rect: Rect, pitchX: number, pitchY: number, rowOffset: number, shape: (cx: number, cy: number) => Vec2[]): Vec2[][] {
  const holes: Vec2[][] = []
  const cx0 = (rect.x0 + rect.x1) / 2
  const cy0 = (rect.y0 + rect.y1) / 2
  const nx = Math.ceil((rect.x1 - rect.x0) / pitchX) + 2
  const ny = Math.ceil((rect.y1 - rect.y0) / pitchY) + 2
  for (let j = -ny; j <= ny; j++) {
    const off = (((j % 2) + 2) % 2) * rowOffset
    for (let i = -nx; i <= nx; i++) {
      const poly = shape(cx0 + i * pitchX + off, cy0 + j * pitchY)
      if (inside(poly, rect)) holes.push(poly)
    }
  }
  return holes
}

export function generatePattern(req: PatternRequest): PatternResult {
  if (req.pattern === 'hexagon' && req.upright) return uprightHexagons(req)
  const warnings: string[] = []
  const frame = Math.max(0, req.frame)
  const rect: Rect = {
    x0: frame,
    y0: Math.max(frame, req.solidUpTo),
    x1: req.width - frame,
    y1: req.height - frame,
  }
  const empty: PatternResult = { holes: [], openFraction: 0, holeSize: 0, warnings }
  if (rect.x1 - rect.x0 < req.web * 2 || rect.y1 - rect.y0 < req.web * 2 || req.openPercent <= 0) return empty

  let web = Math.max(req.web, 0.1)
  const f = Math.min(Math.max(req.openPercent / 100, 0.01), 0.85)
  if (req.holeSize) {
    const s0 = sizeForWeb(req.pattern, web, f)
    const target = Math.min(req.holeSize, req.maxHole)
    if (s0 > 0 && s0 < target) web *= target / s0
  }
  let holes: Vec2[][] = []
  let size = 0

  if (req.pattern === 'hexagon') {
    const r = Math.sqrt(f)
    size = Math.min((web * r) / (1 - r), req.maxHole)
    const pitch = size + web
    holes = lattice(rect, pitch, (pitch * SQRT3) / 2, pitch / 2, (cx, cy) => hexagon(cx, cy, size))
  } else if (req.pattern === 'diamond') {
    const r = Math.sqrt(f)
    size = Math.min((web * r) / (1 - r), req.maxHole)
    const pitch = Math.SQRT2 * (size + web)
    const h = size / Math.SQRT2
    const shape = (cx: number, cy: number): Vec2[] => [[cx - h, cy], [cx, cy - h], [cx + h, cy], [cx, cy + h]]
    holes = lattice(rect, pitch, pitch, 0, shape).concat(
      lattice(rect, pitch, pitch, 0, (cx, cy) => shape(cx + pitch / 2, cy + pitch / 2)),
    )
    holes = dedupeOverlapping(holes)
  } else if (req.pattern === 'circle') {
    const cover = Math.min(f, 0.85)
    const r = Math.sqrt((cover * 2 * SQRT3) / Math.PI)
    size = Math.min((web * Math.min(r, 0.97)) / (1 - Math.min(r, 0.97)), req.maxHole)
    const pitch = size + web
    const rad = size / 2
    holes = lattice(rect, pitch, (pitch * SQRT3) / 2, pitch / 2, (cx, cy) =>
      req.upright ? teardrop(cx, cy - rad * 0.2, rad) : regularPolygon(cx, cy, rad, 20),
    )
  } else {
    const root = Math.sqrt(f)
    const cell = (2 * SQRT3 * web) / (1 - root)
    const hole = cell - 2 * SQRT3 * web
    size = Math.min(hole / SQRT3, req.maxHole)
    const l = Math.min(hole, size * SQRT3)
    const cellSide = l + 2 * SQRT3 * web
    const hgt = (cellSide * SQRT3) / 2
    const skipDown = req.upright && l > MAX_BRIDGE
    if (skipDown) warnings.push(tr(`Triângulos de ${l.toFixed(1)} mm: os de ponta para baixo foram omitidos (ponte longa demais para imprimir de pé).`, `${l.toFixed(1)} mm triangles: the downward-pointing ones were omitted (bridge too long to print standing).`))
    const tri = (cx: number, cy: number, up: boolean): Vec2[] => {
      const rr = l / SQRT3
      const a0 = up ? Math.PI / 2 : -Math.PI / 2
      return regularPolygon(cx, cy, rr, 3, a0)
    }
    const nx = Math.ceil((rect.x1 - rect.x0) / cellSide) + 2
    const ny = Math.ceil((rect.y1 - rect.y0) / hgt) + 2
    const cx0 = (rect.x0 + rect.x1) / 2
    const cy0 = (rect.y0 + rect.y1) / 2
    for (let j = -ny; j <= ny; j++) {
      const shift = (((j % 2) + 2) % 2) * (cellSide / 2)
      for (let i = -nx; i <= nx; i++) {
        const x0 = cx0 + i * cellSide + shift
        const y0 = cy0 + j * hgt
        const up = tri(x0 + cellSide / 2, y0 + hgt / 3, true)
        if (inside(up, rect)) holes.push(up)
        if (!skipDown) {
          const down = tri(x0 + cellSide, y0 + (2 * hgt) / 3, false)
          if (inside(down, rect)) holes.push(down)
        }
      }
    }
  }

  if (req.pattern === 'diamond' && holes.length === 0) return empty
  holes = centreOn(holes, rect)
  const area = holes.reduce((s, h) => s + Math.abs(polyArea(h)), 0)
  const openFraction = area / (req.width * req.height)
  if (size >= req.maxHole - 1e-6) {
    warnings.push(tr(`Furos limitados a ${req.maxHole} mm (menor item): abertura real de ${(openFraction * 100).toFixed(0)} %.`, `Holes limited to ${req.maxHole} mm (smallest item): actual opening of ${(openFraction * 100).toFixed(0)} %.`))
  }
  return { holes, openFraction, holeSize: size, warnings }
}

function dedupeOverlapping(holes: Vec2[][]): Vec2[][] {
  const seen = new Set<string>()
  return holes.filter((h) => {
    const cx = h.reduce((s, p) => s + p[0], 0) / h.length
    const cy = h.reduce((s, p) => s + p[1], 0) / h.length
    const k = `${cx.toFixed(3)},${cy.toFixed(3)}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/**
 * Hexagons on a standing face: flat-top (vertices left/right) so the roof is a short horizontal bridge plus two
 * 60° edges. A vertex-up hexagon would have 30° roofs, which need support. Built by transposing a flat-lying lattice.
 */
function uprightHexagons(req: PatternRequest): PatternResult {
  const frame = Math.max(0, req.frame)
  const minY = Math.max(frame, req.solidUpTo)
  const inner = generatePattern({ ...req, width: req.height, height: req.width, solidUpTo: 0, upright: false })
  const holes = inner.holes
    .map((h) => h.map(([x, y]) => [y, x] as Vec2))
    .filter((h) => h.every(([, y]) => y >= minY - 1e-6))
  const area = holes.reduce((a, h) => a + Math.abs(polyArea(h)), 0)
  const warnings = inner.warnings.slice()
  const side = inner.holeSize / SQRT3
  if (side > MAX_BRIDGE) warnings.push(tr(`Hexágonos de ${inner.holeSize.toFixed(1)} mm: o topo horizontal de ${side.toFixed(1)} mm é uma ponte longa para imprimir de pé.`, `${inner.holeSize.toFixed(1)} mm hexagons: the ${side.toFixed(1)} mm horizontal top is a long bridge to print standing.`))
  return { holes, openFraction: area / (req.width * req.height), holeSize: inner.holeSize, warnings }
}

function sizeForWeb(pattern: HolePattern, web: number, f: number): number {
  const root = Math.sqrt(f)
  switch (pattern) {
    case 'triangle': return (2 * web * root) / (1 - root)
    case 'circle': {
      const r = Math.min(Math.sqrt((f * 2 * SQRT3) / Math.PI), 0.97)
      return (web * r) / (1 - r)
    }
    default: return (web * root) / (1 - root)
  }
}
