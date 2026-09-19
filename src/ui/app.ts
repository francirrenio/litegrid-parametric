import { createHeader } from './header'
import { fmt, h, toast } from './dom'
import { createPlatesView } from './plates-view'
import { createSidebar } from './sidebar'
import { severityOf, tabOfWarning, type Store, type ViewTab } from './state'
import { createView2D } from './view2d'
import { Viewer, type ViewOptions } from './viewer'

const VIEW_TABS: Array<[ViewTab, string]> = [['3d', '3D'], ['2d', 'Frontal 2D'], ['mesa', 'Mesa'], ['explodida', 'Explodida']]

const SIDE_LABEL: Record<string, string> = {
  projeto: 'Projeto', layout: 'Layout', gabinete: 'Gabinete', gavetas: 'Gavetas', fixacao: 'Fixação', avancado: 'Avançado', pecas: 'Peças',
}

export function mountApp(root: HTMLElement, st: Store): void {
  const applyTheme = () => {
    document.documentElement.dataset.theme = st.theme
  }
  applyTheme()

  /* viewport */
  const vpSelect = h(
    'select',
    { class: 'vp-select', 'aria-label': 'Visualização', onChange: (e: Event) => st.setView({ tab: (e.target as HTMLSelectElement).value as ViewTab }) },
    VIEW_TABS.map(([id, label]) => h('option', { value: id }, label)),
  )
  const busy = h('span', { class: 'busy', role: 'status', hidden: true }, h('span', { class: 'spin', 'aria-hidden': 'true' }), 'gerando…')
  const bbox = h('span', { class: 'bbox mono' })
  const tabsRow = h('div', { class: 'vp-row' }, vpSelect, busy, bbox)

  const glHost = h('div', { class: 'gl-host' })
  const pane3d = h('div', { class: 'pane pane3d' }, glHost)
  const v2 = createView2D(st)
  const pane2d = h('div', { class: 'pane' }, v2.el)
  const pv = createPlatesView(st)
  const paneMesa = h('div', { class: 'pane' }, pv.el)
  const emptyMsg = h('div', { class: 'empty-3d', hidden: true }, 'nenhuma peça gerada ainda')

  let viewer: Viewer | null = null
  try {
    viewer = new Viewer(glHost)
    viewer.onPickBay = (id) => st.selectBay(id)
  } catch (e) {
    console.error(e)
    glHost.append(h('div', { class: 'empty' }, h('b', null, 'Visualização 3D indisponível'), h('p', null, 'O navegador não conseguiu iniciar o WebGL. As demais abas continuam funcionando.')))
  }

  /* 3D overlay controls (built once, toggled by view state) */
  const toggle = (label: string, key: 'wire' | 'cotas' | 'grid' | 'corte') => {
    const b = h('button', { type: 'button', class: 'chip ov', onClick: () => st.setView({ [key]: !st.view[key] }) }, label)
    return b
  }
  const bWire = toggle('Wireframe', 'wire')
  const bCotas = toggle('Cotas', 'cotas')
  const bGrid = toggle('Grade', 'grid')
  const bCorte = toggle('Corte', 'corte')
  const bFrame = h('button', { type: 'button', class: 'chip ov', title: 'Enquadrar o gabinete (ou dê duplo clique)', onClick: () => viewer?.frame() }, 'Enquadrar')
  const toggles = h('div', { class: 'ov-toggles' }, bWire, bCotas, bGrid, bCorte, bFrame)

  const slider = (label: string, get: () => number, set: (v: number) => void, max = 100, step = 1) => {
    const input = h('input', { type: 'range', min: 0, max, step, value: get(), 'aria-label': label })
    input.addEventListener('input', () => set(Number(input.value)))
    const wrap = h('label', { class: 'ov-slider' }, h('span', null, label), input)
    return { wrap, input, sync: () => (input.value = String(get())) }
  }
  const sOpen = slider('Abertura das gavetas', () => st.view.abertura, (v) => st.setView({ abertura: v }))
  const sExp = slider('Explosão', () => Math.round(st.view.explosao * 100), (v) => st.setView({ explosao: v / 100 }))
  tabsRow.insertBefore(sOpen.wrap, busy)
  tabsRow.insertBefore(sExp.wrap, busy)
  const sCut = slider('Posição do corte', () => st.view.cortePos, (v) => st.setView({ cortePos: v }))
  const axis = h(
    'select',
    { class: 'ov-axis', 'aria-label': 'Eixo do corte', onChange: (e: Event) => st.setView({ corteEixo: (e.target as HTMLSelectElement).value as 'x' | 'y' | 'z' }) },
    // Print-bed axes: Z is up and Y is depth, while the model keeps Y up and Z toward the front.
    h('option', { value: 'x' }, 'corte lateral (X)'),
    h('option', { value: 'z' }, 'corte frontal (Y)'),
    h('option', { value: 'y' }, 'corte horizontal (Z)'),
  )
  const cutRow = h('div', { class: 'ov-cut' }, sCut.wrap, axis)
  const ovBottom = h('div', { class: 'ov-bottom' }, cutRow)
  pane3d.append(toggles, ovBottom, emptyMsg)

  const stage = h('div', { class: 'stage' }, pane3d, pane2d, paneMesa)

  /* cards */
  const cardParts = h('div', { class: 'card' })
  const cardDims = h('div', { class: 'card' })
  const cardPlates = h('div', { class: 'card' })
  const cardBays = h('div', { class: 'card' })
  const cards = h('div', { class: 'cards' }, cardParts, cardDims, cardPlates, cardBays)
  const setCard = (el: HTMLElement, label: string, value: string, sub: string, warn = false) => {
    el.textContent = ''
    el.classList.toggle('warn', warn)
    el.append(h('div', { class: 'card-label' }, label), h('div', { class: 'card-value mono' }, value), h('div', { class: 'card-sub' }, sub))
  }

  const warnsEl = h('section', { class: 'warns', 'aria-label': 'Avisos' })

  const paintCards = () => {
    const r = st.result
    const p = st.project
    const total = r.parts.reduce((s, x) => s + x.instances.length, 0)
    setCard(cardParts, 'Peças', String(total), r.parts.length ? `${r.parts.length} tipos diferentes` : 'nenhuma peça gerada ainda')
    const [lo, hi] = [st.bounds.lo, st.bounds.hi]
    const dims = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]]
    const grew = Math.abs(dims[0]! - p.width) > 0.05 || Math.abs(dims[1]! - p.height) > 0.05 || Math.abs(dims[2]! - p.depth) > 0.05
    setCard(cardDims, 'Medidas externas', dims.map((v) => fmt(v, 1)).join(' × '), grew ? 'largura × altura × profundidade, incluindo peças que passam do contorno' : 'largura × altura × profundidade (mm)')
    const over = st.plates.filter((x) => x.oversize).length
    setCard(cardPlates, 'Mesas', String(st.plates.length), st.plates.length ? `mesa de ${fmt(p.printBed.x, 0)} × ${fmt(p.printBed.y, 0)} mm${over ? ` · ${over} maior que a mesa` : ''}` : 'sem peças para distribuir', over > 0)
    const nSec = p.sections.length
    setCard(cardBays, 'Gavetas', String(r.layout.bays.length), `${nSec} ${nSec === 1 ? 'seção' : 'seções'}`)
    bbox.textContent = dims.map((v) => fmt(v, 0)).join(' × ') + ' mm'
  }

  const paintWarns = () => {
    const list = st.result.warnings
    warnsEl.textContent = ''
    if (list.length === 0) {
      warnsEl.append(h('div', { class: 'warn-row ok' }, h('b', { class: 'chip-sev ok' }, 'Ok'), h('span', null, 'Nenhum aviso para este projeto.')))
      return
    }
    for (const w of list) {
      const sev = severityOf(w)
      const bayId = w.where && st.result.layout.bays.some((b) => b.id === w.where) ? w.where : null
      const secMatch = w.where ? /^Seção (\d+)/.exec(w.where) : null
      const go = () => {
        if (bayId) st.selectBay(bayId, false)
        else if (secMatch) st.selectSection(Number(secMatch[1]) - 1)
        else st.setSideTab(tabOfWarning(w))
      }
      warnsEl.append(
        h(
          'button',
          { type: 'button', class: `warn-row ${sev}`, onClick: go, title: bayId || secMatch ? 'Selecionar no projeto' : `Abrir a aba ${SIDE_LABEL[tabOfWarning(w)]}` },
          h('b', { class: `chip-sev ${sev}` }, sev === 'error' ? 'Erro' : 'Aviso'),
          h('span', null, w.message),
        ),
      )
    }
  }

  /* wiring */
  const viewOptions = (): ViewOptions => {
    const v = st.view
    return {
      wire: v.wire, cotas: v.cotas, grid: v.grid, corte: v.corte, corteEixo: v.corteEixo, cortePos: v.cortePos,
      abertura: v.tab === '3d' ? v.abertura : 0,
      explosao: v.tab === 'explodida' ? v.explosao : 0,
      selectedBay: st.sel.bay,
    }
  }

  let lastTab: ViewTab | null = null
  const paintView = () => {
    const v = st.view
    vpSelect.value = v.tab
    const is3 = v.tab === '3d' || v.tab === 'explodida'
    pane3d.hidden = !is3
    pane2d.hidden = v.tab !== '2d'
    paneMesa.hidden = v.tab !== 'mesa'
    bWire.setAttribute('aria-pressed', String(v.wire))
    bCotas.setAttribute('aria-pressed', String(v.cotas))
    bGrid.setAttribute('aria-pressed', String(v.grid))
    bCorte.setAttribute('aria-pressed', String(v.corte))
    sOpen.wrap.hidden = v.tab !== '3d'
    sExp.wrap.hidden = v.tab !== 'explodida'
    cutRow.hidden = !v.corte
    axis.value = v.corteEixo
    sOpen.sync()
    sExp.sync()
    sCut.sync()
    if (is3) viewer?.setOptions(viewOptions())
    if (v.tab !== lastTab && lastTab !== null && (v.tab === 'explodida' || lastTab === 'explodida') && is3) viewer?.frame()
    lastTab = v.tab
    if (v.tab === 'mesa') pv.refresh()
    if (is3) requestAnimationFrame(() => viewer?.requestRender())
  }

  const paintResult = () => {
    viewer?.setResult(st.result, st.project)
    viewer?.setOptions(viewOptions())
    emptyMsg.hidden = st.result.parts.length > 0
    v2.refresh()
    pv.refresh()
    paintCards()
    paintWarns()
  }

  st.on('view', paintView)
  st.on('result', paintResult)
  st.on('selection', () => {
    viewer?.setOptions(viewOptions())
    v2.refresh()
  })
  st.on('busy', () => {
    busy.hidden = !st.busy
  })
  st.on('theme', () => {
    applyTheme()
    viewer?.setTheme(st.theme === 'dark')
  })
  viewer?.setTheme(st.theme === 'dark')

  const left = h('section', { class: 'left' }, tabsRow, stage, cards, warnsEl)
  const main = h('div', { class: 'main' }, left, createSidebar(st))
  root.append(createHeader(st), main)

  paintView()
  paintResult()
  if (!st.repo.persistent) toast('Armazenamento do navegador indisponível: as alterações não serão restauradas ao recarregar. Use Salvar arquivo.', 'error')
}
