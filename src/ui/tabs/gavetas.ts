import { LEVEL_LABEL, countBelow, hasValues, patchAt, resolveAt, scopeRoot, sourceOf, getIn, type Scope } from '../../model/resolve'
import type { PartGroup } from '../../model/part'
import type { DrawerFront, DrawerHandle } from '../../model/types'
import { tr } from '../../i18n'
import { deriveNozzle } from '../../core/nozzle'
import { hiddenInBay } from '../bayparts'
import { fmt, h } from '../dom'
import { autoField, btn, checkField, group, numField, pathModel, selectField, type Model } from '../fields'
import type { Store } from '../state'
import { faceFillControls, type TabView } from './common'

const sameScope = (a: Scope, b: Scope) => a.level === b.level && a.section === b.section && a.row === b.row && a.bay === b.bay

function scopeTitle(st: Store): string {
  const s = st.scope
  switch (s.level) {
    case 'global': return tr('Todas as gavetas (padrão)', 'All drawers (default)')
    case 'section': return tr(`Seção ${(s.section ?? 0) + 1}`, `Section ${(s.section ?? 0) + 1}`)
    case 'row': return tr(`Fila ${(s.row ?? 0) + 1} da seção ${(s.section ?? 0) + 1}`, `Row ${(s.row ?? 0) + 1} of section ${(s.section ?? 0) + 1}`)
    case 'bay': return tr(`Gaveta ${s.bay}`, `Drawer ${s.bay}`)
  }
}

function scopeTree(st: Store): HTMLElement {
  const p = st.project
  const bays = st.result.layout.bays
  const dot = (on: boolean) => (on ? h('span', { class: 'tree-dot', title: tr('Tem valores próprios neste nível', 'Has its own values at this level') }) : null)
  const node = (cls: string, label: string, meta: string, scope: Scope, has: boolean) =>
    h(
      'button',
      { type: 'button', class: `tree-btn ${cls}`, 'aria-pressed': String(sameScope(st.scope, scope)), onClick: () => st.setScope(scope) },
      h('span', { class: 'tree-label' }, label),
      h('span', { class: 'tree-meta' }, meta),
      dot(has),
    )

  const kids: HTMLElement[] = [
    node('lvl0', tr('Todas as gavetas', 'All drawers'), tr('padrão', 'default'), { level: 'global', section: null, row: null, bay: null }, false),
  ]
  p.sections.forEach((sec, si) => {
    const secBays = bays.filter((b) => b.section === si + 1)
    kids.push(
      node('lvl1', tr(`Seção ${si + 1}`, `Section ${si + 1}`), tr(`${secBays.length} gavetas`, `${secBays.length} drawers`), { level: 'section', section: si, row: null, bay: null }, hasValues(sec.drawer)),
    )
    sec.rows.forEach((row, ri) => {
      const rowBays = secBays.filter((b) => b.row === ri + 1)
      if (rowBays.length === 0) return
      kids.push(
        node(
          'lvl2', tr(`Fila ${ri + 1}`, `Row ${ri + 1}`), `${rowBays.length} × ${Math.round(rowBays[0]!.clearWidth)}×${Math.round(rowBays[0]!.clearHeight)} mm`,
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
                title: tr(`Gaveta ${b.id}`, `Drawer ${b.id}`), onClick: () => st.selectBay(b.id, false),
              },
              `C${b.col}`,
              dot(st.hasOverride(b.id)),
            ),
          ),
        ),
      )
    })
  })
  return h('div', { class: 'scope-tree', role: 'group', 'aria-label': tr('Onde aplicar os parâmetros', 'Where to apply the parameters') }, kids)
}

function withDefault<T>(m: Model<T>, fallback: T): Model<T> {
  return { ...m, get: () => m.get() ?? fallback }
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
  const below = countBelow(st.project, scope, st.result.layout.bays)

  const banner = h(
    'div',
    { class: `banner${isGlobal ? '' : ' accent'}` },
    h('span', null, tr('Editando: ', 'Editing: '), h('b', null, scopeTitle(st))),
    below > 0
      ? btn(tr(`Limpar exceções deste nível (${below})`, `Clear overrides at this level (${below})`), () => { st.clearBelow(scope); st.emit('selection') }, { sm: true, icon: 'reset', title: tr('Remove os valores próprios das filas e gavetas daqui, para todas seguirem os valores deste nível.', 'Removes the own values of the rows and drawers in here, so all of them follow this level.') })
      : null,
    own ? btn(tr('Voltar a herdar tudo', 'Inherit everything again'), () => st.unsetPath(root), { sm: true, icon: 'reset', title: tr('Remove os valores definidos só neste nível; ele volta a seguir o nível acima.', 'Removes the values set only at this level; it goes back to following the level above.') }) : null,
    scope.level === 'bay' && scope.bay && hiddenInBay(st.result, st.vis, scope.bay).length > 0
      ? btn(tr('Mostrar esta gaveta', 'Show this drawer'), () => {
          for (const e of hiddenInBay(st.result, st.vis, scope.bay!)) {
            if (e.kind === 'part') st.togglePart(e.id)
            else if (e.kind === 'group') st.toggleGroup(e.id as PartGroup)
            else st.showAll()
          }
          st.emit('selection')
        }, { sm: true, kind: 'primary', icon: 'eye' })
      : null,
    scope.level === 'bay' ? btn(tr('Desmarcar', 'Deselect'), () => st.selectBay(null), { sm: true, kind: 'ghost' }) : null,
    h(
      'p',
      { class: 'hint banner-hint' },
      isGlobal
        ? tr('Vale para todas as gavetas, a menos que uma seção, fila ou gaveta defina outro valor.', 'Applies to all drawers, unless a section, row or drawer sets another value.')
        : tr(`Cada campo mostra de onde vem o valor (${['Padrão', 'Seção', 'Fila', 'Gaveta'].join(', ')}). Mudar aqui cria uma exceção só neste nível; o × volta a herdar.`, `Each field shows where its value comes from (${['Default', 'Section', 'Row', 'Drawer'].join(', ')}). Changing it here creates an override at this level only; the × goes back to inheriting.`),
    ),
  )

  const nzOf = () => deriveNozzle(st.project.nozzle, st.project.advanced)
  const wallText = (n: number) => {
    const el = document.querySelector('[data-live=floor]')
    if (el && mk<number | 'auto'>('floorPerimeters').get() === 'auto') el.textContent = floorText(n)
    return wallLine(n)
  }
  const wallLine = (n: number) => tr(`Parede final: ${fmt(nzOf().wall(n), 2)} mm`, `Final wall: ${fmt(nzOf().wall(n), 2)} mm`)
  const floorText = (n: number) => {
    const nz = nzOf()
    const lh = nz.layerHeight
    const t = lh * Math.ceil(Math.max(0.9, nz.wall(n)) / lh - 1e-9)
    return tr(`Fundo final: ${fmt(t, 2)} mm (mínimo 0,9 mm)`, `Final floor: ${fmt(t, 2)} mm (minimum 0.9 mm)`)
  }
  const floorPerim = () =>
    autoField(mk<number | 'auto'>('floorPerimeters'), tr('Perímetros do fundo', 'Floor perimeters'), {
      min: 1, max: 6, fallback: Number(mk<number>('perimeters').get()), autoText: tr('igual às paredes', 'same as walls'),
      live: floorText, liveId: 'floor',
      tip: tr(
        'Espessura do fundo da gaveta, em perímetros. Automático usa o mesmo das paredes. Fundo mais grosso aguenta mais peso; mais fino economiza filamento (o mínimo é 0,9 mm).',
        'Thickness of the drawer floor, in perimeters. Auto uses the same as the walls. A thicker floor holds more weight; a thinner one saves filament (the minimum is 0.9 mm).',
      ),
    })
  const rs = resolveAt(st.project, st.scope)
  const frontModel: Model<DrawerFront> = { ...mk<DrawerFront>('front'), get: () => (rs.front === 'lip' ? 'flat' : rs.front) }
  const lipModel: Model<boolean> = {
    ...mk<boolean>('frontLip'),
    get: () => !!rs.frontLip || rs.front === 'lip',
    set: (v, rb) => {
      if (!v && rs.front === 'lip') mk<DrawerFront>('front').set('flat', false)
      mk<boolean>('frontLip').set(v, rb)
    },
  }
  const holderModel = mk<boolean>('labelHolder')
  const labelModel: Model<string> = {
    key: holderModel.key,
    get: () => (!rs.labelHolder ? 'none' : rs.labelMode ?? 'external'),
    set: (v, rb) => {
      if (v === 'none') holderModel.set(false, rb)
      else {
        mk<string>('labelMode').set(v, false)
        holderModel.set(true, rb)
      }
    },
    origin: holderModel.origin,
    reset: holderModel.reset,
  }
  const face = (title: string, sub: 'sides' | 'floor') =>
    group(title, ...(sub === 'floor' ? [floorPerim()] : []), ...(faceFillControls((k) => mk(`${sub}.${k}`) as never, 'drawer', pathModel(st, 'smallestItem') as never, sub === 'floor' ? 'floor' : undefined) as HTMLElement[]))

  const focusToggle = h('label', { class: 'vis-check focus-toggle' }, h('input', { type: 'checkbox', checked: st.view.autoFocus, 'aria-label': tr('Mostrar só uma gaveta ao editar', 'Show only one drawer while editing'), onChange: (e: Event) => st.setView({ autoFocus: (e.target as HTMLInputElement).checked }) }), h('span', null, tr('Mostrar só uma gaveta no 3D enquanto edito', 'Show only one drawer in 3D while I edit')))

  const el = h(
    'div',
    { class: 'tab-body' },
    group(tr('Onde aplicar', 'Where to apply'), scopeTree(st), focusToggle),
    banner,
    group(
      tr('Estrutura', 'Structure'),
      numField(mk<number>('perimeters'), tr('Perímetros das paredes', 'Wall perimeters'), {
        min: 1, max: 6, slider: true, live: wallText,
        tip: tr(
          'Quantas linhas de filamento formam as paredes da gaveta. Mais perímetros deixam a parede mais forte e pesada; 2 basta para gavetas leves, 3–4 para ferramentas.',
          'How many filament lines make up the drawer walls. More perimeters are stronger and heavier; 2 is enough for light drawers, 3–4 for tools.',
        ),
      }),
    ),
    face(tr('Laterais e traseira', 'Sides and rear'), 'sides'),
    face(tr('Fundo', 'Floor'), 'floor'),
    group(
      tr('Frente', 'Front'),
      selectField<DrawerFront>(frontModel, tr('Formato da frente', 'Front shape'), [['flat', tr('Lisa', 'Flat')], ['slope', tr('Chanfrada', 'Sloped')]], {
        rebuild: true,
        tip: tr(
          'Lisa é a mais simples; Chanfrada baixa a frente em um corte inclinado, o que facilita ver e pegar o conteúdo. A altura e o comprimento do chanfro são ajustáveis.',
          'Flat is simplest; Sloped lowers the front with an angled cut, which makes the contents easier to see and reach. The height and length of the slope are adjustable.',
        ),
      }),
      ...(rs.front === 'slope'
        ? [
            autoField(mk<number | 'auto'>('frontHeight'), tr('Altura da frente', 'Front height'), {
              min: 8, max: 300, unit: 'mm', fallback: 30, autoText: tr('automática', 'automatic'),
              hint: tr('Altura da parede da frente. As laterais descem até ela pelo chanfro.', 'Height of the front wall. The sides come down to it along the slope.'),
              tip: tr(
                'Altura da parede da frente. Automático usa cerca de 55% da altura da gaveta. Quanto mais baixa, mais fácil enxergar e alcançar o conteúdo, mas menos ele fica protegido.',
                'Height of the front wall. Automatic uses about 55% of the drawer height. The lower it is, the easier to see and reach the contents, but the less they are held in.',
              ),
            }),
            autoField(mk<number | 'auto'>('chamferLength'), tr('Comprimento do chanfro', 'Chamfer length'), {
              min: 6, max: 300, unit: 'mm', fallback: 30, autoText: tr('45°', '45°'),
              hint: tr('Distância, ao longo da gaveta, em que a lateral desce até a altura da frente.', 'Distance, along the drawer, over which the side comes down to the front height.'),
              tip: tr(
                'Comprimento do corte inclinado das laterais. Automático faz 45°. Mais comprido deixa a rampa mais suave; mais curto, mais íngreme. Limitado a 60% da profundidade.',
                'Length of the angled cut on the sides. Automatic makes 45°. Longer makes a gentler ramp; shorter a steeper one. Limited to 60% of the depth.',
              ),
            }),
          ]
        : []),
      selectField<DrawerHandle>(mk('handle'), tr('Puxador', 'Handle'), [['cutout', tr('Recorte', 'Cutout')], ['bar', tr('Fenda com apoio', 'Slot with catch')], ['none', tr('Sem puxador', 'No handle')]], {
        tip: tr(
          'Como puxar a gaveta. Nada sobressai da frente. Recorte é um vão para o dedo na borda; Fenda com apoio é uma abertura na frente com um apoio por dentro, mais firme para gavetas pesadas; Sem puxador só se você abrir de outro modo.',
          'How you pull the drawer. Nothing sticks out of the front. Cutout is a finger notch on the edge; Slot with catch is an opening in the front with a catch inside, firmer for heavy drawers; No handle only if you open it another way.',
        ),
      }),
      checkField(lipModel, tr('Aba no topo da frente', 'Lip on top of the front'), {
        rebuild: true,
        tip: tr(
          'Uma aba que avança para dentro da gaveta, no topo da frente. Reforça a frente e ajuda a segurar o conteúdo.',
          'A lip that reaches into the drawer along the top of the front. It stiffens the front and helps hold the contents.',
        ),
      }),
      ...(lipModel.get()
        ? [
            numField(withDefault(mk<number>('lipDepth'), 8), tr('Profundidade da aba', 'Lip depth'), {
              min: 3, max: 20, unit: 'mm', slider: true,
              tip: tr('Quanto a aba avança para dentro da gaveta. 6–10 mm é comum; mais fundo tampa parte da abertura.', 'How far the lip reaches into the drawer. 6–10 mm is common; deeper covers part of the opening.'),
            }),
          ]
        : []),
      selectField<string>(labelModel, tr('Porta-etiqueta', 'Label holder'), [
        ['none', tr('Nenhum', 'None')],
        ['internal', tr('Embutido na parede', 'Built into the wall')],
        ['external', tr('Externo (imprimir e colar)', 'External (print and glue)')],
      ], {
        rebuild: true,
        tip: tr(
          'Onde a etiqueta de papel entra. Embutido faz um canal na própria frente da gaveta, sem peça extra. Externo é uma moldura impressa à parte e colada num rebaixo da frente. Em nenhum dos dois algo sobressai da gaveta.',
          'Where the paper label goes. Built-in makes a groove in the drawer front itself, with no extra part. External is a frame printed separately and glued into a recess in the front. Neither sticks out of the drawer.',
        ),
      }),
      ...(labelModel.get() !== 'none'
        ? [
            numField(withDefault(mk<number>('labelWidth'), 40), tr('Largura da etiqueta', 'Label width'), {
              min: 12, max: 120, unit: 'mm', slider: true,
              hint: tr('O porta-etiqueta abre só nessa largura.', 'The label holder opens only at this width.'),
              tip: tr(
                'Largura da etiqueta de papel. Meça a etiqueta que você usa (40 mm é comum) e some 1 mm de folga; não passe da largura da gaveta.',
                'Width of the paper label. Measure the label you use (40 mm is common) and add 1 mm of slack; do not exceed the drawer width.',
              ),
            }),
            numField(withDefault(mk<number>('labelHeight'), 14), tr('Altura da etiqueta', 'Label height'), {
              min: 6, max: 40, unit: 'mm', slider: true,
              tip: tr(
                'Altura da etiqueta de papel. 12–15 mm cabe uma linha de texto; mais alto pede uma frente mais alta.',
                'Height of the paper label. 12–15 mm fits one line of text; taller needs a taller front.',
              ),
            }),
          ]
        : []),
    ),
    group(
      tr('Interior e bordas', 'Interior and edges'),
      numField(mk<number>('dividerSlots'), tr('Ranhuras para divisórias', 'Divider slots'), {
        min: 0, max: 12, slider: true,
        hint: tr('Divisórias removíveis ao longo da largura (0 = nenhuma).', 'Removable dividers along the width (0 = none).'),
        tip: tr(
          'Quantas divisórias soltas cabem na gaveta. Cada ranhura permite separar o interior em compartimentos, que você reorganiza quando quiser. 0 deixa a gaveta aberta.',
          'How many loose dividers fit in the drawer. Each slot lets you split the inside into compartments you can rearrange. 0 leaves the drawer open.',
        ),
      }),
      checkField(mk<boolean>('innerChamfer'), tr('Cantos internos chanfrados', 'Chamfered inner corners'), {
        tip: tr(
          'Arredonda em bisel o encontro entre o fundo e as paredes por dentro. Facilita pegar peças pequenas e reforça o canto; quase sempre vale ligar.',
          'Bevels the inside joint between floor and walls. Makes small parts easier to pick up and strengthens the corner; almost always worth turning on.',
        ),
      }),
      checkField(mk<boolean>('topRim'), tr('Borda superior reforçada', 'Reinforced top rim'), {
        rebuild: true,
        tip: tr(
          'Engrossa a borda de cima das paredes para elas não abrirem com o peso. Ligue em gavetas grandes, paredes vazadas ou carga pesada.',
          'Thickens the top edge of the walls so they do not spread under load. Turn it on for large drawers, perforated walls or heavy loads.',
        ),
      }),
      ...(rs.topRim
        ? [
            autoField(mk<number | 'auto'>('rimWidth'), tr('Largura da borda', 'Rim width'), {
              min: 1, max: 12, step: 0.1, unit: 'mm', fallback: 3, autoText: tr('automática', 'automatic'),
              tip: tr('Quanto a borda reforçada avança para dentro da gaveta. Automático usa cerca de 2,4 a 4,5 mm.', 'How far the reinforced rim reaches into the drawer. Automatic uses about 2.4 to 4.5 mm.'),
            }),
          ]
        : []),
    ),
  )
  return { el }
}

export { LEVEL_LABEL }
