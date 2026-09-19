import type { FixingConfig } from '../../model/types'
import { tr } from '../../i18n'
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
      tr('Entre gabinetes', 'Between cabinets'),
      h('p', { class: 'hint' }, tr('Sem saliências em balanço: pinos curtos chanfrados e peças separadas.', 'No cantilevered protrusions: short chamfered pins and separate parts.')),
      checkField(pm<boolean>('fixing.between.pins'), tr('Pinos e furos de alinhamento', 'Alignment pins and holes'), {
        tip: tr(
          'Pinos curtos que alinham um gabinete sobre o outro ao empilhar ou colocar lado a lado. Recomendado deixar ligado; custa quase nada.',
          'Short pins that line up one cabinet with the next when stacked or side by side. Recommended to keep on; it costs almost nothing.',
        ),
      }),
      checkField(pm<boolean>('fixing.between.butterfly'), tr('Chave borboleta', 'Butterfly key'), {
        tip: tr(
          'Peça em forma de gravata-borboleta que trava dois gabinetes lado a lado para não se separarem. Ligue se o conjunto for movido ou ficar solto na bancada.',
          'A bow-tie shaped piece that locks two side-by-side cabinets together. Turn it on if the set gets moved around or sits loose on the bench.',
        ),
      }),
      selectField<FixingConfig['between']['screw']>(pm('fixing.between.screw'), tr('Parafuso passante', 'Through screw'), [
        ['none', tr('Nenhum', 'None')], ['M3', tr('M3 (com porca aberta)', 'M3 (with open nut slot)')], ['M4', tr('M4 (com porca aberta)', 'M4 (with open nut slot)')],
      ], {
        tip: tr(
          'Parafuso que atravessa os gabinetes para uni-los com firmeza. M3 basta para a maioria; M4 é mais forte para conjuntos grandes ou pesados.',
          'A screw through the cabinets to join them firmly. M3 is enough for most sets; M4 is stronger for large or heavy ones.',
        ),
      }),
      checkField(pm<boolean>('fixing.between.magnet'), tr('Ímã embutido', 'Embedded magnet'), {
        tip: tr(
          'Reserva um furo para colar um ímã em cada junção, unindo os gabinetes sem parafusos e permitindo separá-los fácil. Confira o tamanho do ímã na peça de teste.',
          'Reserves a pocket to glue a magnet at each joint, joining cabinets without screws and letting you separate them easily. Check the magnet size with the test piece.',
        ),
      }),
    ),
    group(
      tr('Na parede', 'On the wall'),
      selectField<FixingConfig['wall']['mode']>(pm('fixing.wall.mode'), tr('Tipo', 'Type'), [
        ['none', tr('Nenhuma', 'None')], ['screws', tr('Parafusos', 'Screws')], ['keyhole', tr('Rasgos de fechadura', 'Keyhole slots')], ['cleat', tr('Ripa francesa 45°', '45° French cleat')],
      ], {
        rebuild: true,
        tip: tr(
          'Como o gabinete se prende à parede. Parafusos são o mais simples; rasgos de fechadura deixam pendurar e tirar fácil; a ripa francesa a 45° aguenta mais peso e permite reposicionar.',
          'How the cabinet attaches to the wall. Screws are simplest; keyhole slots let you hang and lift it off easily; a 45° French cleat carries more weight and can be repositioned.',
        ),
      }),
      wallMode !== 'none'
        ? numField(pm<number>('fixing.wall.screwDiameter'), tr('Diâmetro do parafuso', 'Screw diameter'), {
            min: 2, max: 10, step: 0.5, unit: 'mm', slider: true,
            tip: tr(
              'Diâmetro do parafuso da parede (o furo é ajustado a ele). 4–5 mm serve para a maioria das buchas; use o mesmo valor do parafuso que você vai comprar.',
              'Diameter of the wall screw (the hole is sized to it). 4–5 mm suits most wall plugs; use the same value as the screw you will buy.',
            ),
          })
        : null,
      wallMode !== 'none'
        ? h('p', { class: 'note warn' }, tr('A capacidade real depende do parafuso e da bucha usados na parede.', 'The real capacity depends on the screw and wall plug used.'))
        : null,
    ),
    group(
      tr('Painel de ferramentas', 'Tool panel'),
      checkField(pm<boolean>('fixing.hangOnSkadis'), tr('Pendurar o gabinete numa placa Skadis', 'Hang the cabinet on a Skadis board'), {
        hint: tr('Gera garras nas costas, em pares a cada 40 mm.', 'Generates hooks on the back, in pairs every 40 mm.'),
        tip: tr(
          'Cria ganchos nas costas para pendurar o gabinete numa placa Skadis (IKEA), sem furar a parede. Confira o peso total: a Skadis aguenta pouco.',
          'Adds hooks on the back so the cabinet hangs on an IKEA Skadis board without drilling. Mind the total weight: Skadis holds little.',
        ),
      }),
    ),
  )
  return { el }
}
