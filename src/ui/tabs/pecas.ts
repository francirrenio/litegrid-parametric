import { manifestJson, partStl, planPlates, plateStl, slug } from '../../export'
import { generate } from '../../gen'
import type { Part } from '../../model/part'
import { tr } from '../../i18n'
import { btn } from '../fields'
import { isPartHidden, partColor } from '../appearance'
import { download, fmt, h, icon, toast } from '../dom'
import { tabOfWarning, type Store } from '../state'
import type { TabView } from './common'

const GROUP_LABEL: Record<Part['group'], string> = {
  gabinete: tr('Gabinete', 'Cabinet'), gaveta: tr('Gaveta', 'Drawer'), skin: 'Skin', espacador: tr('Espaçador', 'Spacer'), fixacao: tr('Fixação', 'Fixing'), teste: tr('Teste', 'Test'),
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
      ['lista', tr('Peças', 'Parts'), 0],
      ['manifesto', tr('Manifesto', 'Manifest'), 0],
      ['sugestoes', tr('Sugestões', 'Suggestions'), sugg.length],
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
    return h('div', { class: 'empty' }, h('b', null, tr('Nenhuma peça gerada ainda', 'No parts generated yet')), h('p', null, tr('As peças aparecem aqui conforme os geradores ficam disponíveis para este projeto.', 'Parts appear here as the generators become available for this project.')))
  }
  const total = parts.reduce((s, p) => s + p.instances.length, 0)
  const testCard = h(
    'div',
    { class: 'test-card' },
    h('b', null, tr('Peça de teste', 'Test piece')),
    h('p', { class: 'hint' }, tr('Antes de imprimir o conjunto, imprima esta peça pequena (uns minutos): uma gaveta em miniatura com as suas configurações e amostras dos encaixes. Se os encaixes ficarem soltos ou apertados, ajuste a folga em Avançado.', 'Before printing the whole set, print this small piece (a few minutes): a miniature drawer with your settings and joint samples. If the joints come out loose or tight, adjust the clearance in Advanced.')),
    h('label', { class: 'vis-check' }, h('input', { type: 'checkbox', checked: !!st.project.includeTestPiece, onChange: (e: Event) => st.set('includeTestPiece', (e.target as HTMLInputElement).checked, true) }), h('span', null, tr('Incluir na lista de peças e no ZIP', 'Include in the parts list and the ZIP'))),
    btn(tr('Baixar peça de teste (STL)', 'Download test piece (STL)'), () => {
      const test = generate({ ...st.project, includeTestPiece: true }).parts.filter((x) => x.group === 'teste')
      const pl = planPlates(test, st.project.printBed)[0]
      if (pl) download(plateStl(pl, test), `${slug(st.project.name)}-${tr('peca-de-teste', 'test-piece')}.stl`, 'model/stl')
      else toast(tr('Não foi possível gerar a peça de teste.', 'Could not generate the test piece.'), 'error')
    }, { icon: 'download', sm: true, kind: 'primary' }),
  )
  const rows = parts.map((p) => {
    const hidden = isPartHidden(st.vis, p.id) || st.vis.hiddenGroups.includes(p.group)
    const swatch = h('input', { type: 'color', class: 'swatch', value: partColor(st.project.colors, p), 'aria-label': tr(`Cor de ${p.label}`, `Color of ${p.label}`) })
    swatch.addEventListener('input', () => st.setPartColor(p.id, swatch.value))
    const eye = h('button', {
      type: 'button', class: 'btn sm ghost icon-only', title: hidden ? tr('Mostrar peça', 'Show part') : tr('Esconder peça', 'Hide part'), 'aria-label': hidden ? tr(`Mostrar ${p.label}`, `Show ${p.label}`) : tr(`Esconder ${p.label}`, `Hide ${p.label}`),
      'aria-pressed': String(!hidden), onClick: () => { st.togglePart(p.id); repaint() },
    }, icon(hidden ? 'eyeoff' : 'eye', 15))
    return h(
      'tr',
      { class: hidden ? 'dim-row' : '' },
      h('td', null, h('div', { class: 'plabel-row' }, swatch, h('span', { class: 'plabel' }, p.label), eye), p.note ? h('div', { class: 'hint' }, p.note) : null),
      h('td', null, GROUP_LABEL[p.group]),
      h('td', { class: 'mono num' }, `${p.instances.length}`),
      h('td', { class: 'mono' }, p.size.map((v) => fmt(v, 1)).join(' × ')),
      h('td', null, btn('', () => download(partStl(p), `${slug(p.id)}.stl`, 'model/stl'), { icon: 'download', sm: true, kind: 'ghost', title: tr(`Baixar STL de ${p.label}`, `Download STL of ${p.label}`) })),
    )
  })
  return h(
    'div',
    null,
    testCard,
    h('p', { class: 'hint' }, tr(`${parts.length} tipos de peça, ${total} no total. Tamanho na mesa, em mm.`, `${parts.length} part types, ${total} in total. Size on the bed, in mm.`)),
    h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        { class: 'parts' },
        h('thead', null, h('tr', null, [tr('Peça', 'Part'), tr('Grupo', 'Group'), tr('Qtd', 'Qty'), tr('Tamanho', 'Size'), ''].map((t) => h('th', { scope: 'col' }, t)))),
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
      btn(tr('Copiar', 'Copy'), async () => {
        try {
          await navigator.clipboard.writeText(text)
          toast(tr('Manifesto copiado.', 'Manifest copied.'), 'ok')
        } catch {
          toast(tr('Não foi possível copiar; use Baixar.', 'Could not copy; use Download.'), 'error')
        }
      }, { icon: 'copy', sm: true }),
      btn(tr('Baixar', 'Download'), () => download(text, 'layout_manifest.json', 'application/json'), { icon: 'download', sm: true }),
    ),
    h('pre', { class: 'json mono', tabindex: '0' }, text),
  )
}

function suggestions(st: Store): HTMLElement {
  const list = st.result.suggestions
  if (list.length === 0) return h('div', { class: 'empty' }, h('b', null, tr('Sem sugestões', 'No suggestions')), h('p', null, tr('Nada a melhorar no projeto atual.', 'Nothing to improve in the current project.')))
  return h(
    'div',
    { class: 'sugg-list' },
    list.map((s) =>
      h(
        'article',
        { class: `sugg ${s.severity}` },
        h('div', { class: 'sugg-head' }, h('span', { class: `chip-sev ${s.severity === 'warn' ? 'warn' : 'info'}` }, s.severity === 'warn' ? tr('Aviso', 'Warning') : 'Info'), h('b', null, s.title)),
        h('p', null, s.detail),
        s.target ? h('p', { class: 'hint mono' }, s.target) : null,
        s.patches.length
          ? btn(tr('Aplicar', 'Apply'), () => {
              st.applyPatches(s.patches)
              toast(tr('Sugestão aplicada.', 'Suggestion applied.'), 'ok')
            }, { sm: true, kind: 'primary' })
          : null,
      ),
    ),
  )
}

export function pecasHasWarning(st: Store): boolean {
  return st.result.suggestions.some((s) => s.severity === 'warn') || st.result.warnings.some((w) => tabOfWarning(w) === 'pecas')
}
