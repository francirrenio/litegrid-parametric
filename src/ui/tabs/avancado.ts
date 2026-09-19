import { DEFAULT_CLEARANCES } from '../../core/layout'
import { deriveNozzle } from '../../core/nozzle'
import { group, optField, pathModel } from '../fields'
import { h, fmt } from '../dom'
import type { Store } from '../state'
import type { TabView } from './common'

export function avancadoTab(st: Store): TabView {
  const pm = <T,>(p: string) => pathModel<T>(st, p)
  let autoLayer = ''
  try {
    autoLayer = fmt(deriveNozzle(st.project.nozzle, { ...st.project.advanced, layerHeight: undefined }).layerHeight, 2)
  } catch {
    autoLayer = 'auto'
  }
  const el = h(
    'div',
    { class: 'tab-body' },
    h('p', { class: 'hint' }, 'Campos vazios usam o valor automático. Só mexa aqui depois de imprimir uma peça de teste.'),
    group(
      'Extrusão',
      optField(pm('advanced.extrusionFactor'), 'Fator de largura de linha', { min: 1, max: 2, step: 0.005, placeholder: '1,125 × bico', hint: 'Largura de linha = bico × fator.' }),
      optField(pm('advanced.layerHeight'), 'Altura de camada', { min: 0.05, max: 1, step: 0.01, unit: 'mm', placeholder: `${autoLayer} (automático)` }),
    ),
    group(
      'Folgas',
      optField(pm('advanced.clearances.lateral'), 'Gaveta, lateral (por lado)', { min: 0, max: 2, step: 0.05, unit: 'mm', placeholder: String(DEFAULT_CLEARANCES.lateral) }),
      optField(pm('advanced.clearances.top'), 'Gaveta, topo', { min: 0, max: 3, step: 0.05, unit: 'mm', placeholder: String(DEFAULT_CLEARANCES.top) }),
      optField(pm('advanced.clearances.back'), 'Gaveta, fundo', { min: 0, max: 5, step: 0.1, unit: 'mm', placeholder: String(DEFAULT_CLEARANCES.back) }),
      optField(pm('advanced.fitClearance'), 'Folga dos encaixes (por lado)', { min: 0.1, max: 1, step: 0.01, unit: 'mm', placeholder: '0,15', hint: 'Vale para abas, ranhuras, pinos, emendas e ranhuras de divisória. O mínimo é 0,1 mm.' }),
    ),
  )
  return { el }
}
