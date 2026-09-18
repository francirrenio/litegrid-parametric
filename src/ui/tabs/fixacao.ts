import type { FixingConfig } from '../../model/types'
import { h } from '../dom'
import { checkField, group, numField, pathModel, selectField } from '../fields'
import type { Store } from '../state'
import type { TabView } from './common'

export function fixacaoTab(st: Store): TabView {
  const pm = <T,>(p: string) => pathModel<T>(st, p)
  const wallMode = st.project.fixing.wall.mode
  const el = h(
    'div',
    { class: 'tab-body' },
    group(
      'Entre gabinetes',
      h('p', { class: 'hint' }, 'Sem saliências em balanço: pinos curtos chanfrados e peças separadas.'),
      checkField(pm<boolean>('fixing.between.pins'), 'Pinos e furos de alinhamento'),
      checkField(pm<boolean>('fixing.between.butterfly'), 'Chave borboleta'),
      selectField<FixingConfig['between']['screw']>(pm('fixing.between.screw'), 'Parafuso passante', [
        ['none', 'Nenhum'], ['M3', 'M3 (com porca aberta)'], ['M4', 'M4 (com porca aberta)'],
      ]),
      checkField(pm<boolean>('fixing.between.magnet'), 'Ímã embutido'),
    ),
    group(
      'Na parede',
      selectField<FixingConfig['wall']['mode']>(pm('fixing.wall.mode'), 'Tipo', [
        ['none', 'Nenhuma'], ['screws', 'Parafusos'], ['keyhole', 'Rasgos de fechadura'], ['cleat', 'Ripa francesa 45°'],
      ], { rebuild: true }),
      wallMode !== 'none'
        ? numField(pm<number>('fixing.wall.screwDiameter'), 'Diâmetro do parafuso', { min: 2, max: 10, step: 0.5, unit: 'mm', slider: true })
        : null,
      wallMode !== 'none'
        ? h('p', { class: 'note warn' }, 'A capacidade real depende do parafuso e da bucha usados na parede.')
        : null,
    ),
    group(
      'Painel de ferramentas',
      checkField(pm<boolean>('fixing.hangOnSkadis'), 'Pendurar o gabinete numa placa Skadis', {
        hint: 'Gera garras nas costas, em pares a cada 40 mm.',
      }),
    ),
  )
  return { el }
}
