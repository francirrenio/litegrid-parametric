import type { FaceFill } from '../../model/types'
import { chips, checkField, numField, autoField, selectField, type Model } from '../fields'
import type { Child } from '../dom'

export interface TabView {
  el: HTMLElement
  refresh?: () => void
}

export const REINFORCEMENTS: Array<[FaceFill['reinforcement'], string]> = [
  ['auto', 'Automático'], ['none', 'Nenhum'], ['ribs', 'Nervuras'], ['postsBeams', 'Pilares e vigas'],
  ['truss', 'Treliça'], ['x', 'X'], ['corrugated', 'Ondulada'],
]

/** Controls of a FaceFill; `mk(key)` returns the model of that field (project defaults, skin or per-drawer override). */
export function faceFillControls(mk: (k: keyof FaceFill) => Model<never>, kind: 'skin' | 'drawer'): Child[] {
  const m = <T,>(k: keyof FaceFill) => mk(k) as unknown as Model<T>
  const fill = m<FaceFill['fill']>('fill')
  const cur = fill.get()
  const fillOptions: Array<[FaceFill['fill'], string]> =
    kind === 'skin'
      ? [['closed', 'Fechada'], ['perforated', 'Vazada'], ['truss', 'Treliça'], ['panel', 'Painel de fixação']]
      : [['closed', 'Fechada'], ['perforated', 'Vazada'], ['truss', 'Treliça']]
  const out: Child[] = [selectField(fill, 'Preenchimento', fillOptions, { rebuild: true })]
  if (cur === 'perforated') {
    out.push(
      chips(m<FaceFill['pattern']>('pattern'), 'Padrão dos furos', [
        ['triangle', 'Triângulo'], ['hexagon', 'Hexágono'], ['diamond', 'Losango'], ['circle', 'Círculo'],
      ]),
      numField(m<number>('openPercent'), 'Abertura', { min: 0, max: 90, unit: '%', slider: true, hint: 'Alvo de área vazada; o real pode ser menor (menor item e alma mínima).' }),
      numField(m<number>('solidUpTo'), 'Fechada até a altura', { min: 0, max: 500, unit: 'mm', slider: true, sliderMax: 120 }),
    )
  }
  if (cur === 'panel') {
    const sys = m<FaceFill['panelSystem']>('panelSystem')
    out.push(selectField(sys, 'Sistema', [['skadis', 'Skadis'], ['pegboard', 'Pegboard'], ['hsw', 'HSW']], { rebuild: true }))
    const s = sys.get()
    if (s === 'pegboard') out.push(chips(m<FaceFill['pegboardHole']>('pegboardHole'), 'Furo', [['1/4', '1/4"'], ['1/8', '1/8"']]))
    if (s === 'hsw') out.push(chips(m<FaceFill['hswVariant']>('hswVariant'), 'Variante', [['sd', 'SD (8 mm)'], ['hd', 'HD (10 mm)']]))
    if (s === 'skadis') out.push(checkField(m<boolean>('skadisStaggered'), 'Colunas intercaladas (grade real)'))
    out.push(autoField(m<number | 'auto'>('thickness'), 'Espessura do painel', { min: 2, max: 12, step: 0.5, unit: 'mm', fallback: 5 }))
  }
  if (cur !== 'none') {
    out.push(autoField(m<number | 'auto'>('frame'), 'Moldura', { min: 0.4, max: 30, step: 0.1, unit: 'mm', fallback: 1.6 }))
    if (cur !== 'panel') out.push(selectField(m<FaceFill['reinforcement']>('reinforcement'), 'Reforço', REINFORCEMENTS))
  }
  return out
}
