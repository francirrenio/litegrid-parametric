import type { Size } from '../../core/layout'
import type { Load } from '../../model/types'
import { tr } from '../../i18n'
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
  const tail =
    n > 0
      ? tr(`; ${n} auto dividem ${fmt(Math.max(0, rest), 1)} mm`, `; ${n} auto share ${fmt(Math.max(0, rest), 1)} mm`)
      : rest > 1e-6 ? tr(`; sobram ${fmt(rest, 1)} mm`, `; ${fmt(rest, 1)} mm left`) : ''
  return { text: tr(`${label}: usado ${fmt(used, 1)} de ${fmt(available, 1)} mm${tail}`, `${label}: used ${fmt(used, 1)} of ${fmt(available, 1)} mm${tail}`), over }
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
    return usage(tr('Larguras das seções', 'Section widths'), st.project.sections.map((s) => s.width), st.project.width - 2 * t - Math.max(0, n - 1) * t)
  })

  const sel = st.sel.bay
  const banner = sel
    ? h(
        'div',
        { class: 'banner' },
        h('span', null, tr('Gaveta selecionada: ', 'Selected drawer: '), h('b', { class: 'mono' }, sel)),
        btn(tr('Editar gaveta', 'Edit drawer'), () => st.setSideTab('gavetas'), { sm: true }),
        btn(tr('Limpar', 'Clear'), () => st.selectBay(null), { sm: true, kind: 'ghost' }),
      )
    : null

  const sections = p.sections.map((s, si) => {
    const nRows = s.rows.length
    const rowUsage = track(() => {
      const t = wall()
      const sec = st.project.sections[si]
      if (!sec) return { text: '', over: false }
      return usage(tr('Alturas das filas', 'Row heights'), sec.rows.map((r) => r.height), st.project.height - 2 * t - Math.max(0, sec.rows.length - 1) * t)
    })
    const rows = s.rows.map((_, ri) => {
      const base = `sections.${si}.rows.${ri}`
      return h(
        'div',
        { class: 'row-card' },
        h(
          'div',
          { class: 'row-head' },
          h('b', null, tr(`Fila ${ri + 1}`, `Row ${ri + 1}`)),
          h(
            'span',
            { class: 'acts' },
            iconBtn('up', tr('Subir fila', 'Move row up'), () => st.moveRow(si, ri, -1), ri === 0),
            iconBtn('down', tr('Descer fila', 'Move row down'), () => st.moveRow(si, ri, 1), ri === nRows - 1),
            iconBtn('copy', tr('Duplicar fila', 'Duplicate row'), () => st.duplicateRow(si, ri)),
            iconBtn('trash', tr('Remover fila', 'Remove row'), () => st.removeRow(si, ri), nRows <= 1),
          ),
        ),
        autoField(pm<number | 'auto'>(`${base}.height`), tr('Altura', 'Height'), {
          min: 5, max: 1000, unit: 'mm', fallback: 40,
          tip: tr(
            'Altura desta fila de gavetas. Automático divide o espaço restante entre as filas automáticas; fixe um valor para gavetas mais altas (ex.: 60–100 mm para ferramentas).',
            'Height of this row of drawers. Automatic splits the remaining space among automatic rows; set a value for taller drawers (e.g. 60–100 mm for tools).',
          ),
        }),
        numField(pm<number>(`${base}.divisions`), tr('Divisões', 'Divisions'), {
          min: 1, max: 20, slider: true, sliderMax: 10,
          tip: tr(
            'Em quantas gavetas lado a lado esta fila é dividida. Mais divisões dão gavetas estreitas para itens pequenos; poucas dão gavetas largas.',
            'How many drawers side by side this row is split into. More divisions give narrow drawers for small items; fewer give wide drawers.',
          ),
        }),
        chips<Load>(pm(`${base}.load`), tr('Carga', 'Load'), [['leve', tr('Leve', 'Light')], ['media', tr('Média', 'Medium')], ['pesada', tr('Pesada', 'Heavy')]], {
          tip: tr(
            'Peso esperado nas gavetas desta fila. Leve para parafusos e peças pequenas, Pesada para ferramentas; cargas maiores geram paredes e travas mais robustas.',
            'Expected weight in this row drawers. Light for screws and small parts, Heavy for tools; heavier loads produce sturdier walls and stops.',
          ),
        }),
      )
    })
    const widthLabel = s.width === 'auto' ? 'auto' : `${fmt(s.width, 1)} mm`
    return accordion(
      [tr(`Seção ${si + 1}`, `Section ${si + 1}`), h('span', { class: 'acc-meta' }, `${widthLabel} · ${nRows} ${nRows === 1 ? tr('fila', 'row') : tr('filas', 'rows')}`)],
      [
        h(
          'div',
          { class: 'acts wide' },
          iconBtn('up', tr('Mover para a esquerda', 'Move left'), () => st.moveSection(si, -1), si === 0),
          iconBtn('down', tr('Mover para a direita', 'Move right'), () => st.moveSection(si, 1), si === p.sections.length - 1),
          btn(tr('Duplicar', 'Duplicate'), () => st.duplicateSection(si), { icon: 'copy', sm: true }),
          btn(tr('Remover', 'Remove'), () => st.removeSection(si), { icon: 'trash', sm: true, kind: 'danger', disabled: p.sections.length <= 1 }),
        ),
        autoField(pm<number | 'auto'>(`sections.${si}.width`), tr('Largura da seção', 'Section width'), {
          min: 20, max: 2000, unit: 'mm', fallback: 100,
          tip: tr(
            'Largura desta coluna do gabinete. Automático reparte o espaço igualmente com as outras colunas automáticas; fixe um valor para uma coluna mais larga ou estreita.',
            'Width of this cabinet column. Automatic shares the space equally with other automatic columns; set a value for a wider or narrower column.',
          ),
        }),
        rowUsage,
        ...rows,
        btn(tr('Adicionar fila', 'Add row'), () => st.addRow(si), { icon: 'plus', sm: true }),
      ],
      { key: `sec-${si}`, selected: st.sel.section === si, onToggle: (open) => open && st.selectSection(si) },
    )
  })

  const warns = h('div', { class: 'tab-warns' })

  const el = h(
    'div',
    { class: 'tab-body' },
    banner,
    group(tr('Seções (colunas)', 'Sections (columns)'), secTotal, ...sections, btn(tr('Adicionar seção', 'Add section'), () => st.addSection(), { icon: 'plus' })),
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
        h('h3', null, tr('Avisos do layout', 'Layout warnings')),
        ...list.map((w) => h('p', { class: `note ${severityOf(w)}` }, w.message)),
      )
    }
  }
  refresh()
  return { el, refresh }
}
