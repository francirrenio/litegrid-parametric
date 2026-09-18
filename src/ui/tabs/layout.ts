import type { Size } from '../../core/layout'
import type { Load } from '../../model/types'
import { h, fmt } from '../dom'
import { accordion, autoField, btn, chips, group, iconBtn, numField, pathModel } from '../fields'
import { severityOf, tabOfWarning, type Store } from '../state'
import type { TabView } from './common'

const sumFixed = (a: Size[]) => a.reduce<number>((s, v) => s + (v === 'auto' ? 0 : v), 0)
const autos = (a: Size[]) => a.filter((v) => v === 'auto').length

function usage(label: string, sizes: Size[], available: number): { text: string; over: boolean } {
  const used = sumFixed(sizes)
  const n = autos(sizes)
  const over = used > available + 1e-6
  const rest = available - used
  const tail = n > 0 ? `; ${n} auto dividem ${fmt(Math.max(0, rest), 1)} mm` : rest > 1e-6 ? `; sobram ${fmt(rest, 1)} mm` : ''
  return { text: `${label}: usado ${fmt(used, 1)} de ${fmt(available, 1)} mm${tail}`, over }
}

export function layoutTab(st: Store): TabView {
  const pm = <T,>(p: string) => pathModel<T>(st, p)
  const p = st.project
  const usageEls: Array<{ el: HTMLElement; calc: () => { text: string; over: boolean } }> = []
  const track = (calc: () => { text: string; over: boolean }) => {
    const el = h('p', { class: 'usage' })
    usageEls.push({ el, calc })
    return el
  }
  const wall = () => st.result.layout.wallStructural

  const secTotal = track(() => {
    const t = wall()
    const n = st.project.sections.length
    return usage('Larguras das seções', st.project.sections.map((s) => s.width), st.project.width - 2 * t - Math.max(0, n - 1) * t)
  })

  const sel = st.sel.bay
  const banner = sel
    ? h(
        'div',
        { class: 'banner' },
        h('span', null, 'Gaveta selecionada: ', h('b', { class: 'mono' }, sel)),
        btn('Editar gaveta', () => st.setSideTab('gavetas'), { sm: true }),
        btn('Limpar', () => st.selectBay(null), { sm: true, kind: 'ghost' }),
      )
    : null

  const sections = p.sections.map((s, si) => {
    const nRows = s.rows.length
    const rowUsage = track(() => {
      const t = wall()
      const sec = st.project.sections[si]
      if (!sec) return { text: '', over: false }
      return usage('Alturas das filas', sec.rows.map((r) => r.height), st.project.height - 2 * t - Math.max(0, sec.rows.length - 1) * t)
    })
    const rows = s.rows.map((_, ri) => {
      const base = `sections.${si}.rows.${ri}`
      return h(
        'div',
        { class: 'row-card' },
        h(
          'div',
          { class: 'row-head' },
          h('b', null, `Fila ${ri + 1}`),
          h(
            'span',
            { class: 'acts' },
            iconBtn('up', 'Subir fila', () => st.moveRow(si, ri, -1), ri === 0),
            iconBtn('down', 'Descer fila', () => st.moveRow(si, ri, 1), ri === nRows - 1),
            iconBtn('copy', 'Duplicar fila', () => st.duplicateRow(si, ri)),
            iconBtn('trash', 'Remover fila', () => st.removeRow(si, ri), nRows <= 1),
          ),
        ),
        autoField(pm<number | 'auto'>(`${base}.height`), 'Altura', { min: 5, max: 1000, unit: 'mm', fallback: 40 }),
        numField(pm<number>(`${base}.divisions`), 'Divisões', { min: 1, max: 20, slider: true, sliderMax: 10 }),
        chips<Load>(pm(`${base}.load`), 'Carga', [['leve', 'Leve'], ['media', 'Média'], ['pesada', 'Pesada']]),
      )
    })
    const widthLabel = s.width === 'auto' ? 'auto' : `${fmt(s.width, 1)} mm`
    return accordion(
      [`Seção ${si + 1}`, h('span', { class: 'acc-meta' }, `${widthLabel} · ${nRows} ${nRows === 1 ? 'fila' : 'filas'}`)],
      [
        h(
          'div',
          { class: 'acts wide' },
          iconBtn('up', 'Mover para a esquerda', () => st.moveSection(si, -1), si === 0),
          iconBtn('down', 'Mover para a direita', () => st.moveSection(si, 1), si === p.sections.length - 1),
          btn('Duplicar', () => st.duplicateSection(si), { icon: 'copy', sm: true }),
          btn('Remover', () => st.removeSection(si), { icon: 'trash', sm: true, kind: 'danger', disabled: p.sections.length <= 1 }),
        ),
        autoField(pm<number | 'auto'>(`sections.${si}.width`), 'Largura da seção', { min: 20, max: 2000, unit: 'mm', fallback: 100 }),
        rowUsage,
        ...rows,
        btn('Adicionar fila', () => st.addRow(si), { icon: 'plus', sm: true }),
      ],
      { key: `sec-${si}`, selected: st.sel.section === si, onToggle: (open) => open && st.selectSection(si) },
    )
  })

  const warns = h('div', { class: 'tab-warns' })

  const el = h(
    'div',
    { class: 'tab-body' },
    banner,
    group('Seções (colunas)', secTotal, ...sections, btn('Adicionar seção', () => st.addSection(), { icon: 'plus' })),
    warns,
  )

  const refresh = () => {
    for (const u of usageEls) {
      const r = u.calc()
      u.el.textContent = r.text
      u.el.classList.toggle('over', r.over)
    }
    warns.textContent = ''
    const list = st.result.warnings.filter((w) => tabOfWarning(w) === 'layout')
    if (list.length) {
      warns.append(
        h('h3', null, 'Avisos do layout'),
        ...list.map((w) => h('p', { class: `note ${severityOf(w)}` }, w.message)),
      )
    }
  }
  refresh()
  return { el, refresh }
}
