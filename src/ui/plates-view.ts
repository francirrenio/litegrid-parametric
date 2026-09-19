import { tr } from '../i18n'
import { plateKey, type PlateItem } from '../export'
import { bedPicker } from './bed'
import { append, esc, fmt, h, icon } from './dom'
import { findFreeSpot, footprint, outlinePath, placedOutline, plateIssues, snapCentre, type ItemIssue, type Outline } from './plates-logic'
import type { Store } from './state'

const GROUP_FILL: Record<string, string> = {
  gabinete: '#7b93ad', gaveta: '#2dd4bf', skin: '#2dd4bf', espacador: '#f6b03c', fixacao: '#f6b03c', teste: '#c084fc',
}

/** Parts on the print bed, one bed at a time. Parts can be dragged, turned and moved to another bed. */
export function createPlatesView(st: Store): { el: HTMLElement; refresh: () => void } {
  const el = h('div', { class: 'panePlates', tabindex: '-1' })
  const bar = h('div', { class: 'plates-bar' })
  const stage = h('div', { class: 'plates-stage' })
  const foot = h('div', { class: 'plates-foot' })
  el.append(bar, stage, foot)

  let selKey: string | null = null
  let drag: { key: string; idx: number; sx: number; sy: number; x0: number; y0: number; g: SVGGElement; moved: boolean } | null = null

  const go = (i: number) => {
    const n = st.plates.length
    if (n === 0) return
    st.setView({ plate: Math.min(n - 1, Math.max(0, i)) })
  }

  const curPlate = () => st.plates[Math.min(st.view.plate, st.plates.length - 1)]
  const bedSize = () => ({ x: st.project.printBed.x > 0 ? st.project.printBed.x : 220, y: st.project.printBed.y > 0 ? st.project.printBed.y : 220 })

  const outlineOf = (it: PlateItem): Outline => {
    const part = st.result.parts.find((p) => p.id === it.partId)
    return part ? footprint(part.mesh) : []
  }

  const rotate = (key: string) => {
    const it = curPlate()?.items.find((i) => plateKey(i.partId, i.copy) === key)
    if (it) st.setPlateItem(key, { rotated: !it.rotated })
  }

  const issueText = (it: PlateItem, iss: ItemIssue | undefined, items: PlateItem[], bed: { x: number; y: number }): string[] => {
    const out: string[] = []
    if (it.width > bed.x + 1e-6 || it.depth > bed.y + 1e-6) out.push(tr('Esta peça é maior que a mesa. Use uma mesa maior ou divida a peça.', 'This part is larger than the bed. Use a larger bed or split the part.'))
    else if (iss?.outside) out.push(tr('Esta peça passa do limite da mesa.', 'This part goes past the edge of the bed.'))
    if (iss && iss.overlaps.length > 0) {
      const names = iss.overlaps.slice(0, 2).map((j) => `${items[j]!.label} #${items[j]!.copy}`).join(', ')
      out.push(tr(`Esta peça se sobrepõe a outra (${names}${iss.overlaps.length > 2 ? '…' : ''}).`, `This part overlaps another (${names}${iss.overlaps.length > 2 ? '…' : ''}).`))
    }
    return out
  }

  const drawFoot = () => {
    foot.textContent = ''
    const plate = curPlate()
    if (!plate) return
    const bed = bedSize()
    const items = plate.items
    const issues = plateIssues(items, bed, outlineOf)
    const bad = issues.filter((x) => x.outside || x.overlaps.length > 0).length
    const idx = selKey ? items.findIndex((i) => plateKey(i.partId, i.copy) === selKey) : -1
    if (idx < 0) {
      append(foot, [
        h('span', { class: 'muted' }, tr('Arraste uma peça para movê-la. Toque ou clique numa peça para girar (R) ou levá-la a outra mesa.', 'Drag a part to move it. Tap or click a part to rotate (R) or send it to another bed.')),
        bad > 0 ? h('span', { class: 'chip-sev error', role: 'status' }, `${bad} ${bad === 1 ? tr('peça com problema', 'part with a problem') : tr('peças com problema', 'parts with a problem')} ${tr('(contorno vermelho)', '(red outline)')}`) : null,
      ])
      return
    }
    const it = items[idx]!
    const key = selKey!
    const n = st.plates.length
    const target = h(
      'select',
      {
        'aria-label': tr('Mover para outra mesa', 'Move to another bed'),
        onChange: (e: Event) => {
          const v = Number((e.target as HTMLSelectElement).value)
          if (!v || v === plate.index) return
          const dest = st.plates[v - 1]
          const spot = findFreeSpot(it, dest ? dest.items : [], bed)
          selKey = key
          st.setPlateItem(key, { plate: v, x: spot ? spot[0] : 0, y: spot ? spot[1] : 0 })
          go(v - 1)
        },
      },
      h('option', { value: '' }, tr('Mover para…', 'Move to…')),
      ...Array.from({ length: n + 1 }, (_, k) =>
        h('option', { value: k + 1, disabled: k + 1 === plate.index }, k < n ? tr(`Mover para mesa ${k + 1}`, `Move to bed ${k + 1}`) : tr(`Mover para mesa ${k + 1} (nova)`, `Move to bed ${k + 1} (new)`))),
    )
    target.value = ''
    const msgs = issueText(it, issues[idx], items, bed)
    foot.append(
      h('b', null, `${it.label} #${it.copy}`),
      h('span', { class: 'mono muted' }, `${fmt(it.width)} × ${fmt(it.depth)} mm`),
      h('button', { type: 'button', class: 'btn sm', onClick: () => rotate(key) }, icon('redo', 15), h('span', null, tr('Girar 90° (R)', 'Rotate 90° (R)'))),
      target,
      h('button', { type: 'button', class: 'btn sm ghost', onClick: () => { selKey = null; draw() } }, tr('Soltar seleção', 'Clear selection')),
      ...msgs.map((m) => h('span', { class: 'chip-sev error', role: 'alert' }, m)),
    )
  }

  const draw = () => {
    const plates = st.plates
    bar.textContent = ''
    stage.textContent = ''
    foot.textContent = ''
    if (plates.length === 0 || st.result.parts.length === 0) {
      stage.innerHTML = `<div class="empty"><b>${tr('Nenhuma peça gerada ainda', 'No parts generated yet')}</b><p>${tr('Quando houver peças, elas aparecem aqui distribuídas na mesa de impressão.', 'When there are parts, they appear here laid out on the print bed.')}</p></div>`
      return
    }
    const i = Math.min(st.view.plate, plates.length - 1)
    const plate = plates[i]!
    const bed = bedSize()
    const hasLayout = Object.keys(st.plateLayout).length > 0
    const select = h(
      'select',
      { 'aria-label': tr('Mesa', 'Bed'), onChange: (e: Event) => go(Number((e.target as HTMLSelectElement).value)) },
      plates.map((pl, k) => h('option', { value: k, selected: k === i }, tr(`Mesa ${pl.index}${pl.oversize ? ' (peça grande demais)' : ''}`, `Bed ${pl.index}${pl.oversize ? ' (part too large)' : ''}`))),
    )
    select.value = String(i)
    append(bar, [
      h('button', { type: 'button', class: 'btn sm ghost icon-only', 'aria-label': tr('Mesa anterior', 'Previous bed'), disabled: i === 0, onClick: () => go(i - 1) }, icon('up', 15)),
      select,
      h('button', { type: 'button', class: 'btn sm ghost icon-only', 'aria-label': tr('Próxima mesa', 'Next bed'), disabled: i >= plates.length - 1, onClick: () => go(i + 1) }, icon('down', 15)),
      h('span', { class: 'mono muted' }, `${i + 1} ${tr('de', 'of')} ${plates.length} · ${fmt(bed.x)} × ${fmt(bed.y)} mm · ${plate.items.length} ${plate.items.length === 1 ? tr('peça', 'part') : tr('peças', 'parts')}`),
      plate.oversize ? h('span', { class: 'chip-sev error' }, tr('Maior que a mesa', 'Larger than the bed')) : null,
      h('button', {
        type: 'button', class: 'btn sm', disabled: !selKey || !plate.items.some((it) => plateKey(it.partId, it.copy) === selKey),
        title: tr('Gira a peça selecionada em 90° (tecla R)', 'Rotates the selected part by 90° (R key)'), onClick: () => selKey && rotate(selKey),
      }, icon('redo', 15), h('span', null, tr('Girar 90°', 'Rotate 90°'))),
      h('button', {
        type: 'button', class: 'btn sm', disabled: !hasLayout,
        title: tr('Volta à distribuição automática das peças em todas as mesas', 'Goes back to the automatic layout of the parts on all beds'), onClick: () => { selKey = null; st.resetPlateLayout() },
      }, icon('reset', 15), h('span', null, tr('Reorganizar', 'Rearrange'))),
      bedPicker(st, true),
    ])

    if (plate.items.length === 0) {
      stage.innerHTML = `<div class="empty"><b>${tr('Mesa vazia', 'Empty bed')}</b><p>${tr('Selecione uma peça em outra mesa e use "Mover para…" para trazê-la para cá, ou clique em Reorganizar.', 'Select a part on another bed and use "Move to…" to bring it here, or click Rearrange.')}</p></div>`
      return
    }

    const byId = new Map(st.result.parts.map((p) => [p.id, p]))
    const m = Math.max(bed.x, bed.y) * 0.05
    const fs = Math.max(bed.x, bed.y) * 0.022
    const issues = plateIssues(plate.items, bed, outlineOf)
    const out = [`<svg viewBox="${-m} ${-m} ${bed.x + 2 * m} ${bed.y + 2 * m}" preserveAspectRatio="xMidYMid meet" role="group" aria-label="${tr(`Mesa ${plate.index}`, `Bed ${plate.index}`)}">`]
    out.push(`<rect class="bed" x="0" y="0" width="${bed.x}" height="${bed.y}" rx="${m * 0.3}"/>`)
    plate.items.forEach((it, k) => {
      const key = plateKey(it.partId, it.copy)
      const iss = issues[k]!
      const over = it.width > bed.x || it.depth > bed.y
      const bad = over || iss.outside || iss.overlaps.length > 0
      const fill = GROUP_FILL[byId.get(it.partId)?.group ?? ''] ?? '#7b93ad'
      const label = it.label.length > 22 ? `${it.label.slice(0, 21)}…` : it.label
      const cx = bed.x / 2 + it.x
      const cy = bed.y / 2 - it.y
      const d = outlinePath(placedOutline(outlineOf(it), it), bed)
      const name = tr(`${it.label} #${it.copy}, ${fmt(it.width)} por ${fmt(it.depth)} milímetros`, `${it.label} #${it.copy}, ${fmt(it.width)} by ${fmt(it.depth)} millimetres`)
      out.push(
        `<g class="pitem${bad ? ' bad' : ''}${over ? ' over' : ''}${key === selKey ? ' sel' : ''}" data-i="${k}" data-key="${esc(key)}" tabindex="0" role="button" aria-label="${esc(name)}">` +
          `<title>${esc(it.label)} #${it.copy} · ${fmt(it.width)} × ${fmt(it.depth)} mm</title>` +
          `<path d="${d}" fill="${fill}" fill-rule="evenodd"/>` +
          (it.width > fs * 3 && it.depth > fs * 1.6 ? `<text x="${cx}" y="${cy + fs * 0.35}" text-anchor="middle" style="font-size:${fs}px">${esc(label)}</text>` : '') +
          '</g>',
      )
    })
    out.push(`<text class="cap" x="${bed.x / 2}" y="${bed.y + m * 0.8}" text-anchor="middle" style="font-size:${fs}px">${fmt(bed.x)} mm</text>`)
    out.push('</svg>')
    stage.innerHTML = out.join('')
    drawFoot()
  }

  /* ── pointer interaction (mouse, touch and pen) ── */

  const toBedUnits = (svg: SVGSVGElement, e: PointerEvent): { x: number; y: number } | null => {
    const ctm = svg.getScreenCTM()
    if (!ctm) return null
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }

  const liveIssues = () => {
    const plate = curPlate()
    if (!plate || !drag) return
    const bed = bedSize()
    const dx = drag.g.dataset.dx ? Number(drag.g.dataset.dx) : 0
    const dy = drag.g.dataset.dy ? Number(drag.g.dataset.dy) : 0
    const issues = plateIssues(plate.items, bed, outlineOf, { index: drag.idx, dx, dy: -dy })
    stage.querySelectorAll<SVGGElement>('.pitem').forEach((g) => {
      const k = Number(g.dataset.i)
      const iss = issues[k]
      g.classList.toggle('bad', !!iss && (iss.outside || iss.overlaps.length > 0))
    })
  }

  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    const g = (e.target as Element).closest<SVGGElement>('.pitem')
    const svg = stage.querySelector('svg')
    const plate = curPlate()
    if (!g || !svg || !plate) {
      if (selKey && !g) { selKey = null; drawFoot(); stage.querySelectorAll('.pitem.sel').forEach((n) => n.classList.remove('sel')) }
      return
    }
    const idx = Number(g.dataset.i)
    const it = plate.items[idx]
    const pt = toBedUnits(svg, e)
    if (!it || !pt) return
    e.preventDefault()
    selKey = plateKey(it.partId, it.copy)
    stage.querySelectorAll('.pitem.sel').forEach((n) => n.classList.remove('sel'))
    g.classList.add('sel')
    drag = { key: selKey, idx, sx: pt.x, sy: pt.y, x0: it.x, y0: it.y, g, moved: false }
    try { svg.setPointerCapture(e.pointerId) } catch { /* not supported */ }
    drawFoot()
    el.focus({ preventScroll: true })
  })

  stage.addEventListener('pointermove', (e) => {
    const plate = curPlate()
    const svg = stage.querySelector('svg')
    if (!drag || !plate || !svg) return
    const pt = toBedUnits(svg, e)
    if (!pt) return
    let ddx = pt.x - drag.sx
    let ddy = pt.y - drag.sy
    if (!drag.moved && Math.hypot(ddx, ddy) < 0.8) return
    drag.moved = true
    const it = plate.items[drag.idx]!
    const bed = bedSize()
    const others = plate.items.filter((_, k) => k !== drag!.idx)
    const [nx, ny] = snapCentre(it, drag.x0 + ddx, drag.y0 - ddy, others, bed)
    ddx = nx - drag.x0
    ddy = -(ny - drag.y0)
    drag.g.setAttribute('transform', `translate(${ddx} ${ddy})`)
    drag.g.dataset.dx = String(ddx)
    drag.g.dataset.dy = String(ddy)
    liveIssues()
  })

  const endDrag = (e: PointerEvent, commit: boolean) => {
    const d = drag
    drag = null
    const svg = stage.querySelector('svg')
    try { svg?.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
    if (!d) return
    if (commit && d.moved) {
      const dx = Number(d.g.dataset.dx ?? 0)
      const dy = Number(d.g.dataset.dy ?? 0)
      st.setPlateItem(d.key, { x: d.x0 + dx, y: d.y0 - dy })
    } else draw()
  }
  stage.addEventListener('pointerup', (e) => endDrag(e, true))
  stage.addEventListener('pointercancel', (e) => endDrag(e, false))
  stage.addEventListener('contextmenu', (e) => e.preventDefault())

  el.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement
    if (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') return
    const plate = curPlate()
    if (!plate) return
    const focusedKey = t.closest?.('.pitem')?.getAttribute('data-key')
    const key = focusedKey ?? selKey
    if (!key) return
    const it = plate.items.find((i) => plateKey(i.partId, i.copy) === key)
    if (!it) return
    if (e.key === 'Enter' || e.key === ' ') {
      if (focusedKey) { e.preventDefault(); selKey = focusedKey; draw() }
      return
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault()
      selKey = key
      rotate(key)
      return
    }
    const step = e.shiftKey ? 10 : 1
    const mv: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }
    const v = mv[e.key]
    if (v) {
      e.preventDefault()
      selKey = key
      st.setPlateItem(key, { x: it.x + v[0], y: it.y + v[1] })
      requestAnimationFrame(() => stage.querySelector<SVGGElement>(`.pitem[data-key="${CSS.escape(key)}"]`)?.focus({ preventScroll: true }))
    }
  })

  draw()
  return { el, refresh: () => { if (!drag) draw() } }
}
