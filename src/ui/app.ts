import { getLang, num, tr } from '../i18n'
import { GROUP_DEFAULT, GROUP_NAME, anyHidden, partColor, partFamily } from './appearance'
import { hiddenInBay } from './bayparts'
import { computeClearances, summarize } from './clearance'
import { assemblySteps } from './assembly'
import { createHeader } from './header'
import type { PartGroup } from '../model/part'
import { fmt, h, toast } from './dom'
import { createPlatesView } from './plates-view'
import { createSidebar } from './sidebar'
import { severityOf, tabOfWarning, type Store, type ViewTab } from './state'
import { createView2D } from './view2d'
import { Viewer, type ViewOptions } from './viewer'

const VIEW_TABS: Array<[ViewTab, string]> = [['3d', '3D'], ['2d', tr('Frontal 2D', 'Front 2D')], ['mesa', tr('Mesa', 'Bed')], ['explodida', tr('Explodida', 'Exploded')]]

const SIDE_LABEL: Record<string, string> = {
  projeto: tr('Projeto', 'Project'), layout: 'Layout', gabinete: tr('Gabinete', 'Cabinet'), gavetas: tr('Gavetas', 'Drawers'), fixacao: tr('Fixação', 'Fastening'), avancado: tr('Avançado', 'Advanced'), pecas: tr('Peças', 'Parts'),
}

const MEASURE_HINT = tr('Medir: clique no primeiro ponto do modelo (ele gruda nos cantos próximos).', 'Measure: click the first point on the model (it snaps to nearby corners).')

export function mountApp(root: HTMLElement, st: Store): void {
  const applyTheme = () => {
    document.documentElement.dataset.theme = st.theme
  }
  applyTheme()
  document.documentElement.lang = getLang() === 'en' ? 'en' : 'pt-BR'

  /* viewport */
  const vpSelect = h(
    'select',
    { class: 'vp-select', 'aria-label': tr('Visualização', 'View'), onChange: (e: Event) => st.setView({ tab: (e.target as HTMLSelectElement).value as ViewTab }) },
    VIEW_TABS.map(([id, label]) => h('option', { value: id }, label)),
  )
  const busy = h('span', { class: 'busy', role: 'status', hidden: true }, h('span', { class: 'spin', 'aria-hidden': 'true' }), tr('gerando…', 'generating…'))
  const bbox = h('span', { class: 'bbox mono' })
  const tabsRow = h('div', { class: 'vp-row' }, vpSelect, busy, bbox)

  const glHost = h('div', { class: 'gl-host' })
  const pane3d = h('div', { class: 'pane pane3d' }, glHost)
  const v2 = createView2D(st)
  const pane2d = h('div', { class: 'pane' }, v2.el)
  const pv = createPlatesView(st)
  const paneMesa = h('div', { class: 'pane' }, pv.el)
  const emptyMsg = h('div', { class: 'empty-3d', hidden: true }, tr('nenhuma peça gerada ainda', 'no parts generated yet'))

  let viewer: Viewer | null = null
  let measureText = ''
  const measureChip = h('div', { class: 'clear-chip measure-chip', hidden: true, role: 'status' })
  try {
    viewer = new Viewer(glHost)
    viewer.onPickBay = (id) => st.selectBay(id)
    viewer.onMeasure = (m, n) => {
      measureText = m
        ? tr(`Distância ${fmt(m.dist, 2)} mm · X ${fmt(m.dx, 2)} · Y (profundidade) ${fmt(m.dy, 2)} · Z (altura) ${fmt(m.dz, 2)}. Clique de novo para medir outra.`, `Distance ${fmt(m.dist, 2)} mm · X ${fmt(m.dx, 2)} · Y (depth) ${fmt(m.dy, 2)} · Z (height) ${fmt(m.dz, 2)}. Click again to measure another.`)
        : n === 1 ? tr('Agora clique no segundo ponto.', 'Now click the second point.') : MEASURE_HINT
      measureChip.textContent = measureText
    }
  } catch (e) {
    console.error(e)
    glHost.append(h('div', { class: 'empty' }, h('b', null, tr('Visualização 3D indisponível', '3D view unavailable')), h('p', null, tr('O navegador não conseguiu iniciar o WebGL. As demais abas continuam funcionando.', 'The browser could not start WebGL. The other tabs keep working.'))))
  }

  /* 3D overlay controls (built once, toggled by view state) */
  const toggle = (label: string, key: 'wire' | 'cotas' | 'grid' | 'folgas' | 'diff' | 'corte') => {
    const b = h('button', { type: 'button', class: 'chip ov', onClick: () => st.setView({ [key]: !st.view[key] }) }, label)
    return b
  }
  const bWire = toggle('Wireframe', 'wire')
  const bCotas = toggle(tr('Cotas', 'Dimensions'), 'cotas')
  const bGrid = toggle(tr('Grade', 'Grid'), 'grid')
  const bFolgas = toggle(tr('Folgas', 'Clearances'), 'folgas')
  bFolgas.title = tr('Contorna cada vão em verde, amarelo ou vermelho conforme a folga da gaveta e escreve as folgas: lateral | topo | fundo', 'Outlines each bay in green, yellow or red according to the drawer clearance and prints the clearances: side | top | back')
  const bMont = h('button', { type: 'button', class: 'chip ov', onClick: () => st.setView({ montagem: st.view.montagem === null ? 1 : null }) }, tr('Montagem', 'Assembly'))
  bMont.title = tr('Mostra a montagem passo a passo: as peças aparecem na ordem em que se encaixam', 'Shows the assembly step by step: parts appear in the order they fit together')
  const bMedir = h('button', { type: 'button', class: 'chip ov', onClick: () => st.setView({ medir: !st.view.medir }) }, tr('Medir', 'Measure'))
  bMedir.title = tr('Clique em dois pontos do modelo para medir a distância', 'Click two points on the model to measure the distance')
  const bDiff = toggle(tr('Alterações', 'Changes'), 'diff')
  bDiff.title = tr('Destaca em laranja o que mudou na última alteração (também pisca sozinho por alguns segundos)', 'Highlights in orange what changed in the last edit (it also flashes on its own for a few seconds)')
  const bCorte = toggle(tr('Corte', 'Section'), 'corte')
  const bFrame = h('button', { type: 'button', class: 'chip ov', title: tr('Enquadrar o gabinete (ou dê duplo clique)', 'Frame the cabinet (or double-click)'), onClick: () => viewer?.frame() }, tr('Enquadrar', 'Frame'))
  const visPanel = h('div', { class: 'vis-panel', hidden: true })
  const bVis = h('button', {
    type: 'button', class: 'chip ov', 'aria-expanded': 'false', title: tr('Mostrar, esconder e colorir peças', 'Show, hide and colour parts'),
    onClick: () => {
      visPanel.hidden = !visPanel.hidden
      bVis.setAttribute('aria-expanded', String(!visPanel.hidden))
      if (!visPanel.hidden) paintVis()
    },
  }, tr('Peças', 'Parts'))
  const toggles = h('div', { class: 'ov-toggles' }, bVis, bWire, bCotas, bGrid, bFolgas, bMont, bMedir, bDiff, bCorte, bFrame)
  const partPop = h('div', { class: 'part-pop', hidden: true, role: 'dialog', 'aria-label': tr('Peça selecionada', 'Selected part') })
  const montBar = h('div', { class: 'mont-bar', hidden: true })
  const clearChip = h('div', { class: 'clear-chip', hidden: true, role: 'status' })
  const focusText = h('span', null)
  const focusChip = h('div', { class: 'focus-chip', hidden: true, role: 'status' }, focusText, h('button', { type: 'button', class: 'btn sm', onClick: () => st.setView({ autoFocus: false }) }, tr('Ver tudo', 'Show all')))

  const slider = (label: string, get: () => number, set: (v: number) => void, max = 100, step = 1) => {
    const input = h('input', { type: 'range', min: 0, max, step, value: get(), 'aria-label': label })
    input.addEventListener('input', () => set(Number(input.value)))
    const wrap = h('label', { class: 'ov-slider' }, h('span', null, label), input)
    return { wrap, input, sync: () => (input.value = String(get())) }
  }
  const sOpen = slider(tr('Abertura das gavetas', 'Drawer opening'), () => st.view.abertura, (v) => st.setView({ abertura: v }))
  const sExp = slider(tr('Explosão', 'Explosion'), () => Math.round(st.view.explosao * 100), (v) => st.setView({ explosao: v / 100 }))
  const sExp3 = slider(tr('Explosão', 'Explosion'), () => Math.round(st.view.explosao3d * 100), (v) => st.setView({ explosao3d: v / 100 }))
  tabsRow.insertBefore(sOpen.wrap, busy)
  tabsRow.insertBefore(sExp3.wrap, busy)
  tabsRow.insertBefore(sExp.wrap, busy)
  const sCut = slider(tr('Posição do corte', 'Section position'), () => st.view.cortePos, (v) => st.setView({ cortePos: v }))
  const axis = h(
    'select',
    { class: 'ov-axis', 'aria-label': tr('Eixo do corte', 'Section axis'), onChange: (e: Event) => st.setView({ corteEixo: (e.target as HTMLSelectElement).value as 'x' | 'y' | 'z' }) },
    // Print-bed axes: Z is up and Y is depth, while the model keeps Y up and Z toward the front.
    h('option', { value: 'x' }, tr('corte lateral (X)', 'side section (X)')),
    h('option', { value: 'z' }, tr('corte frontal (Y)', 'front section (Y)')),
    h('option', { value: 'y' }, tr('corte horizontal (Z)', 'horizontal section (Z)')),
  )
  const cutRow = h('div', { class: 'ov-cut' }, sCut.wrap, axis)
  const ovBottom = h('div', { class: 'ov-bottom' }, cutRow)
  pane3d.append(toggles, montBar, measureChip, clearChip, focusChip, visPanel, partPop, ovBottom, emptyMsg)

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

  const warnsEl = h('section', { class: 'warns', 'aria-label': tr('Avisos', 'Warnings') })

  const paintCards = () => {
    const r = st.result
    const p = st.project
    const total = r.parts.reduce((s, x) => s + x.instances.length, 0)
    setCard(cardParts, tr('Peças', 'Parts'), String(total), r.parts.length ? tr(`${r.parts.length} tipos diferentes`, `${r.parts.length} different types`) : tr('nenhuma peça gerada ainda', 'no parts generated yet'))
    const [lo, hi] = [st.bounds.lo, st.bounds.hi]
    const dims = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]]
    const grew = Math.abs(dims[0]! - p.width) > 0.05 || Math.abs(dims[1]! - p.height) > 0.05 || Math.abs(dims[2]! - p.depth) > 0.05
    setCard(cardDims, tr('Medidas externas', 'External size'), dims.map((v) => fmt(v, 1)).join(' × '), grew ? tr('largura × altura × profundidade, incluindo peças que passam do contorno', 'width × height × depth, including parts that stick out of the outline') : tr('largura × altura × profundidade (mm)', 'width × height × depth (mm)'))
    const over = st.plates.filter((x) => x.oversize).length
    setCard(cardPlates, tr('Mesas', 'Beds'), String(st.plates.length), st.plates.length ? tr(`mesa de ${fmt(p.printBed.x, 0)} × ${fmt(p.printBed.y, 0)} mm${over ? ` · ${over} maior que a mesa` : ''}`, `${fmt(p.printBed.x, 0)} × ${fmt(p.printBed.y, 0)} mm bed${over ? ` · ${over} larger than the bed` : ''}`) : tr('sem peças para distribuir', 'no parts to lay out'), over > 0)
    const nSec = p.sections.length
    setCard(cardBays, tr('Gavetas', 'Drawers'), String(r.layout.bays.length), `${nSec} ${nSec === 1 ? tr('seção', 'section') : tr('seções', 'sections')}`)
    bbox.textContent = dims.map((v) => fmt(v, 0)).join(' × ') + ' mm'
  }

  const paintWarns = () => {
    const list = st.result.warnings
    warnsEl.textContent = ''
    if (list.length === 0) {
      warnsEl.append(h('div', { class: 'warn-row ok' }, h('b', { class: 'chip-sev ok' }, 'Ok'), h('span', null, tr('Nenhum aviso para este projeto.', 'No warnings for this project.'))))
      return
    }
    for (const w of list) {
      const sev = severityOf(w)
      const bayId = w.where && st.result.layout.bays.some((b) => b.id === w.where) ? w.where : null
      const secMatch = w.where ? /^(?:Seção|Section) (\d+)/.exec(w.where) : null
      const go = () => {
        if (bayId) st.selectBay(bayId, false)
        else if (secMatch) st.selectSection(Number(secMatch[1]) - 1)
        else st.setSideTab(tabOfWarning(w))
      }
      warnsEl.append(
        h(
          'button',
          { type: 'button', class: `warn-row ${sev}`, onClick: go, title: bayId || secMatch ? tr('Selecionar no projeto', 'Select in the project') : tr(`Abrir a aba ${SIDE_LABEL[tabOfWarning(w)]}`, `Open the ${SIDE_LABEL[tabOfWarning(w)]} tab`) },
          h('b', { class: `chip-sev ${sev}` }, sev === 'error' ? tr('Erro', 'Error') : tr('Aviso', 'Warning')),
          h('span', null, w.message),
        ),
      )
    }
  }

  /* wiring */
  const viewOptions = (): ViewOptions => {
    const v = st.view
    return {
      wire: v.wire, cotas: v.cotas, grid: v.grid, folgas: v.folgas, corte: v.corte, corteEixo: v.corteEixo, cortePos: v.cortePos,
      abertura: v.tab === '3d' ? v.abertura : 0,
      explosao: v.tab === 'explodida' ? v.explosao : v.tab === '3d' ? v.explosao3d : 0,
      selectedBay: st.sel.bay,
      vis: st.effectiveVis(),
      colors: st.project.colors ?? { groups: {}, parts: {} },
    }
  }

  /* show, hide and colour */
  const paintVis = () => {
    visPanel.textContent = ''
    const parts = st.result.parts
    const groups = [...new Set(parts.map((p) => p.group))]
    const colors = st.project.colors
    visPanel.append(h('div', { class: 'vis-title' }, tr('Mostrar e cores', 'Show and colours')))
    for (const g of groups) {
      const cur = colors?.groups[g] ?? GROUP_DEFAULT[g]
      const chk = h('input', { type: 'checkbox', checked: !st.vis.hiddenGroups.includes(g), 'aria-label': tr(`Mostrar ${GROUP_NAME[g]}`, `Show ${GROUP_NAME[g]}`) })
      chk.addEventListener('change', () => st.toggleGroup(g))
      const col = h('input', { type: 'color', value: cur, class: 'swatch', 'aria-label': tr(`Cor de ${GROUP_NAME[g]}`, `Colour of ${GROUP_NAME[g]}`) })
      col.addEventListener('input', () => st.setGroupColor(g, col.value))
      const reset = h('button', { type: 'button', class: 'lvl-x', title: tr('Voltar à cor padrão', 'Back to default colour'), 'aria-label': tr('Voltar à cor padrão', 'Back to default colour'), onClick: () => { st.setGroupColor(g, null); paintVis() } }, '×')
      visPanel.append(h('div', { class: 'vis-row' }, h('label', { class: 'vis-check' }, chk, h('span', null, GROUP_NAME[g])), col, colors?.groups[g] ? reset : null))
    }
    const one = h('input', { type: 'checkbox', checked: st.vis.isolateOne, 'aria-label': tr('Só uma cópia', 'Only one copy') })
    one.addEventListener('change', () => { st.setIsolate(st.vis.isolate, one.checked); paintVis() })
    const iso = h(
      'select',
      { 'aria-label': tr('Mostrar só uma peça', 'Show only one part'), onChange: (e: Event) => { st.setIsolate((e.target as HTMLSelectElement).value || null); paintVis() } },
      h('option', { value: '' }, tr('todas as peças', 'all parts')),
      parts.map((p) => h('option', { value: p.id, selected: !!st.vis.isolate && partFamily(p.id) === partFamily(st.vis.isolate) }, `${p.label} (${p.instances.length})`)),
    )
    iso.value = parts.find((p) => st.vis.isolate && partFamily(p.id) === partFamily(st.vis.isolate!))?.id ?? ''
    visPanel.append(h('div', { class: 'vis-iso' }, h('span', { class: 'lbl' }, tr('Mostrar só', 'Show only')), iso, h('label', { class: 'vis-check' }, one, h('span', null, tr('só uma cópia', 'only one copy')))))
    const label = (id: string) => parts.find((p) => p.id === id)?.label ?? id
    if (st.vis.hiddenParts.length > 0) {
      visPanel.append(h('div', { class: 'vis-title' }, tr('Escondidas', 'Hidden')))
      for (const id of st.vis.hiddenParts) {
        visPanel.append(
          h('div', { class: 'vis-row' }, h('span', { class: 'vis-check' }, label(id)), h('button', { type: 'button', class: 'btn sm', onClick: () => { st.togglePart(id) } }, tr('Mostrar', 'Show'))),
        )
      }
    }
    if (st.vis.isolate) visPanel.append(h('p', { class: 'hint' }, tr(`Mostrando só: ${label(st.vis.isolate)}`, `Showing only: ${label(st.vis.isolate)}`)))
    if (st.vis.isolateBay) visPanel.append(h('p', { class: 'hint' }, tr(`Mostrando só a gaveta ${st.vis.isolateBay}`, `Showing only drawer ${st.vis.isolateBay}`)))
    if (anyHidden(st.vis)) visPanel.append(h('button', { type: 'button', class: 'btn sm', onClick: () => { st.showAll() } }, tr('Mostrar tudo', 'Show all')))
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
      const col = h('input', { type: 'color', value: colorNow, class: 'swatch', 'aria-label': tr(`Cor de ${part.label}`, `Colour of ${part.label}`) })
      col.addEventListener('input', () => st.setPartColor(part.id, col.value))
      const own = !!(st.project.colors?.parts[partFamily(part.id)] ?? st.project.colors?.parts[part.id])
      partPop.append(
        h('div', { class: 'pop-head' }, h('b', null, part.label), h('button', { type: 'button', class: 'lvl-x', 'aria-label': tr('Fechar', 'Close'), onClick: hidePop }, '×')),
        h('div', { class: 'pop-meta mono' }, `${GROUP_NAME[part.group]} · ${part.instances.length} ${part.instances.length === 1 ? tr('cópia', 'copy') : tr('cópias', 'copies')}`),
        h('div', { class: 'pop-row' }, h('span', { class: 'lbl' }, tr('Cor', 'Colour')), col, own ? h('button', { type: 'button', class: 'btn sm ghost', onClick: () => { st.setPartColor(part.id, null); showPop(id, clientX, clientY, bayId) } }, tr('Cor do grupo', 'Group colour')) : null),
        h(
          'div',
          { class: 'pop-acts' },
          h('button', { type: 'button', class: 'btn sm', onClick: () => { st.togglePart(part.id); hidePop() } }, tr('Esconder', 'Hide')),
          h('button', { type: 'button', class: 'btn sm', onClick: () => { if (part.group === 'gaveta' && bayId) st.setIsolateBay(bayId); else st.setIsolate(part.id, true); hidePop() } }, tr('Só esta', 'Only this')),
          part.instances.length > 1 ? h('button', { type: 'button', class: 'btn sm', onClick: () => { st.setIsolate(part.id, false); hidePop() } }, tr('Só as iguais', 'Only identical')) : null,
        ),
      )
    } else {
      partPop.append(h('div', { class: 'pop-head' }, h('b', null, tr('Escondida neste lugar', 'Hidden here')), h('button', { type: 'button', class: 'lvl-x', 'aria-label': tr('Fechar', 'Close'), onClick: hidePop }, '×')))
    }
    if (hiddenHere.length > 0) {
      const box = h('div', { class: 'pop-hidden' }, h('span', { class: 'lbl' }, tr('Escondido aqui', 'Hidden here')))
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
          }, e.kind === 'all' ? tr('Mostrar tudo', 'Show all') : tr(`Mostrar ${e.label}`, `Show ${e.label}`)),
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

  let diffTimer: ReturnType<typeof setTimeout> | undefined
  const paintDiff = () => {
    const flashing = Date.now() < st.diffUntil
    viewer?.setDiffVisible(st.view.diff || flashing)
    clearTimeout(diffTimer)
    if (flashing) diffTimer = setTimeout(() => viewer?.setDiffVisible(st.view.diff || Date.now() < st.diffUntil), st.diffUntil - Date.now() + 60)
  }

  let lastTab: ViewTab | null = null
  let lastVisSig = ''
  const paintView = () => {
    const v = st.view
    const sig = JSON.stringify(st.vis)
    const hiddenN = st.vis.isolate || st.vis.isolateBay ? 1 : st.vis.hiddenGroups.length + st.vis.hiddenParts.length
    bVis.textContent = hiddenN ? `${tr('Peças', 'Parts')} · ${hiddenN} ${hiddenN === 1 ? tr('oculta', 'hidden') : tr('ocultas', 'hidden')}` : tr('Peças', 'Parts')
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
    bDiff.setAttribute('aria-pressed', String(v.diff))
    bFolgas.setAttribute('aria-pressed', String(v.folgas))
    clearChip.hidden = !v.folgas || v.tab !== '3d'
    bMont.setAttribute('aria-pressed', String(v.montagem !== null))
    bMedir.setAttribute('aria-pressed', String(v.medir))
    viewer?.setMeasuring(v.medir && is3)
    measureChip.hidden = !v.medir || !is3
    if (!v.medir) measureText = ''
    if (v.medir && !measureText) measureChip.textContent = MEASURE_HINT
    paintMont()
    const fb = st.focusBay()
    focusChip.hidden = !fb || v.tab !== '3d'
    focusText.textContent = fb ? tr(`Mostrando só a gaveta ${fb} enquanto você edita.`, `Showing only drawer ${fb} while you edit.`) : ''
    paintDiff()
    bCorte.setAttribute('aria-pressed', String(v.corte))
    sOpen.wrap.hidden = v.tab !== '3d'
    sExp3.wrap.hidden = v.tab !== '3d'
    sExp3.sync()
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

  const paintMont = () => {
    const n = st.view.montagem
    montBar.hidden = n === null
    if (n === null) return
    const steps = assemblySteps(st.result.parts)
    const cur = steps[Math.min(n, steps.length) - 1]
    montBar.textContent = ''
    if (!cur) {
      montBar.append(h('span', null, tr('Sem peças para montar.', 'No parts to assemble.')))
      return
    }
    const go = (k: number) => st.setView({ montagem: Math.max(1, Math.min(steps.length, k)) })
    const prev = h('button', { type: 'button', class: 'btn sm', onClick: () => go(cur.n - 1) }, tr('‹ Anterior', '‹ Previous'))
    const next = h('button', { type: 'button', class: 'btn sm primary', onClick: () => go(cur.n + 1) }, tr('Próximo ›', 'Next ›'))
    if (cur.n === 1) prev.setAttribute('disabled', '')
    if (cur.n === steps.length) next.setAttribute('disabled', '')
    montBar.append(
      h('div', { class: 'mont-head' }, h('b', null, tr(`Passo ${cur.n} de ${steps.length}: ${cur.title}`, `Step ${cur.n} of ${steps.length}: ${cur.title}`)), h('button', { type: 'button', class: 'lvl-x', 'aria-label': tr('Sair da montagem', 'Exit assembly'), title: tr('Sair da montagem', 'Exit assembly'), onClick: () => st.setView({ montagem: null }) }, '×')),
      h('p', null, cur.text),
      h('p', { class: 'mont-parts' }, tr('Peças até aqui: ', 'Parts so far: ') + steps.slice(0, cur.n).flatMap((s) => s.parts).join(' · ')),
      h('div', { class: 'mont-nav' }, prev, next),
    )
  }

  const paintResult = () => {
    viewer?.setResult(st.result, st.project)
    viewer?.setDiff(st.lastDiff)
    paintDiff()
    const clears = computeClearances(st.result)
    viewer?.setClearances(clears)
    const sm = summarize(clears)
    clearChip.className = `clear-chip ${sm.bad ? 'bad' : sm.tight ? 'tight' : 'ok'}`
    clearChip.textContent = clears.length === 0
      ? tr('Sem gavetas para medir.', 'No drawers to measure.')
      : sm.bad
        ? tr(`${sm.bad} gaveta(s) com folga abaixo de 0,1 mm ou encostando na estrutura. Aumente a folga em Avançado.`, `${sm.bad} drawer(s) with clearance below 0.1 mm or touching the frame. Increase the clearance in Advanced.`)
        : sm.tight
          ? tr(`${sm.tight} gaveta(s) com folga apertada (0,1 a 0,2 mm). Pode emperrar; teste com a peça de teste.`, `${sm.tight} drawer(s) with tight clearance (0.1 to 0.2 mm). It may jam; try the test piece.`)
          : tr(`Folga mínima ${num(sm.worst.toFixed(2))} mm: tudo certo. Verde = folga boa, amarelo = apertada, vermelho = pode emperrar.`, `Minimum clearance ${num(sm.worst.toFixed(2))} mm: all good. Green = good clearance, yellow = tight, red = may jam.`)
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
  st.on('tab', paintView)
  st.on('selection', paintView)
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
  if (!st.repo.persistent) toast(tr('Armazenamento do navegador indisponível: as alterações não serão restauradas ao recarregar. Use Salvar arquivo.', 'Browser storage unavailable: changes will not be restored on reload. Use Save file.'), 'error')
}
