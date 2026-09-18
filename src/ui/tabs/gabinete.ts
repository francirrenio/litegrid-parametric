import type { FaceId, SkeletonBracing, SkinAttach, Standoff } from '../../model/types'
import { h } from '../dom'
import {
  accordion, autoField, checkField, chips, colorField, group, numField, pathModel, selectField,
} from '../fields'
import type { Store } from '../state'
import { faceFillControls, type TabView } from './common'

const FACES: Array<[FaceId, string]> = [
  ['left', 'Lateral esquerda'], ['right', 'Lateral direita'], ['top', 'Topo'], ['bottom', 'Base'], ['back', 'Costas'],
]

export function gabineteTab(st: Store): TabView {
  const pm = <T,>(p: string) => pathModel<T>(st, p)
  const p = st.project
  const skeleton = p.cabinetMode === 'skeleton'

  const skeletonGroup = skeleton
    ? group(
        'Esqueleto',
        numField(pm<number>('skeleton.perimeters'), 'Perímetros da estrutura', { min: 2, max: 8, slider: true }),
        autoField(pm<number | 'auto'>('skeleton.barWidth'), 'Largura das barras', { min: 3, max: 40, step: 0.5, unit: 'mm', fallback: 8 }),
        selectField<SkeletonBracing>(pm('skeleton.bracing'), 'Travamento', [
          ['auto', 'Automático (o mínimo que trava)'], ['none', 'Nenhum'], ['corners', 'Esquadros nos cantos'],
          ['diagonal', 'Diagonal / X'], ['back', 'Costas com painel'],
        ], { hint: 'O esqueleto é sempre autônomo: firme sem nenhuma skin.' }),
      )
    : h('p', { class: 'note info' }, 'Modo monolítico: o gabinete é uma peça única. Escolha "Esqueleto" para peças planas encaixadas.')

  const skins = FACES.map(([f, name]) => {
    const s = p.skins[f]
    const base = `skins.${f}`
    const body = [checkField(pm<boolean>(`${base}.enabled`), 'Gerar esta skin', { rebuild: true })]
    if (s.enabled) {
      body.push(
        ...(faceFillControls((k) => pathModel(st, `${base}.${k}`) as never, 'skin') as HTMLElement[]),
        selectField<SkinAttach>(pm(`${base}.attach`), 'Fixação da skin', [
          ['tabs', 'Abas'], ['clips', 'Clipes'], ['screws', 'Parafusos'], ['glue', 'Cola'],
        ]),
      )
      if (s.fill === 'panel') {
        body.push(
          selectField<Standoff>(pm(`${base}.standoff`), 'Afastamento', [
            ['spacers', 'Espaçadores'], ['pockets', 'Bolsos por fenda'], ['none', 'Nenhum'],
          ], { rebuild: true, hint: 'O painel precisa de folga atrás para as garras dos ganchos.' }),
        )
        if (s.standoff !== 'none') {
          body.push(autoField(pm<number | 'auto'>(`${base}.standoffMm`), 'Recuo', { min: 2, max: 60, step: 0.5, unit: 'mm', fallback: 20 }))
        }
      }
      body.push(colorField(pm<string>(`${base}.color`), 'Cor'))
    }
    return accordion(
      [name, h('span', { class: `acc-meta${s.enabled ? ' on' : ''}` }, s.enabled ? 'ativa' : 'desligada')],
      body,
      { key: `skin-${f}` },
    )
  })

  const el = h(
    'div',
    { class: 'tab-body' },
    group(
      'Modo',
      chips(pm<string>('cabinetMode'), 'Construção', [['skeleton', 'Esqueleto'], ['monolithic', 'Monolítico']], { rebuild: true }),
    ),
    skeletonGroup,
    group('Skins (paredes externas)', h('p', { class: 'hint' }, 'Opcionais. A frente fica aberta para as gavetas.'), ...skins),
  )
  return { el }
}
