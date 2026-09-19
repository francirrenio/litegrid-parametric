import type { FaceFill } from '../../model/types'
import { tr } from '../../i18n'
import { chips, checkField, numField, autoField, selectField, type Model } from '../fields'
import type { Child } from '../dom'

export interface TabView {
  el: HTMLElement
  refresh?: () => void
}

export const REINFORCEMENTS: Array<[FaceFill['reinforcement'], string]> = [
  ['auto', tr('Automático', 'Automatic')], ['none', tr('Nenhum', 'None')], ['ribs', tr('Nervuras', 'Ribs')], ['postsBeams', tr('Pilares e vigas', 'Posts and beams')],
  ['truss', tr('Treliça', 'Truss')], ['x', 'X'], ['corrugated', tr('Ondulada', 'Corrugated')],
]

/** Controls of a FaceFill; `mk(key)` returns the model of that field (project defaults, skin or per-drawer override). */
export function faceFillControls(mk: (k: keyof FaceFill) => Model<never>, kind: 'skin' | 'drawer'): Child[] {
  const m = <T,>(k: keyof FaceFill) => mk(k) as unknown as Model<T>
  const fill = m<FaceFill['fill']>('fill')
  const cur = fill.get()
  const fillOptions: Array<[FaceFill['fill'], string]> =
    kind === 'skin'
      ? [['closed', tr('Fechada', 'Solid')], ['perforated', tr('Vazada', 'Perforated')], ['truss', tr('Treliça', 'Truss')], ['panel', tr('Painel de fixação', 'Mounting panel')]]
      : [['closed', tr('Fechada', 'Solid')], ['perforated', tr('Vazada', 'Perforated')], ['truss', tr('Treliça', 'Truss')]]
  const out: Child[] = [
    selectField(fill, tr('Preenchimento', 'Fill'), fillOptions, {
      rebuild: true,
      tip: tr(
        'Como esta parede é feita. Fechada é maciça e a mais resistente; Vazada economiza material e deixa ver o conteúdo; Treliça é leve e rígida. Comece com Fechada e vaze só para gastar menos filamento.',
        'How this wall is built. Solid is the strongest; Perforated saves material and shows the contents; Truss is light yet stiff. Start with Solid and open it up only to save filament.',
      ),
    }),
  ]
  if (cur === 'perforated') {
    out.push(
      chips(m<FaceFill['pattern']>('pattern'), tr('Padrão dos furos', 'Hole pattern'), [
        ['triangle', tr('Triângulo', 'Triangle')], ['hexagon', tr('Hexágono', 'Hexagon')], ['diamond', tr('Losango', 'Diamond')], ['circle', tr('Círculo', 'Circle')],
      ], {
        tip: tr(
          'Formato dos furos. Triângulo e hexágono são os mais resistentes; círculo é o mais suave de imprimir. Na maior parte dos casos é só estética.',
          'Shape of the holes. Triangles and hexagons are strongest; circles print the most smoothly. Mostly a visual choice.',
        ),
      }),
      numField(m<number>('openPercent'), tr('Abertura', 'Opening'), {
        min: 0, max: 90, unit: '%', slider: true,
        hint: tr('Alvo de área vazada; o real pode ser menor (menor item e alma mínima).', 'Target open area; the real one can be smaller (smallest item and minimum web).'),
        tip: tr(
          'Porcentagem da parede que vira furo. 30–50% é um bom equilíbrio; mais aberto gasta menos material, mas enfraquece a parede e deixa passar itens pequenos.',
          'Percentage of the wall that becomes holes. 30–50% is a good balance; more open uses less material but weakens the wall and lets small items through.',
        ),
      }),
      numField(m<number>('solidUpTo'), tr('Fechada até a altura', 'Solid up to height'), {
        min: 0, max: 500, unit: 'mm', slider: true, sliderMax: 120,
        tip: tr(
          'Altura, a partir da base, que fica sem furos. Use 10–30 mm para o fundo segurar itens pequenos; 0 deixa vazado até embaixo.',
          'Height from the base that stays without holes. Use 10–30 mm so the bottom holds small items; 0 perforates all the way down.',
        ),
      }),
    )
  }
  if (cur === 'panel') {
    const sys = m<FaceFill['panelSystem']>('panelSystem')
    out.push(
      selectField(sys, tr('Sistema', 'System'), [['skadis', 'Skadis'], ['pegboard', 'Pegboard'], ['hsw', 'HSW']], {
        rebuild: true,
        tip: tr(
          'Padrão de furos do painel, para combinar com os ganchos que você já tem. Skadis (IKEA) é o mais comum; escolha o que seus acessórios usam.',
          'Hole pattern of the panel, to match the hooks you already own. Skadis (IKEA) is the most common; pick the one your accessories use.',
        ),
      }),
    )
    const s = sys.get()
    if (s === 'pegboard') {
      out.push(
        chips(m<FaceFill['pegboardHole']>('pegboardHole'), tr('Furo', 'Hole'), [['1/4', '1/4"'], ['1/8', '1/8"']], {
          tip: tr(
            'Diâmetro do furo do pegboard. 1/4" é o padrão da maioria dos ganchos; 1/8" é para pegboards finos.',
            'Pegboard hole diameter. 1/4" fits most hooks; 1/8" is for thin pegboards.',
          ),
        }),
      )
    }
    if (s === 'hsw') {
      out.push(
        chips(m<FaceFill['hswVariant']>('hswVariant'), tr('Variante', 'Variant'), [['sd', 'SD (8 mm)'], ['hd', 'HD (10 mm)']], {
          tip: tr(
            'SD (8 mm) é para cargas leves e HD (10 mm) para ferramentas mais pesadas. Escolha conforme os acessórios HSW que você usa.',
            'SD (8 mm) is for light loads and HD (10 mm) for heavier tools. Choose to match the HSW accessories you use.',
          ),
        }),
      )
    }
    if (s === 'skadis') {
      out.push(
        checkField(m<boolean>('skadisStaggered'), tr('Colunas intercaladas (grade real)', 'Staggered columns (real grid)'), {
          tip: tr(
            'Imita a grade real do Skadis, com colunas de furos deslocadas. Deixe ligado para os ganchos originais encaixarem.',
            'Mimics the real Skadis grid with offset hole columns. Keep it on so original hooks fit.',
          ),
        }),
      )
    }
    out.push(
      autoField(m<number | 'auto'>('thickness'), tr('Espessura do painel', 'Panel thickness'), {
        min: 2, max: 12, step: 0.5, unit: 'mm', fallback: 5,
        tip: tr(
          'Grossura do painel. Automático usa o valor do sistema escolhido; mais grosso é mais firme, mas os ganchos podem não alcançar.',
          "Panel thickness. Automatic uses the chosen system's value; thicker is firmer, but hooks may not reach.",
        ),
      }),
    )
  }
  if (cur !== 'none') {
    out.push(
      autoField(m<number | 'auto'>('frame'), tr('Moldura', 'Frame'), {
        min: 0.4, max: 30, step: 0.1, unit: 'mm', fallback: 1.6,
        tip: tr(
          'Largura da borda sólida ao redor da parte vazada. Mais larga deixa a peça mais rígida; mais estreita libera mais área. Automático costuma servir.',
          'Width of the solid border around the open area. Wider is stiffer; narrower frees more area. Automatic usually works.',
        ),
      }),
    )
    if (cur !== 'panel') {
      out.push(
        selectField(m<FaceFill['reinforcement']>('reinforcement'), tr('Reforço', 'Reinforcement'), REINFORCEMENTS, {
          tip: tr(
            'Estrutura extra atrás da parede para ela não empenar. Automático escolhe por você; use Nervuras ou Treliça em paredes grandes e finas.',
            'Extra structure behind the wall to keep it from warping. Automatic decides for you; use Ribs or Truss on large thin walls.',
          ),
        }),
      )
    }
  }
  return out
}
