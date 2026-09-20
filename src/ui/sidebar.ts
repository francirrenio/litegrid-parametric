import { tr } from '../i18n'
import { clear, h, icon } from './dom'
import { openKeys, setGroupScope } from './fields'
import { tabOfWarning, type SideTab, type Store } from './state'
import { avancadoTab } from './tabs/avancado'
import type { TabView } from './tabs/common'
import { fixacaoTab } from './tabs/fixacao'
import { gabineteTab } from './tabs/gabinete'
import { gavetasTab } from './tabs/gavetas'
import { layoutTab } from './tabs/layout'
import { pecasHasWarning, pecasTab } from './tabs/pecas'
import { projetoTab } from './tabs/projeto'

const TABS: Array<[SideTab, string, string]> = [
  ['projeto', tr('Projeto', 'Project'), 'projeto'],
  ['layout', 'Layout', 'layout'],
  ['gabinete', tr('Gabinete', 'Cabinet'), 'gabinete'],
  ['gavetas', tr('Gavetas', 'Drawers'), 'gavetas'],
  ['fixacao', tr('Fixação', 'Fastening'), 'fixacao'],
  ['avancado', tr('Avançado', 'Advanced'), 'avancado'],
  ['pecas', tr('Peças', 'Parts'), 'pecas'],
]

const BUILDERS: Record<SideTab, (st: Store) => TabView> = {
  projeto: projetoTab, layout: layoutTab, gabinete: gabineteTab, gavetas: gavetasTab,
  fixacao: fixacaoTab, avancado: avancadoTab, pecas: pecasTab,
}

export function createSidebar(st: Store): HTMLElement {
  const bar = h('div', { class: 'tabbar', role: 'tablist', 'aria-label': tr('Seções do projeto', 'Project sections') })
  const panel = h('div', { class: 'tab-panel', id: 'tabpanel', role: 'tabpanel', tabindex: '-1' })
  const handle = h('button', { type: 'button', class: 'sheet-handle', 'aria-label': tr('Expandir ou recolher painel', 'Expand or collapse panel'), 'aria-expanded': 'true' }, h('span', { class: 'grip' }))
  const side = h('aside', { class: 'side', 'aria-label': tr('Parâmetros', 'Parameters') }, handle, bar, panel)
  handle.addEventListener('click', () => {
    const c = side.classList.toggle('collapsed')
    handle.setAttribute('aria-expanded', String(!c))
  })

  let current: TabView | null = null
  const tabBtns = new Map<SideTab, HTMLButtonElement>()

  for (const [id, label, ic] of TABS) {
    const b = h(
      'button',
      {
        type: 'button', role: 'tab', class: 'tab', id: `tab-${id}`, 'aria-controls': 'tabpanel',
        onClick: () => {
          side.classList.remove('collapsed')
          handle.setAttribute('aria-expanded', 'true')
          st.setSideTab(id)
        },
        onKeydown: (e: KeyboardEvent) => {
          const i = TABS.findIndex((t) => t[0] === id)
          const j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : -1
          if (j >= 0 && j < TABS.length) {
            e.preventDefault()
            const next = TABS[j]![0]
            st.setSideTab(next)
            tabBtns.get(next)?.focus()
          }
        },
      },
      icon(ic, 17),
      h('span', { class: 'tab-label' }, label),
      h('span', { class: 'warn-dot', hidden: true, title: tr('Há avisos nesta aba', 'This tab has warnings') }),
    )
    tabBtns.set(id, b)
    bar.append(b)
  }

  const paintBar = () => {
    for (const [id, b] of tabBtns) {
      const on = id === st.sideTab
      b.setAttribute('aria-selected', String(on))
      b.tabIndex = on ? 0 : -1
    }
    panel.setAttribute('aria-labelledby', `tab-${st.sideTab}`)
  }

  const paintDots = () => {
    const w = st.result.warnings
    for (const [id, b] of tabBtns) {
      const has = id === 'pecas' ? pecasHasWarning(st) : w.some((x) => tabOfWarning(x) === id)
      const dot = b.querySelector<HTMLElement>('.warn-dot')
      if (dot) dot.hidden = !has
    }
  }

  const rebuild = () => {
    const top = panel.scrollTop
    const focusKey = (document.activeElement as HTMLElement | null)?.dataset?.key
    const inside = panel.contains(document.activeElement)
    clear(panel)
    try {
      setGroupScope(st.sideTab)
      current = BUILDERS[st.sideTab](st)
      panel.append(current.el)
    } catch (e) {
      console.error(e)
      current = null
      panel.append(h('p', { class: 'note error' }, tr('Não foi possível montar esta aba.', 'Could not build this tab.')))
    }
    panel.scrollTop = top
    if (inside && focusKey) {
      const esc = focusKey.replace(/"/g, '\\"')
      panel.querySelector<HTMLElement>(`[data-key="${esc}"]`)?.focus({ preventScroll: true })
    }
    paintBar()
    paintDots()
  }

  st.on('rebuild', rebuild)
  st.on('tab', () => {
    panel.scrollTop = 0
    rebuild()
  })
  st.on('selection', () => {
    if (st.sel.section != null) openKeys.add(`sec-${st.sel.section}`)
    if (st.sideTab === 'layout' || st.sideTab === 'gavetas') rebuild()
  })
  st.on('result', () => {
    paintDots()
    current?.refresh?.()
  })
  rebuild()
  return side
}
