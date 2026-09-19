import { DEFAULT_CLEARANCES } from '../../core/layout'
import { deriveNozzle } from '../../core/nozzle'
import { tr, num } from '../../i18n'
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
    h('p', { class: 'hint' }, tr('Campos vazios usam o valor automático. Só mexa aqui depois de imprimir uma peça de teste.', 'Empty fields use the automatic value. Only change these after printing a test piece.')),
    group(
      tr('Extrusão', 'Extrusion'),
      optField(pm('advanced.extrusionFactor'), tr('Fator de largura de linha', 'Line width factor'), {
        min: 1, max: 2, step: 0.005, placeholder: tr('1,125 × bico', '1.125 × nozzle'),
        hint: tr('Largura de linha = bico × fator.', 'Line width = nozzle × factor.'),
        tip: tr(
          'Multiplica o diâmetro do bico para definir a largura de cada linha impressa. Valores maiores (1,2–1,3) dão paredes mais firmes; menores (1,0–1,1) dão detalhes mais finos. Deixe vazio se não sabe.',
          'Multiplies the nozzle diameter to set each printed line width. Higher values (1.2–1.3) give stronger walls; lower ones (1.0–1.1) give finer detail. Leave empty if unsure.',
        ),
      }),
      optField(pm('advanced.layerHeight'), tr('Altura de camada', 'Layer height'), {
        min: 0.05, max: 1, step: 0.01, unit: 'mm', placeholder: `${autoLayer} (${tr('automático', 'automatic')})`,
        tip: tr(
          'Espessura de cada camada, igual à do seu fatiador. Costuma ser 25–50% do bico (0,2 mm para bico de 0,4). Camadas menores ficam mais lisas e demoram mais.',
          'Thickness of each layer, same as in your slicer. Usually 25–50% of the nozzle (0.2 mm for a 0.4 nozzle). Thinner layers look smoother but take longer.',
        ),
      }),
    ),
    group(
      tr('Folgas', 'Clearances'),
      optField(pm('advanced.clearances.lateral'), tr('Gaveta, lateral (por lado)', 'Drawer, side (each side)'), {
        min: 0, max: 2, step: 0.05, unit: 'mm', placeholder: num(String(DEFAULT_CLEARANCES.lateral)),
        tip: tr(
          'Espaço entre a gaveta e o gabinete de cada lado. Aumente se a gaveta trava ou emperra; diminua se ela balança demais. Ajuste em passos de 0,1 mm.',
          'Gap between the drawer and the cabinet on each side. Increase it if the drawer sticks; decrease it if it wobbles. Adjust in 0.1 mm steps.',
        ),
      }),
      optField(pm('advanced.clearances.top'), tr('Gaveta, topo', 'Drawer, top'), {
        min: 0, max: 3, step: 0.05, unit: 'mm', placeholder: num(String(DEFAULT_CLEARANCES.top)),
        tip: tr(
          'Espaço entre o topo da gaveta e o teto da abertura. Aumente se a gaveta raspa em cima; diminua para uma folga menos visível.',
          'Gap between the top of the drawer and the top of the opening. Increase it if the drawer scrapes; decrease it for a tighter look.',
        ),
      }),
      optField(pm('advanced.clearances.back'), tr('Gaveta, fundo', 'Drawer, back'), {
        min: 0, max: 5, step: 0.1, unit: 'mm', placeholder: num(String(DEFAULT_CLEARANCES.back)),
        tip: tr(
          'Espaço entre o fundo da gaveta e a parede de trás do gabinete. Serve para a gaveta fechar por completo; raramente precisa mudar.',
          'Gap between the drawer back and the cabinet rear wall. It lets the drawer close fully; rarely needs changing.',
        ),
      }),
      optField(pm('advanced.fitClearance'), tr('Folga dos encaixes (por lado)', 'Joint clearance (each side)'), {
        min: 0.1, max: 1, step: 0.01, unit: 'mm', placeholder: num('0.15'),
        hint: tr('Vale para abas, ranhuras, pinos, emendas e ranhuras de divisória. O mínimo é 0,1 mm.', 'Applies to tabs, slots, pins, joints and divider slots. The minimum is 0.1 mm.'),
        tip: tr(
          'Folga entre peças que se encaixam. Se o teste ficou apertado, suba para 0,2–0,25; se ficou frouxo, desça para 0,1. Use a peça de teste para acertar.',
          'Gap between mating parts. If the test piece was too tight, raise it to 0.2–0.25; if too loose, lower it to 0.1. Use the test piece to dial it in.',
        ),
      }),
    ),
  )
  return { el }
}
