import { manifestJson, partStl, planPlates, plateStl, slug } from '../../export'
import { generate } from '../../gen'
import type { Part } from '../../model/part'
import { btn } from '../fields'
import { isPartHidden, partColor } from '../appearance'
import { download, fmt, h, icon, toast } from '../dom'
import { tabOfWarning, type Store } from '../state'
import type { TabView } from './common'

const GROUP_LABEL: Record<Part['group'], string> = {
  gabinete: 'Gabinete', gaveta: 'Gaveta', skin: 'Skin', espacador: 'Espaçador', fixacao: 'Fixação', teste: 'Teste',
}

type Sub = 'lista' | 'manifesto' | 'sugestoes'
let currentSub: Sub = 'lista'

export function pecasTab(st: Store): TabView {
  const host = h('div', { class: 'tab-body' })
  const subBar = h('div', { class: 'subtabs', role: 'tablist' })
  const content = h('div', { class: 'sub-content' })
  host.append(subBar, content)

  const paint = () => {
    const sugg = st.result.suggestions
    const subs: Array<[Sub, string, number]> = [
      ['lista', 'Peças', 0],
      ['manifesto', 'Manifesto', 0],
      ['sugestoes', 'Sugestões', sugg.length],
    ]
    subBar.textContent = ''
    for (const [id, label, n] of subs) {
      subBar.append(
        h('button', {
          type: 'button', role: 'tab', class: 'subtab', 'aria-selected': String(currentSub === id),
          onClick: () => {
            currentSub = id
            paint()
          },
        }, label, n ? h('span', { class: 'count' }, n) : null),
      )
    }
    content.textContent = ''
    content.append(currentSub === 'lista' ? list(st, paint) : currentSub === 'manifesto' ? manifest(st) : suggestions(st))
  }
  paint()
  return { el: host, refresh: paint }
}

function list(st: Store, repaint: () => void): HTMLElement {
  const parts = st.result.parts
  if (parts.length === 0) {
    return h('div', { class: 'empty' }, h('b', null, 'Nenhuma peça gerada ainda'), h('p', null, 'As peças aparecem aqui conforme os geradores ficam disponíveis para este projeto.'))
  }
  const total = parts.reduce((s, p) => s + p.instances.length, 0)
  const testCard = h(
    'div',
    { class: 'test-card' },
    h('b', null, 'Peça de teste'),
    h('p', { class: 'hint' }, 'Antes de imprimir o conjunto, imprima esta peça pequena (uns minutos): uma gaveta em miniatura com as suas configurações e amostras dos encaixes. Se os encaixes ficarem soltos ou apertados, ajuste a folga em Avançado.'),
    h('label', { class: 'vis-check' }, h('input', { type: 'checkbox', checked: !!st.project.includeTestPiece, onChange: (e: Event) => st.set('includeTestPiece', (e.target as HTMLInputElement).checked, true) }), h('span', null, 'Incluir na lista de peças e no ZIP')),
    btn('Baixar peça de teste (STL)', () => {
      const test = generate({ ...st.project, includeTestPiece: true }).parts.filter((x) => x.group === 'teste')
      const pl = planPlates(test, st.project.printBed)[0]
      if (pl) download(plateStl(pl, test), `${slug(st.project.name)}-peca-de-teste.stl`, 'model/stl')
      else toast('Não foi possível gerar a peça de teste.', 'error')
    }, { icon: 'download', sm: true, kind: 'primary' }),
  )
  const rows = parts.map((p) => {
    const hidden = isPartHidden(st.vis, p.id) || st.vis.hiddenGroups.includes(p.group)
    const swatch = h('input', { type: 'color', class: 'swatch', value: partColor(st.project.colors, p), 'aria-label': `Cor de ${p.label}` })
    swatch.addEventListener('input', () => st.setPartColor(p.id, swatch.value))
    const eye = h('button', {
      type: 'button', class: 'btn sm ghost icon-only', title: hidden ? 'Mostrar peça' : 'Esconder peça', 'aria-label': hidden ? `Mostrar ${p.label}` : `Esconder ${p.label}`,
      'aria-pressed': String(!hidden), onClick: () => { st.togglePart(p.id); repaint() },
    }, icon(hidden ? 'eyeoff' : 'eye', 15))
    return h(
      'tr',
      { class: hidden ? 'dim-row' : '' },
      h('td', null, h('div', { class: 'plabel-row' }, swatch, h('span', { class: 'plabel' }, p.label), eye), p.note ? h('div', { class: 'hint' }, p.note) : null),
      h('td', null, GROUP_LABEL[p.group]),
      h('td', { class: 'mono num' }, `${p.instances.length}`),
      h('td', { class: 'mono' }, p.size.map((v) => fmt(v, 1)).join(' × ')),
      h('td', null, btn('', () => download(partStl(p), `${slug(p.id)}.stl`, 'model/stl'), { icon: 'download', sm: true, kind: 'ghost', title: `Baixar STL de ${p.label}` })),
    )
  })
  return h(
    'div',
    null,
    testCard,
    h('p', { class: 'hint' }, `${parts.length} tipos de peça, ${total} no total. Tamanho na mesa, em mm.`),
    h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        { class: 'parts' },
        h('thead', null, h('tr', null, ['Peça', 'Grupo', 'Qtd', 'Tamanho', ''].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', null, rows),
      ),
    ),
  )
}

function manifest(st: Store): HTMLElement {
  const text = manifestJson(st.result)
  return h(
    'div',
    null,
    h(
      'div',
      { class: 'acts wide' },
      btn('Copiar', async () => {
        try {
          await navigator.clipboard.writeText(text)
          toast('Manifesto copiado.', 'ok')
        } catch {
          toast('Não foi possível copiar; use Baixar.', 'error')
        }
      }, { icon: 'copy', sm: true }),
      btn('Baixar', () => download(text, 'layout_manifest.json', 'application/json'), { icon: 'download', sm: true }),
    ),
    h('pre', { class: 'json mono', tabindex: '0' }, text),
  )
}

function suggestions(st: Store): HTMLElement {
  const list = st.result.suggestions
  if (list.length === 0) return h('div', { class: 'empty' }, h('b', null, 'Sem sugestões'), h('p', null, 'Nada a melhorar no projeto atual.'))
  return h(
    'div',
    { class: 'sugg-list' },
    list.map((s) =>
      h(
        'article',
        { class: `sugg ${s.severity}` },
        h('div', { class: 'sugg-head' }, h('span', { class: `chip-sev ${s.severity === 'warn' ? 'warn' : 'info'}` }, s.severity === 'warn' ? 'Aviso' : 'Info'), h('b', null, s.title)),
        h('p', null, s.detail),
        s.target ? h('p', { class: 'hint mono' }, s.target) : null,
        s.patches.length
          ? btn('Aplicar', () => {
              st.applyPatches(s.patches)
              toast('Sugestão aplicada.', 'ok')
            }, { sm: true, kind: 'primary' })
          : null,
      ),
    ),
  )
}

export function pecasHasWarning(st: Store): boolean {
  return st.result.suggestions.some((s) => s.severity === 'warn') || st.result.warnings.some((w) => tabOfWarning(w) === 'pecas')
}
