import type { DrawerConfig, DrawerFront, DrawerHandle } from '../../model/types'
import { h } from '../dom'
import { btn, checkField, group, numField, selectField, type Model } from '../fields'
import { getPath, type Store } from '../state'
import { faceFillControls, type TabView } from './common'

export function gavetasTab(st: Store): TabView {
  const bay = st.sel.bay
  const editingOverride = !!bay && st.hasOverride(bay)

  const mk = <T,>(sub: string): Model<T> => {
    if (editingOverride && bay) {
      return {
        key: `overrides.${bay}.${sub}`,
        get: () => (getPath(st.project.overrides[bay], sub) ?? getPath(st.project.drawerDefaults, sub)) as T,
        set: (v, rebuild) => st.set(`overrides.${bay}.${sub}`, v, rebuild),
      }
    }
    return {
      key: `drawerDefaults.${sub}`,
      get: () => getPath(st.project.drawerDefaults, sub) as T,
      set: (v, rebuild) => st.set(`drawerDefaults.${sub}`, v, rebuild),
    }
  }

  let banner: HTMLElement
  if (bay && editingOverride) {
    banner = h(
      'div',
      { class: 'banner accent' },
      h('span', null, 'Editando só a gaveta ', h('b', { class: 'mono' }, bay)),
      btn('Restaurar padrão', () => st.resetOverride(bay), { sm: true, icon: 'reset' }),
      btn('Desmarcar', () => st.selectBay(null), { sm: true, kind: 'ghost' }),
    )
  } else if (bay) {
    banner = h(
      'div',
      { class: 'banner' },
      h('span', null, 'Gaveta ', h('b', { class: 'mono' }, bay), ' usa os padrões.'),
      btn('Personalizar esta gaveta', () => st.startOverride(bay), { sm: true, kind: 'primary' }),
      btn('Desmarcar', () => st.selectBay(null), { sm: true, kind: 'ghost' }),
    )
  } else {
    banner = h(
      'div',
      { class: 'banner' },
      h('span', null, 'Padrões de todas as gavetas. Selecione uma gaveta na vista Frontal 2D ou em 3D para personalizá-la.'),
    )
  }

  const overrides = Object.keys(st.project.overrides)
  const overrideList =
    overrides.length > 0
      ? group(
          'Gavetas personalizadas',
          h(
            'div',
            { class: 'chips' },
            overrides.map((id) => h('button', { type: 'button', class: 'chip mono', 'aria-pressed': String(id === bay), onClick: () => st.selectBay(id) }, id)),
          ),
        )
      : null

  const gaveta = (title: string, sub: 'sides' | 'floor') =>
    group(title, ...(faceFillControls((k) => mk(`${sub}.${k}`) as never, 'drawer') as HTMLElement[]))

  const el = h(
    'div',
    { class: 'tab-body' },
    banner,
    overrideList,
    group('Estrutura', numField(mk<number>('perimeters'), 'Perímetros das paredes', { min: 1, max: 6, slider: true })),
    gaveta('Laterais e traseira', 'sides'),
    gaveta('Fundo', 'floor'),
    group(
      'Frente e acabamento',
      selectField<DrawerFront>(mk('front'), 'Frente', [['flat', 'Lisa'], ['slope', 'Chanfrada'], ['lip', 'Com aba']]),
      selectField<DrawerHandle>(mk('handle'), 'Puxador', [['cutout', 'Recorte'], ['bar', 'Barra'], ['none', 'Sem puxador']]),
      checkField(mk<boolean>('labelHolder'), 'Porta-etiqueta'),
      numField(mk<number>('dividerSlots'), 'Ranhuras para divisórias', { min: 0, max: 12, slider: true, hint: 'Divisórias removíveis ao longo da largura (0 = nenhuma).' }),
      checkField(mk<boolean>('innerChamfer'), 'Cantos internos chanfrados'),
      checkField(mk<boolean>('topRim'), 'Borda superior reforçada'),
    ),
  )
  return { el }
}

export type { DrawerConfig }
