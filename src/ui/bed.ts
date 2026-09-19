import { BED_PRESETS, CUSTOM_BED, bedPresetId } from '../model/beds'
import { h } from './dom'
import type { Store } from './state'

/** Picks the printer bed from presets or a custom size. Used in the Projeto tab and in the Mesa view. */
export function bedPicker(st: Store, compact: boolean): HTMLElement {
  const bed = st.project.printBed
  const id = bedPresetId(bed)
  const select = h(
    'select',
    {
      'aria-label': 'Mesa da impressora', 'data-key': 'printBed.preset',
      onChange: (e: Event) => {
        const v = (e.target as HTMLSelectElement).value
        const preset = BED_PRESETS.find((b) => b.id === v)
        if (preset) st.mutate((p) => { p.printBed = { x: preset.x, y: preset.y, preset: preset.id } })
        else st.mutate((p) => { p.printBed = { x: p.printBed.x, y: p.printBed.y, preset: CUSTOM_BED } })
      },
    },
    ...BED_PRESETS.map((b) => h('option', { value: b.id, selected: b.id === id }, b.name)),
    h('option', { value: CUSTOM_BED, selected: id === CUSTOM_BED }, 'Personalizado…'),
  )
  select.value = id
  const wrap = h('div', { class: `bed-picker${compact ? ' compact' : ''}` }, select)
  if (id === CUSTOM_BED) {
    const num = (label: string, key: 'x' | 'y') => {
      const input = h('input', { type: 'number', min: 50, max: 1000, step: 1, value: bed[key], 'aria-label': `Mesa ${label}`, 'data-key': `printBed.${key}` })
      input.addEventListener('change', () => {
        const v = Math.min(1000, Math.max(50, Math.round(input.valueAsNumber || bed[key])))
        input.value = String(v)
        st.set(`printBed.${key}`, v, false)
      })
      return h('label', { class: 'bed-dim' }, h('span', null, label), input, h('span', { class: 'unit' }, 'mm'))
    }
    wrap.append(num('X', 'x'), num('Y', 'y'))
  }
  return wrap
}
