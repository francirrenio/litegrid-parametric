import { tr } from '../i18n'
import { h, toast } from './dom'

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'
export const APP_COMMIT = typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__ : 'dev'
export const APP_BUILT = typeof __APP_BUILT__ === 'string' ? __APP_BUILT__ : ''

interface Entry {
  version: string
  date: string
  pt: string[]
  en: string[]
}

/** Newest first. Add an entry here (and bump package.json) with every release. */
export const CHANGELOG: Entry[] = [
  {
    version: '0.2.7',
    date: '2026-09-19',
    pt: ['"Limpar exceções deste nível" agora remove os valores próprios das filas e gavetas de dentro, e todas passam a seguir o nível selecionado. O botão antigo virou "Voltar a herdar tudo".'],
    en: ['"Clear overrides at this level" now removes the own values of the rows and drawers inside, so all of them follow the selected level. The old button became "Inherit everything again".'],
  },
  {
    version: '0.2.6',
    date: '2026-09-19',
    pt: ['Aba Gavetas reorganizada: Laterais, Fundo, Frente e Interior e bordas, cada uma só com o que vale para ela.', 'Fundo: escolha de espessura (automática, normal ou reforçada) no lugar do reforço das paredes; Moldura só aparece quando há furos.'],
    en: ['Drawers tab reorganised: Sides, Floor, Front and Interior and edges, each with only what applies to it.', 'Floor: thickness choice (automatic, normal or reinforced) instead of the wall reinforcement; Frame only shows when there are holes.'],
  },
  {
    version: '0.2.5',
    date: '2026-09-19',
    pt: ['Fundo da gaveta não mostra mais "Fechada até a altura", que não tinha efeito nele.', '"Menor item guardado" deixa claro que também define o tamanho dos furos.'],
    en: ['The drawer floor no longer shows "Solid up to height", which had no effect on it.', '"Smallest stored item" now says it also sets the hole size.'],
  },
  {
    version: '0.2.4',
    date: '2026-09-19',
    pt: ['Os perímetros da gaveta mostram a espessura final da parede na hora.', 'Novo: perímetros do fundo da gaveta como configuração separada (automático = igual às paredes).'],
    en: ['Drawer perimeters now show the final wall thickness right away.', 'New: drawer floor perimeters as a separate setting (auto = same as the walls).'],
  },
  {
    version: '0.2.3',
    date: '2026-09-19',
    pt: ['A vista 3D ganhou o controle de Explosão ao lado da abertura das gavetas.'],
    en: ['The 3D view now has an Explosion control next to the drawer opening.'],
  },
  {
    version: '0.2.2',
    date: '2026-09-19',
    pt: ['"Menor item guardado" saiu da aba Projeto e aparece junto do preenchimento, só quando a parede é Vazada.'],
    en: ['"Smallest stored item" moved out of the Project tab and now sits with the fill options, only when the wall is Perforated.'],
  },
  {
    version: '0.2.1',
    date: '2026-09-19',
    pt: ['3MF do Orca Slicer agora abre com uma placa por mesa: o arquivo leva um perfil LiteGrid (mesa, bico, camada, perímetros, sem preenchimento e sem suporte).'],
    en: ['The Orca Slicer 3MF now opens with one plate per bed: the file carries a LiteGrid profile (bed, nozzle, layer, perimeters, no infill, no supports).'],
  },
  {
    version: '0.2.0',
    date: '2026-09-19',
    pt: [
      'Português e English, com seletor de idioma no cabeçalho.',
      'Dicas de uso (?) em todos os parâmetros.',
      'Vista de folgas: cada vão fica verde, amarelo ou vermelho conforme a folga da gaveta.',
      'Guia de montagem passo a passo na vista 3D.',
      'Medição de distância entre dois pontos, nos eixos da mesa.',
      'Copiar link: compartilha o projeto inteiro em um endereço.',
      'Ajuda: boas-vindas na primeira visita e janela Como usar.',
      'Exportar 3MF com todas as mesas e 3MF para Orca Slicer (uma placa por mesa).',
      'Peça de teste para conferir os encaixes antes de imprimir tudo.',
      'Desfazer e refazer, foco automático na gaveta editada e destaque do que mudou.',
      'Vista Mesa com contornos reais e arrastar peças; escolha do tamanho da mesa.',
      'Esconder, isolar e colorir peças; cor por grupo.',
      'Parâmetros das gavetas por padrão, seção, fila e gaveta.',
      'Emendas em pilares com encaixes distribuídos e porta-etiqueta separado.',
      'Número da versão no cabeçalho e histórico de versões (esta janela).',
    ],
    en: [
      'Portuguese and English, with a language switch in the header.',
      'Usage tips (?) on every parameter.',
      'Clearance view: each bay turns green, amber or red by how much room the drawer has.',
      'Step-by-step assembly guide in the 3D view.',
      'Two-point distance measuring, in the print-bed axes.',
      'Copy link: shares the whole project as one address.',
      'Help: welcome on the first visit and a How to use window.',
      'Export a 3MF with all beds and a 3MF for Orca Slicer (one plate per bed).',
      'Test piece to check the fits before printing everything.',
      'Undo and redo, automatic focus on the drawer being edited, and highlight of what changed.',
      'Bed view with real outlines and draggable parts; print bed size selection.',
      'Hide, isolate and colour parts; colour per group.',
      'Drawer settings by default, section, row and drawer.',
      'Seams as posts with evenly spread joints, and a separate label holder.',
      'Version number in the header and version history (this window).',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-09-18',
    pt: [
      'Primeira versão: gerador paramétrico com esqueleto, gavetas, skins, fixações e exportação STL, 3MF e ZIP.',
      'Divisórias entre gavetas, trilhos largos e barras transversais.',
      'Layout respeita os perímetros escolhidos para a estrutura.',
    ],
    en: [
      'First version: parametric generator with skeleton, drawers, skins, fixings and STL, 3MF and ZIP export.',
      'Dividers between drawers, wide rails and cross bars.',
      'Layout respects the perimeters chosen for the structure.',
    ],
  },
]

export function openChangelog(latest: { version: string; commit: string } | null | undefined): void {
  const close = () => root.remove()
  const status = latest
    ? latest.commit === APP_COMMIT
      ? h('p', { class: 'ver-status ok' }, tr('Você está na última versão.', 'You are on the latest version.'))
      : h(
          'p',
          { class: 'ver-status warn' },
          tr(`Há uma versão mais nova (${latest.version}, ${latest.commit}). `, `A newer version is available (${latest.version}, ${latest.commit}). `),
          h('button', { type: 'button', class: 'btn sm primary', onClick: () => location.reload() }, tr('Recarregar', 'Reload')),
        )
    : h('p', { class: 'ver-status' }, tr('Não foi possível verificar se há versão mais nova.', 'Could not check for a newer version.'))
  const list = CHANGELOG.flatMap((e) => [
    h('h3', null, `v${e.version} · ${e.date}`),
    h('ul', { class: 'ver-list' }, (tr('pt', 'en') === 'pt' ? e.pt : e.en).map((t) => h('li', null, t))),
  ])
  const root = h(
    'div',
    { class: 'modal-back', onClick: (e: Event) => e.target === root && close(), onKeydown: (e: KeyboardEvent) => e.key === 'Escape' && close() },
    h(
      'div',
      { class: 'modal help-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': tr('Histórico de versões', 'Version history') },
      h('h2', null, tr('Histórico de versões', 'Version history')),
      h('p', { class: 'ver-now mono' }, `${tr('Rodando', 'Running')}: v${APP_VERSION} (${APP_COMMIT})${APP_BUILT ? ` · ${APP_BUILT.slice(0, 16).replace('T', ' ')} UTC` : ''}`),
      status,
      ...list,
      h('div', { class: 'acts wide' }, h('button', { type: 'button', class: 'btn primary', onClick: close }, tr('Fechar', 'Close'))),
    ),
  )
  document.body.appendChild(root)
}

/** Reads the published version.json (never cached); null when it is not reachable (dev server, offline). */
export async function fetchLatest(): Promise<{ version: string; commit: string } | null> {
  try {
    const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as { version?: string; commit?: string }
    return data.version && data.commit ? { version: data.version, commit: data.commit } : null
  } catch {
    return null
  }
}

let latest: { version: string; commit: string } | null | undefined
export async function checkForUpdate(onNewer: () => void): Promise<void> {
  latest = await fetchLatest()
  if (latest && latest.commit !== APP_COMMIT && APP_COMMIT !== 'dev') {
    onNewer()
    toast(tr('Há uma versão mais nova. Clique na versão para ver.', 'A newer version is available. Click the version to see.'), 'ok')
  }
}
export const latestKnown = () => latest
