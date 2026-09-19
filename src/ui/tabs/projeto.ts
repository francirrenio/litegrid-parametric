import { deriveNozzle } from '../../core/nozzle'
import type { Material, MaterialLevel } from '../../model/types'
import { h, fmt } from '../dom'
import { bedPicker } from '../bed'
import { chips, field, group, numField, pathModel, selectField } from '../fields'
import type { Store } from '../state'
import type { TabView } from './common'

export function projetoTab(st: Store): TabView {
  const pm = <T,>(p: string) => pathModel<T>(st, p)
  const derived = h('dl', { class: 'derived' })
  const refresh = () => {
    derived.textContent = ''
    const row = (k: string, v: string) => derived.append(h('dt', null, k), h('dd', { class: 'mono' }, v))
    try {
      const nz = deriveNozzle(st.project.nozzle, st.project.advanced)
      row('Largura de linha', `${fmt(nz.lineWidth, 3)} mm`)
      row('Altura de camada', `${fmt(nz.layerHeight, 2)} mm`)
      row('Parede de 2 perímetros', `${fmt(nz.wall(2), 2)} mm`)
      row('Parede de 3 perímetros', `${fmt(nz.wall(3), 2)} mm`)
    } catch {
      row('Bico', 'valor inválido')
    }
  }
  refresh()

  const el = h(
    'div',
    { class: 'tab-body' },
    group(
      'Bico',
      chips(pm<number>('nozzle'), 'Diâmetro', [[0.25, '0,25'], [0.4, '0,4'], [0.6, '0,6'], [0.8, '0,8']], { rebuild: true }),
      numField(pm<number>('nozzle'), 'Diâmetro livre', { min: 0.1, max: 2, step: 0.05, unit: 'mm', rebuild: true }),
      derived,
    ),
    group('Impressora', field('Mesa de impressão', bedPicker(st, false), { hint: 'Define o tamanho máximo de cada peça e como as peças se distribuem nas mesas.' })),
    group(
      'Dimensões externas do gabinete',
      numField(pm<number>('width'), 'Largura', { min: 30, max: 2000, unit: 'mm', slider: true, sliderMin: 60, sliderMax: 800 }),
      numField(pm<number>('height'), 'Altura', { min: 30, max: 2000, unit: 'mm', slider: true, sliderMin: 40, sliderMax: 800 }),
      numField(pm<number>('depth'), 'Profundidade', { min: 30, max: 2000, unit: 'mm', slider: true, sliderMin: 40, sliderMax: 600 }),
    ),
    group(
      'Material',
      selectField<Material>(pm('material'), 'Filamento', [['PLA', 'PLA'], ['PETG', 'PETG'], ['ABS', 'ABS'], ['ASA', 'ASA'], ['PLA-CF', 'PLA-CF']], {
        hint: 'PLA amolece perto de 55 °C e cede com carga contínua.',
      }),
      chips<MaterialLevel>(pm('materialLevel'), 'Nível de material', [['minimo', 'Mínimo'], ['equilibrado', 'Equilibrado'], ['reforcado', 'Reforçado']], {
        hint: 'Mínimo usa só o necessário para ficar rígido; reforçado engrossa a estrutura.',
      }),
      numField(pm<number>('smallestItem'), 'Menor item guardado', {
        min: 1, max: 100, unit: 'mm', slider: true, sliderMax: 60, hint: 'Limita o tamanho dos furos das paredes vazadas.',
      }),
    ),
  )
  return { el, refresh }
}
