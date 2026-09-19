import type { FaceId, SkeletonBracing, SkinAttach, Standoff } from '../../model/types'
import { tr } from '../../i18n'
import { h } from '../dom'
import {
  accordion, autoField, checkField, chips, colorField, group, numField, pathModel, selectField,
} from '../fields'
import type { Store } from '../state'
import { faceFillControls, type TabView } from './common'

const FACES: Array<[FaceId, string]> = [
  ['left', tr('Lateral esquerda', 'Left side')], ['right', tr('Lateral direita', 'Right side')], ['top', tr('Topo', 'Top')], ['bottom', tr('Base', 'Bottom')], ['back', tr('Costas', 'Back')],
]

export function gabineteTab(st: Store): TabView {
  const pm = <T,>(p: string) => pathModel<T>(st, p)
  const p = st.project
  const skeleton = p.cabinetMode === 'skeleton'

  const skeletonGroup = skeleton
    ? group(
        tr('Esqueleto', 'Skeleton'),
        numField(pm<number>('skeleton.perimeters'), tr('Perímetros da estrutura', 'Structure perimeters'), {
          min: 2, max: 8, slider: true,
          tip: tr(
            'Quantas linhas de filamento formam as paredes da estrutura. Mais perímetros deixam tudo mais forte e pesado; 2 basta para gavetas leves, 3–4 para uso normal.',
            'How many filament lines make up the structure walls. More perimeters are stronger and heavier; 2 is enough for light drawers, 3–4 for normal use.',
          ),
        }),
        autoField(pm<number | 'auto'>('skeleton.barWidth'), tr('Largura das barras', 'Bar width'), {
          min: 3, max: 40, step: 0.5, unit: 'mm', fallback: 8,
          tip: tr(
            'Largura das barras do esqueleto entre as gavetas. Barras largas dão mais rigidez e menos espaço útil; estreitas economizam material. Automático costuma servir.',
            'Width of the skeleton bars between drawers. Wide bars are stiffer but leave less usable space; narrow ones save material. Automatic usually works.',
          ),
        }),
        selectField<SkeletonBracing>(pm('skeleton.bracing'), tr('Travamento', 'Bracing'), [
          ['auto', tr('Automático (o mínimo que trava)', 'Automatic (the minimum that locks)')], ['none', tr('Nenhum', 'None')], ['corners', tr('Esquadros nos cantos', 'Corner brackets')],
          ['diagonal', tr('Diagonal / X', 'Diagonal / X')], ['back', tr('Costas com painel', 'Back panel')],
        ], {
          hint: tr('O esqueleto é sempre autônomo: firme sem nenhuma skin.', 'The skeleton is always self-supporting: rigid without any skin.'),
          tip: tr(
            'Reforço que impede o esqueleto de deformar para os lados. Automático coloca só o necessário; use Diagonal ou Costas com painel para gabinetes altos ou pesados.',
            'Reinforcement that stops the skeleton from racking sideways. Automatic adds only what is needed; use Diagonal or Back panel for tall or heavy cabinets.',
          ),
        }),
      )
    : h('p', { class: 'note info' }, tr('Modo monolítico: o gabinete é uma peça única. Escolha "Esqueleto" para peças planas encaixadas.', 'Monolithic mode: the cabinet is a single piece. Choose "Skeleton" for flat interlocking parts.'))

  const skins = FACES.map(([f, name]) => {
    const s = p.skins[f]
    const base = `skins.${f}`
    const body = [
      checkField(pm<boolean>(`${base}.enabled`), tr('Gerar esta skin', 'Generate this skin'), {
        rebuild: true,
        tip: tr(
          'Liga uma parede externa nesta face. Sem skin o esqueleto fica aparente; com skin o gabinete fica fechado, mais bonito e protegido contra poeira.',
          'Adds an outer wall on this face. Without a skin the skeleton stays exposed; with one the cabinet is closed, neater and dust-protected.',
        ),
      }),
    ]
    if (s.enabled) {
      body.push(
        ...(faceFillControls((k) => pathModel(st, `${base}.${k}`) as never, 'skin', pathModel(st, 'smallestItem') as never) as HTMLElement[]),
        selectField<SkinAttach>(pm(`${base}.attach`), tr('Fixação da skin', 'Skin attachment'), [
          ['tabs', tr('Abas', 'Tabs')], ['clips', tr('Clipes', 'Clips')], ['screws', tr('Parafusos', 'Screws')], ['glue', tr('Cola', 'Glue')],
        ], {
          tip: tr(
            'Como a skin prende no esqueleto. Abas encaixam sem nada extra; clipes deixam remover; parafusos e cola são para fixar de vez.',
            'How the skin attaches to the skeleton. Tabs snap in with nothing extra; clips allow removal; screws and glue are for a permanent hold.',
          ),
        }),
      )
      if (s.fill === 'panel') {
        body.push(
          selectField<Standoff>(pm(`${base}.standoff`), tr('Afastamento', 'Standoff'), [
            ['spacers', tr('Espaçadores', 'Spacers')], ['pockets', tr('Bolsos por fenda', 'Slot pockets')], ['none', tr('Nenhum', 'None')],
          ], {
            rebuild: true,
            hint: tr('O painel precisa de folga atrás para as garras dos ganchos.', 'The panel needs clearance behind it for the hook claws.'),
            tip: tr(
              'Como o painel fica afastado do gabinete para os ganchos passarem. Espaçadores são simples; bolsos por fenda deixam o painel mais rente; Nenhum só se houver folga por outro meio.',
              'How the panel is held off the cabinet so hooks can pass. Spacers are simple; slot pockets keep the panel flatter; None only if clearance comes from elsewhere.',
            ),
          }),
        )
        if (s.standoff !== 'none') {
          body.push(
            autoField(pm<number | 'auto'>(`${base}.standoffMm`), tr('Recuo', 'Setback'), {
              min: 2, max: 60, step: 0.5, unit: 'mm', fallback: 20,
              tip: tr(
                'Distância entre o painel e o gabinete. Precisa ser maior que a garra do gancho (cerca de 10–20 mm); mais recuo rouba profundidade.',
                'Distance between the panel and the cabinet. It must exceed the hook claw (about 10–20 mm); more setback costs depth.',
              ),
            }),
          )
        }
      }
      body.push(
        colorField(pm<string>(`${base}.color`), tr('Cor', 'Color'), {
          tip: tr('Cor desta skin só na visualização 3D, para você se orientar. Não muda a impressão.', 'Color of this skin in the 3D view only, to help you orient. It does not change the print.'),
        }),
      )
    }
    return accordion(
      [name, h('span', { class: `acc-meta${s.enabled ? ' on' : ''}` }, s.enabled ? tr('ativa', 'on') : tr('desligada', 'off'))],
      body,
      { key: `skin-${f}` },
    )
  })

  const el = h(
    'div',
    { class: 'tab-body' },
    group(
      tr('Modo', 'Mode'),
      chips(pm<string>('cabinetMode'), tr('Construção', 'Construction'), [['skeleton', tr('Esqueleto', 'Skeleton')], ['monolithic', tr('Monolítico', 'Monolithic')]], {
        rebuild: true,
        tip: tr(
          'Esqueleto monta o gabinete com peças planas encaixadas, fáceis de imprimir em mesas pequenas. Monolítico é uma peça única, mais simples, mas exige mesa grande.',
          'Skeleton builds the cabinet from flat interlocking parts, easy to print on small beds. Monolithic is a single piece, simpler but needs a large bed.',
        ),
      }),
    ),
    skeletonGroup,
    group(tr('Skins (paredes externas)', 'Skins (outer walls)'), h('p', { class: 'hint' }, tr('Opcionais. A frente fica aberta para as gavetas.', 'Optional. The front stays open for the drawers.')), ...skins),
  )
  return { el }
}
