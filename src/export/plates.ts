import { rotateZ, translate } from '../geom/mesh'
import type { Part } from '../model/part'
import type { NamedMesh } from './stl'

export interface PlateItem {
  partId: string
  label: string
  copy: number
  /** Position of the part's centre on the bed (bed centre = 0,0). */
  x: number
  y: number
  width: number
  depth: number
  /** Turned 90° about Z to fit the bed (width/depth already swapped). */
  rotated?: boolean
}

export interface Plate {
  index: number
  items: PlateItem[]
  /** A part larger than the bed still gets its own plate, flagged here. */
  oversize: boolean
}

const GAP = 4

interface Shelf {
  y: number
  h: number
  x: number
}

/** Packs every copy of every part onto beds with a simple shelf algorithm (largest first). */
export function planPlates(parts: Part[], bed: { x: number; y: number }): Plate[] {
  const list: PlateItem[] = []
  for (const part of parts) {
    for (let c = 0; c < part.instances.length; c++) {
      list.push({ partId: part.id, label: part.label, copy: c + 1, x: 0, y: 0, width: part.size[0], depth: part.size[1] })
    }
  }
  list.sort((a, b) => b.width * b.depth - a.width * a.depth)
  const plates: Plate[] = []
  let cur: { plate: Plate; shelves: Shelf[] } | undefined

  const fresh = () => {
    const c = { plate: { index: plates.length + 1, items: [] as PlateItem[], oversize: false }, shelves: [] as Shelf[] }
    plates.push(c.plate)
    return c
  }
  const place = (it: PlateItem, c: { plate: Plate; shelves: Shelf[] }): boolean => {
    for (const s of c.shelves) {
      if (it.depth <= s.h && s.x + it.width <= bed.x) {
        it.x = s.x + it.width / 2
        it.y = s.y + it.depth / 2
        s.x += it.width + GAP
        c.plate.items.push(it)
        return true
      }
    }
    const last = c.shelves[c.shelves.length - 1]
    const top = last ? last.y + last.h + GAP : 0
    if (top + it.depth <= bed.y && it.width <= bed.x) {
      c.shelves.push({ y: top, h: it.depth, x: it.width + GAP })
      it.x = it.width / 2
      it.y = top + it.depth / 2
      c.plate.items.push(it)
      return true
    }
    return false
  }

  for (const it of list) {
    if ((it.width > bed.x || it.depth > bed.y) && it.depth <= bed.x && it.width <= bed.y) {
      ;[it.width, it.depth] = [it.depth, it.width]
      it.rotated = true
    }
    if (it.width > bed.x || it.depth > bed.y) {
      const c = fresh()
      it.x = it.width / 2
      it.y = it.depth / 2
      c.plate.items.push(it)
      c.plate.oversize = true
      continue
    }
    if (!cur || !place(it, cur)) {
      cur = fresh()
      place(it, cur)
    }
  }
  for (const pl of plates) {
    // Centre the whole group of parts on the bed (a lone part sits exactly in the middle).
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const it of pl.items) {
      x0 = Math.min(x0, it.x - it.width / 2)
      x1 = Math.max(x1, it.x + it.width / 2)
      y0 = Math.min(y0, it.y - it.depth / 2)
      y1 = Math.max(y1, it.y + it.depth / 2)
    }
    const dx = -(x0 + x1) / 2
    const dy = -(y0 + y1) / 2
    for (const it of pl.items) {
      it.x += dx
      it.y += dy
    }
  }
  return plates
}

export function plateMeshes(plate: Plate, parts: Part[]): NamedMesh[] {
  const byId = new Map(parts.map((p) => [p.id, p]))
  return plate.items.map((it) => {
    const base = byId.get(it.partId)!.mesh
    return { name: `${it.label} #${it.copy}`, mesh: translate(it.rotated ? rotateZ(base, Math.PI / 2) : base, it.x, it.y, 0) }
  })
}
