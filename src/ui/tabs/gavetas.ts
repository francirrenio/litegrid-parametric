import { LEVEL_LABEL, hasValues, patchAt, resolveAt, scopeRoot, sourceOf, getIn, type Scope } from '../../model/resolve'
import type { DrawerFront, DrawerHandle } from '../../model/types'
import { h } from '../dom'
import { btn, checkField, group, numField, selectField, type Model } from '../fields'
import type { Store } from '../state'
import { faceFillControls, type TabView } from './common'

const sameScope = (a: Scope, b: Scope) => a.level === b.level && a.section === b.section && a.row === b.row && a.bay === b.bay

function scopeTitle(st: Store): string {
  const s = st.scope
  switch (s.level) {
    case 'global': return 'Todas as gavetas (padrão)'
    case 'section': return `Seção ${(s.section ?? 0) + 1}`
    case 'row': return `Fila ${(s.row ?? 0) + 1} da seção ${(s.section ?? 0) + 1}`
    case 'bay': return `Gaveta ${s.bay}`
  }
}

function scopeTree(st: Store): HTMLElement {
  const p = st.project
  const bays = st.result.layout.bays
  const dot = (on: boolean) => (on ? h('span', { class: 'tree-dot', title: 'Tem valores próprios neste nível' }) : null)
  const node = (cls: string, label: string, meta: string, scope: Scope, has: boolean) =>
    h(
      'button',
      { type: 'button', class: `tree-btn ${cls}`, 'aria-pressed': String(sameScope(st.scope, scope)), onClick: () => st.setScope(scope) },
      h('span', { class: 'tree-label' }, label),
      h('span', { class: 'tree-meta' }, meta),
      dot(has),
    )

  const kids: HTMLElement[] = [
    node('lvl0', 'Todas as gavetas', 'padrão', { level: 'global', section: null, row: null, bay: null }, false),
  ]
  p.sections.forEach((sec, si) => {
    const secBays = bays.filter((b) => b.section === si + 1)
    kids.push(
      node('lvl1', `Seção ${si + 1}`, `${secBays.length} gavetas`, { level: 'section', section: si, row: null, bay: null }, hasValues(sec.drawer)),
    )
    sec.rows.forEach((row, ri) => {
      const rowBays = secBays.filter((b) => b.row === ri + 1)
      if (rowBays.length === 0) return
      kids.push(
        node(
          'lvl2', `Fila ${ri + 1}`, `${rowBays.length} × ${Math.round(rowBays[0]!.clearWidth)}×${Math.round(rowBays[0]!.clearHeight)} mm`,
          { level: 'row', section: si, row: ri, bay: null }, hasValues(row.drawer),
        ),
      )
      kids.push(
        h(
          'div',
          { class: 'tree-bays' },
          rowBays.map((b) =>
            h(
              'button',
              {
                type: 'button', class: 'chip mono tree-bay', 'aria-pressed': String(st.scope.bay === b.id),
                title: `Gaveta ${b.id}`, onClick: () => st.selectBay(b.id, false),
              },
              `C${b.col}`,
              dot(st.hasOverride(b.id)),
            ),
          ),
        ),
      )
    })
  })
  return h('div', { class: 'scope-tree', role: 'group', 'aria-label': 'Onde aplicar os parâmetros' }, kids)
}

export function gavetasTab(st: Store): TabView {
  const scope = st.scope
  const root = scopeRoot(scope)
  const isGlobal = scope.level === 'global'

  const mk = <T,>(sub: string): Model<T> => ({
    key: `${root}.${sub}`,
    get: () => getIn(resolveAt(st.project, st.scope), sub) as T,
    set: (v, rebuild) => st.set(`${root}.${sub}`, v, rebuild),
    origin: isGlobal
      ? undefined
      : () => {
          const level = sourceOf(st.project, st.scope, sub)
          return { level, here: level === st.scope.level }
        },
    reset: () => st.unsetPath(`${root}.${sub}`),
  })

  const patch = patchAt(st.project, scope)
  const own = !isGlobal && hasValues(patch)

  const banner = h(
    'div',
    { class: `banner${isGlobal ? '' : ' accent'}` },
    h('span', null, 'Editando: ', h('b', null, scopeTitle(st))),
    own ? btn('Limpar exceções deste nível', () => st.unsetPath(root), { sm: true, icon: 'reset' }) : null,
    scope.level === 'bay' ? btn('Desmarcar', () => st.selectBay(null), { sm: true, kind: 'ghost' }) : null,
    h(
      'p',
      { class: 'hint banner-hint' },
      isGlobal
        ? 'Vale para todas as gavetas, a menos que uma seção, fila ou gaveta defina outro valor.'
        : `Cada campo mostra de onde vem o valor (${['Padrão', 'Seção', 'Fila', 'Gaveta'].join(', ')}). Mudar aqui cria uma exceção só neste nível; o × volta a herdar.`,
    ),
  )

  const face = (title: string, sub: 'sides' | 'floor') =>
    group(title, ...(faceFillControls((k) => mk(`${sub}.${k}`) as never, 'drawer') as HTMLElement[]))

  const el = h(
    'div',
    { class: 'tab-body' },
    group('Onde aplicar', scopeTree(st)),
    banner,
    group('Estrutura', numField(mk<number>('perimeters'), 'Perímetros das paredes', { min: 1, max: 6, slider: true })),
    face('Laterais e traseira', 'sides'),
    face('Fundo', 'floor'),
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

export { LEVEL_LABEL }
