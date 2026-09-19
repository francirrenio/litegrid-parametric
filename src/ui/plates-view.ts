import { bedPicker } from './bed'
import { append, esc, fmt, h, icon } from './dom'
import type { Store } from './state'

const GROUP_FILL: Record<string, string> = {
  gabinete: '#7b93ad', gaveta: '#2dd4bf', skin: '#2dd4bf', espacador: '#f6b03c', fixacao: '#f6b03c', teste: '#c084fc',
}

/** Parts on the print bed, one bed at a time. */
export function createPlatesView(st: Store): { el: HTMLElement; refresh: () => void } {
  const el = h('div', { class: 'panePlates' })
  const bar = h('div', { class: 'plates-bar' })
  const stage = h('div', { class: 'plates-stage' })
  el.append(bar, stage)

  const go = (i: number) => {
    const n = st.plates.length
    if (n === 0) return
    st.setView({ plate: Math.min(n - 1, Math.max(0, i)) })
  }

  const draw = () => {
    const plates = st.plates
    bar.textContent = ''
    stage.textContent = ''
    if (plates.length === 0) {
      stage.innerHTML = '<div class="empty"><b>Nenhuma peça gerada ainda</b><p>Quando houver peças, elas aparecem aqui distribuídas na mesa de impressão.</p></div>'
      return
    }
    const i = Math.min(st.view.plate, plates.length - 1)
    const plate = plates[i]!
    const bed = st.project.printBed
    const select = h(
      'select',
      { 'aria-label': 'Mesa', onChange: (e: Event) => go(Number((e.target as HTMLSelectElement).value)) },
      plates.map((pl, k) => h('option', { value: k, selected: k === i }, `Mesa ${pl.index}${pl.oversize ? ' (peça grande demais)' : ''}`)),
    )
    select.value = String(i)
    append(bar, [
      h('button', { type: 'button', class: 'btn sm ghost icon-only', 'aria-label': 'Mesa anterior', disabled: i === 0, onClick: () => go(i - 1) }, icon('up', 15)),
      select,
      h('button', { type: 'button', class: 'btn sm ghost icon-only', 'aria-label': 'Próxima mesa', disabled: i >= plates.length - 1, onClick: () => go(i + 1) }, icon('down', 15)),
      h('span', { class: 'mono muted' }, `${i + 1} de ${plates.length} · ${fmt(bed.x)} × ${fmt(bed.y)} mm · ${plate.items.length} ${plate.items.length === 1 ? 'peça' : 'peças'}`),
      plate.oversize ? h('span', { class: 'chip-sev error' }, 'Maior que a mesa') : null,
      bedPicker(st, true),
    ])

    const byId = new Map(st.result.parts.map((p) => [p.id, p]))
    const m = Math.max(bed.x, bed.y) * 0.05
    const fs = Math.max(bed.x, bed.y) * 0.022
    const out = [`<svg viewBox="${-m} ${-m} ${bed.x + 2 * m} ${bed.y + 2 * m}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Mesa ${plate.index}">`]
    out.push(`<rect class="bed" x="0" y="0" width="${bed.x}" height="${bed.y}" rx="${m * 0.3}"/>`)
    for (const it of plate.items) {
      const x = bed.x / 2 + it.x - it.width / 2
      const y = bed.y / 2 - it.y - it.depth / 2
      const over = it.width > bed.x || it.depth > bed.y
      const fill = GROUP_FILL[byId.get(it.partId)?.group ?? ''] ?? '#7b93ad'
      const label = it.label.length > 22 ? `${it.label.slice(0, 21)}…` : it.label
      out.push(
        `<g class="pitem${over ? ' over' : ''}"><title>${esc(it.label)} #${it.copy} · ${fmt(it.width)} × ${fmt(it.depth)} mm</title>` +
          `<rect x="${x}" y="${y}" width="${it.width}" height="${it.depth}" fill="${fill}"/>` +
          (it.width > fs * 3 && it.depth > fs * 1.6 ? `<text x="${x + it.width / 2}" y="${y + it.depth / 2 + fs * 0.35}" text-anchor="middle" style="font-size:${fs}px">${esc(label)}</text>` : '') +
          '</g>',
      )
    }
    out.push(`<text class="cap" x="${bed.x / 2}" y="${bed.y + m * 0.8}" text-anchor="middle" style="font-size:${fs}px">${fmt(bed.x)} mm</text>`)
    out.push('</svg>')
    stage.innerHTML = out.join('')
  }
  draw()
  return { el, refresh: draw }
}
