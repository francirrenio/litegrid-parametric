import { GROUP_DEFAULT, GROUP_NAME, anyHidden, partColor } from './appearance'
import { hiddenInBay } from './bayparts'
import { createHeader } from './header'
import type { PartGroup } from '../model/part'
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
  const visPanel = h('div', { class: 'vis-panel', hidden: true })
  const bVis = h('button', {
    type: 'button', class: 'chip ov', 'aria-expanded': 'false', title: 'Mostrar, esconder e colorir peças',
    onClick: () => {
      visPanel.hidden = !visPanel.hidden
      bVis.setAttribute('aria-expanded', String(!visPanel.hidden))
      if (!visPanel.hidden) paintVis()
    },
  }, 'Peças')
  const toggles = h('div', { class: 'ov-toggles' }, bVis, bWire, bCotas, bGrid, bCorte, bFrame)
  const partPop = h('div', { class: 'part-pop', hidden: true, role: 'dialog', 'aria-label': 'Peça selecionada' })

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
  pane3d.append(toggles, visPanel, partPop, ovBottom, emptyMsg)

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
      vis: st.vis,
      colors: st.project.colors ?? { groups: {}, parts: {} },
    }
  }

  /* show, hide and colour */
  const paintVis = () => {
    visPanel.textContent = ''
    const parts = st.result.parts
    const groups = [...new Set(parts.map((p) => p.group))]
    const colors = st.project.colors
    visPanel.append(h('div', { class: 'vis-title' }, 'Mostrar e cores'))
    for (const g of groups) {
      const cur = colors?.groups[g] ?? GROUP_DEFAULT[g]
      const chk = h('input', { type: 'checkbox', checked: !st.vis.hiddenGroups.includes(g), 'aria-label': `Mostrar ${GROUP_NAME[g]}` })
      chk.addEventListener('change', () => st.toggleGroup(g))
      const col = h('input', { type: 'color', value: cur, class: 'swatch', 'aria-label': `Cor de ${GROUP_NAME[g]}` })
      col.addEventListener('input', () => st.setGroupColor(g, col.value))
      const reset = h('button', { type: 'button', class: 'lvl-x', title: 'Voltar à cor padrão', 'aria-label': 'Voltar à cor padrão', onClick: () => { st.setGroupColor(g, null); paintVis() } }, '×')
      visPanel.append(h('div', { class: 'vis-row' }, h('label', { class: 'vis-check' }, chk, h('span', null, GROUP_NAME[g])), col, colors?.groups[g] ? reset : null))
    }
    const one = h('input', { type: 'checkbox', checked: st.vis.isolateOne, 'aria-label': 'Só uma cópia' })
    one.addEventListener('change', () => { st.setIsolate(st.vis.isolate, one.checked); paintVis() })
    const iso = h(
      'select',
      { 'aria-label': 'Mostrar só uma peça', onChange: (e: Event) => { st.setIsolate((e.target as HTMLSelectElement).value || null); paintVis() } },
      h('option', { value: '' }, 'todas as peças'),
      parts.map((p) => h('option', { value: p.id, selected: p.id === st.vis.isolate }, `${p.label} (${p.instances.length})`)),
    )
    iso.value = st.vis.isolate ?? ''
    visPanel.append(h('div', { class: 'vis-iso' }, h('span', { class: 'lbl' }, 'Mostrar só'), iso, h('label', { class: 'vis-check' }, one, h('span', null, 'só uma cópia'))))
    const label = (id: string) => parts.find((p) => p.id === id)?.label ?? id
    if (st.vis.hiddenParts.length > 0) {
      visPanel.append(h('div', { class: 'vis-title' }, 'Escondidas'))
      for (const id of st.vis.hiddenParts) {
        visPanel.append(
          h('div', { class: 'vis-row' }, h('span', { class: 'vis-check' }, label(id)), h('button', { type: 'button', class: 'btn sm', onClick: () => { st.togglePart(id) } }, 'Mostrar')),
        )
      }
    }
    if (st.vis.isolate) visPanel.append(h('p', { class: 'hint' }, `Mostrando só: ${label(st.vis.isolate)}`))
    if (st.vis.isolateBay) visPanel.append(h('p', { class: 'hint' }, `Mostrando só a gaveta ${st.vis.isolateBay}`))
    if (anyHidden(st.vis)) visPanel.append(h('button', { type: 'button', class: 'btn sm', onClick: () => { st.showAll() } }, 'Mostrar tudo'))
  }

  const hidePop = () => {
    partPop.hidden = true
  }
  const showPop = (id: string | null, clientX: number, clientY: number, bayId: string | null = null) => {
    const part = id ? st.result.parts.find((p) => p.id === id) : undefined
    const hiddenHere = bayId ? hiddenInBay(st.result, st.vis, bayId) : []
    if (!part && hiddenHere.length === 0) return hidePop()
    partPop.textContent = ''
    if (part) {
      const colorNow = partColor(st.project.colors, part)
      const col = h('input', { type: 'color', value: colorNow, class: 'swatch', 'aria-label': `Cor de ${part.label}` })
      col.addEventListener('input', () => st.setPartColor(part.id, col.value))
      const own = !!st.project.colors?.parts[part.id]
      partPop.append(
        h('div', { class: 'pop-head' }, h('b', null, part.label), h('button', { type: 'button', class: 'lvl-x', 'aria-label': 'Fechar', onClick: hidePop }, '×')),
        h('div', { class: 'pop-meta mono' }, `${GROUP_NAME[part.group]} · ${part.instances.length} ${part.instances.length === 1 ? 'cópia' : 'cópias'}`),
        h('div', { class: 'pop-row' }, h('span', { class: 'lbl' }, 'Cor'), col, own ? h('button', { type: 'button', class: 'btn sm ghost', onClick: () => { st.setPartColor(part.id, null); showPop(id, clientX, clientY, bayId) } }, 'Cor do grupo') : null),
        h(
          'div',
          { class: 'pop-acts' },
          h('button', { type: 'button', class: 'btn sm', onClick: () => { st.togglePart(part.id); hidePop() } }, 'Esconder'),
          h('button', { type: 'button', class: 'btn sm', onClick: () => { if (part.group === 'gaveta' && bayId) st.setIsolateBay(bayId); else st.setIsolate(part.id, true); hidePop() } }, 'Só esta'),
          part.instances.length > 1 ? h('button', { type: 'button', class: 'btn sm', onClick: () => { st.setIsolate(part.id, false); hidePop() } }, 'Só as iguais') : null,
        ),
      )
    } else {
      partPop.append(h('div', { class: 'pop-head' }, h('b', null, 'Escondida neste lugar'), h('button', { type: 'button', class: 'lvl-x', 'aria-label': 'Fechar', onClick: hidePop }, '×')))
    }
    if (hiddenHere.length > 0) {
      const box = h('div', { class: 'pop-hidden' }, h('span', { class: 'lbl' }, 'Escondido aqui'))
      for (const e of hiddenHere) {
        box.append(
          h('button', {
            type: 'button', class: 'btn sm primary',
            onClick: () => {
              if (e.kind === 'part') st.togglePart(e.id)
              else if (e.kind === 'group') st.toggleGroup(e.id as PartGroup)
              else st.showAll()
              hidePop()
            },
          }, e.kind === 'all' ? 'Mostrar tudo' : `Mostrar ${e.label}`),
        )
      }
      partPop.append(box)
    }
    const r = pane3d.getBoundingClientRect()
    partPop.hidden = false
    const w = partPop.offsetWidth || 240
    const hh = partPop.offsetHeight || 150
    partPop.style.left = `${Math.max(8, Math.min(r.width - w - 8, clientX - r.left + 14))}px`
    partPop.style.top = `${Math.max(8, Math.min(r.height - hh - 8, clientY - r.top + 14))}px`
  }
  if (viewer) viewer.onPickPart = showPop
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hidePop()
  })

  let lastTab: ViewTab | null = null
  let lastVisSig = ''
  const paintView = () => {
    const v = st.view
    const sig = JSON.stringify(st.vis)
    const hiddenN = st.vis.isolate || st.vis.isolateBay ? 1 : st.vis.hiddenGroups.length + st.vis.hiddenParts.length
    bVis.textContent = hiddenN ? `Peças · ${hiddenN} ${hiddenN === 1 ? 'oculta' : 'ocultas'}` : 'Peças'
    bVis.classList.toggle('on', hiddenN > 0)
    bVis.setAttribute('aria-pressed', String(hiddenN > 0))
    if (sig !== lastVisSig) {
      lastVisSig = sig
      if (!visPanel.hidden) paintVis()
    }
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
    if (!visPanel.hidden) paintVis()
    hidePop()
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
