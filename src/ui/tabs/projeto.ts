import { deriveNozzle } from '../../core/nozzle'
import type { Material, MaterialLevel } from '../../model/types'
import { tr, num } from '../../i18n'
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
      row(tr('Largura de linha', 'Line width'), `${fmt(nz.lineWidth, 3)} mm`)
      row(tr('Altura de camada', 'Layer height'), `${fmt(nz.layerHeight, 2)} mm`)
      row(tr('Parede de 2 perímetros', '2-perimeter wall'), `${fmt(nz.wall(2), 2)} mm`)
      row(tr('Parede de 3 perímetros', '3-perimeter wall'), `${fmt(nz.wall(3), 2)} mm`)
    } catch {
      row(tr('Bico', 'Nozzle'), tr('valor inválido', 'invalid value'))
    }
  }
  refresh()

  const el = h(
    'div',
    { class: 'tab-body' },
    group(
      tr('Bico', 'Nozzle'),
      chips(pm<number>('nozzle'), tr('Diâmetro', 'Diameter'), [[0.25, num('0.25')], [0.4, num('0.4')], [0.6, num('0.6')], [0.8, num('0.8')]], {
        rebuild: true,
        tip: tr(
          'Diâmetro do bico da sua impressora, em mm. O padrão é 0,4. Bicos maiores imprimem mais rápido e com paredes mais grossas; menores dão mais detalhe.',
          'Your printer nozzle diameter in mm. The default is 0.4. Larger nozzles print faster with thicker walls; smaller ones give more detail.',
        ),
      }),
      numField(pm<number>('nozzle'), tr('Diâmetro livre', 'Custom diameter'), {
        min: 0.1, max: 2, step: 0.05, unit: 'mm', rebuild: true,
        tip: tr(
          'Use se o seu bico não está nas opções acima. Todas as paredes são calculadas em múltiplos da largura de linha derivada dele.',
          'Use this if your nozzle is not among the options above. All walls are computed as multiples of the line width derived from it.',
        ),
      }),
      derived,
    ),
    group(
      tr('Impressora', 'Printer'),
      field(tr('Mesa de impressão', 'Print bed'), bedPicker(st, false), {
        hint: tr('Define o tamanho máximo de cada peça e como as peças se distribuem nas mesas.', 'Sets the maximum size of each part and how parts are spread across beds.'),
        tip: tr(
          'Escolha o modelo da sua impressora ou informe o tamanho da mesa. Peças maiores que a mesa são avisadas, e as peças são agrupadas em placas que cabem nela.',
          'Pick your printer model or enter the bed size. Parts larger than the bed are flagged, and parts are grouped into plates that fit.',
        ),
      }),
    ),
    group(
      tr('Dimensões externas do gabinete', 'Cabinet outer dimensions'),
      numField(pm<number>('width'), tr('Largura', 'Width'), {
        min: 30, max: 2000, unit: 'mm', slider: true, sliderMin: 60, sliderMax: 800,
        tip: tr(
          'Largura total do gabinete, de lado a lado. Meça o espaço onde ele vai ficar e desconte 2–3 mm de folga.',
          'Total cabinet width, side to side. Measure the space where it will sit and subtract 2–3 mm of slack.',
        ),
      }),
      numField(pm<number>('height'), tr('Altura', 'Height'), {
        min: 30, max: 2000, unit: 'mm', slider: true, sliderMin: 40, sliderMax: 800,
        tip: tr(
          'Altura total do gabinete. Quanto mais alto, mais filas de gavetas cabem; gabinetes muito altos pedem mais travamento.',
          'Total cabinet height. Taller means more drawer rows fit; very tall cabinets need more bracing.',
        ),
      }),
      numField(pm<number>('depth'), tr('Profundidade', 'Depth'), {
        min: 30, max: 2000, unit: 'mm', slider: true, sliderMin: 40, sliderMax: 600,
        tip: tr(
          'Profundidade da frente até as costas, que é também o comprimento das gavetas. Mais fundo guarda mais, mas gavetas longas pesam e cedem mais.',
          'Depth from front to back, which is also the drawer length. Deeper stores more, but long drawers get heavy and sag more.',
        ),
      }),
    ),
    group(
      tr('Material', 'Material'),
      selectField<Material>(pm('material'), tr('Filamento', 'Filament'), [['PLA', 'PLA'], ['PETG', 'PETG'], ['ABS', 'ABS'], ['ASA', 'ASA'], ['PLA-CF', 'PLA-CF']], {
        hint: tr('PLA amolece perto de 55 °C e cede com carga contínua.', 'PLA softens near 55 °C and creeps under constant load.'),
        tip: tr(
          'Filamento que você vai usar; o programa ajusta espessuras e avisos a ele. PLA é o mais fácil, PETG resiste mais ao calor e a impactos, ABS/ASA aguentam sol e calor.',
          'The filament you will use; thicknesses and warnings are tuned to it. PLA is easiest, PETG resists heat and impact better, ABS/ASA handle sun and heat.',
        ),
      }),
      chips<MaterialLevel>(pm('materialLevel'), tr('Nível de material', 'Material level'), [['minimo', tr('Mínimo', 'Minimum')], ['equilibrado', tr('Equilibrado', 'Balanced')], ['reforcado', tr('Reforçado', 'Reinforced')]], {
        hint: tr('Mínimo usa só o necessário para ficar rígido; reforçado engrossa a estrutura.', 'Minimum uses only what is needed to stay rigid; reinforced thickens the structure.'),
        tip: tr(
          'Quanto material usar na estrutura. Equilibrado serve à maioria; Mínimo economiza filamento e tempo; Reforçado para cargas pesadas ou uso intenso.',
          'How much material to put into the structure. Balanced suits most; Minimum saves filament and time; Reinforced is for heavy loads or hard use.',
        ),
      }),
      numField(pm<number>('smallestItem'), tr('Menor item guardado', 'Smallest stored item'), {
        min: 1, max: 100, unit: 'mm', slider: true, sliderMax: 60,
        hint: tr('Limita o tamanho dos furos das paredes vazadas.', 'Limits the size of the holes in perforated walls.'),
        tip: tr(
          'Tamanho do menor objeto que não pode cair pelos furos. Ex.: 5 mm para parafusos pequenos, 20 mm para peças maiores. Valores menores fazem furos menores e mais paredes fechadas.',
          'Size of the smallest object that must not fall through the holes. E.g. 5 mm for small screws, 20 mm for larger items. Smaller values mean smaller holes and more solid walls.',
        ),
      }),
    ),
  )
  return { el, refresh }
}
