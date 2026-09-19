import { tr } from '../i18n'
import { h } from './dom'

const SEEN_KEY = 'litegrid:welcomed'

const STEPS: Array<[string, string]> = [
  [tr('1. Medidas', '1. Dimensions'), tr('Na aba Projeto, informe largura, altura e profundidade do gabinete e o diâmetro do bico da sua impressora. Não precisa calibrar nada.', 'In the Project tab, enter the cabinet width, height and depth and your printer nozzle diameter. Nothing needs calibrating.')],
  ['2. Layout', tr('Na aba Layout, divida o gabinete em seções e filas de gavetas. O desenho 3D atualiza sozinho.', 'In the Layout tab, split the cabinet into sections and rows of drawers. The 3D drawing updates by itself.')],
  [tr('3. Gavetas', '3. Drawers'), tr('Na aba Gavetas, escolha o tamanho das paredes, o fundo e a etiqueta. Clique numa gaveta no desenho para editar só ela.', 'In the Drawers tab, choose the wall size, the bottom and the label. Click a drawer in the drawing to edit only that one.')],
  [tr('4. Confira', '4. Check'), tr('Use Folgas (encaixe das gavetas), Montagem (passo a passo) e Medir (distância entre dois pontos) na barra do desenho.', 'Use Clearances (drawer fit), Assembly (step by step) and Measure (distance between two points) on the drawing toolbar.')],
  [tr('5. Imprima', '5. Print'), tr('Em Exportar, baixe o ZIP com as peças por mesa, o guia de montagem e o perfil do fatiador. Imprima antes a peça de teste para conferir os encaixes.', 'In Export, download the ZIP with the parts per bed, the assembly guide and the slicer profile. Print the test piece first to check the fits.')],
]

const TIPS: Array<[string, string]> = [
  [tr('Girar e mover o desenho', 'Rotate and pan the drawing'), tr('Botão esquerdo arrastando: girar. Botão direito arrastando: mover. Roda: zoom. Duplo clique: enquadrar.', 'Left button drag: rotate. Right button drag: pan. Wheel: zoom. Double-click: frame.')],
  [tr('Esconder ou colorir peças', 'Hide or colour parts'), tr('Botão Peças, no desenho 3D.', 'Parts button, in the 3D drawing.')],
  [tr('Desfazer', 'Undo'), tr('Ctrl+Z desfaz e Ctrl+Shift+Z refaz.', 'Ctrl+Z undoes and Ctrl+Shift+Z redoes.')],
  [tr('Compartilhar', 'Share'), tr('Copiar link gera um endereço com o projeto dentro. Salvar arquivo baixa um JSON para abrir depois.', 'Copy link creates an address with the project inside. Save file downloads a JSON to open later.')],
  [tr('Seus projetos', 'Your projects'), tr('Tudo é salvo automaticamente neste navegador, sem enviar nada para a internet.', 'Everything is saved automatically in this browser, nothing is sent to the internet.')],
]

function modal(title: string, body: HTMLElement[], onClose: () => void): HTMLElement {
  const close = h('button', { type: 'button', class: 'btn primary', onClick: onClose }, tr('Entendi', 'Got it'))
  const root = h(
    'div',
    { class: 'modal-back', onClick: (e: Event) => e.target === root && onClose(), onKeydown: (e: KeyboardEvent) => e.key === 'Escape' && onClose() },
    h('div', { class: 'modal help-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, h('h2', null, title), ...body, h('div', { class: 'acts wide' }, close)),
  )
  document.body.appendChild(root)
  close.focus()
  return root
}

export function openHelp(): void {
  const list = (items: Array<[string, string]>) =>
    h('dl', { class: 'help-list' }, items.flatMap(([t, d]) => [h('dt', null, t), h('dd', null, d)]))
  const root = modal(tr('Como usar o LiteGrid', 'How to use LiteGrid'), [h('h3', null, tr('Passo a passo', 'Step by step')), list(STEPS), h('h3', null, tr('Dicas', 'Tips')), list(TIPS)], () => root.remove())
}

/** First visit: a short welcome so nobody faces the app cold. */
export function maybeWelcome(): void {
  try {
    if (localStorage.getItem(SEEN_KEY)) return
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    return
  }
  const root = modal(
    tr('Bem-vindo ao LiteGrid', 'Welcome to LiteGrid'),
    [
      h('p', null, tr('Aqui você desenha um organizador de gavetas e baixa as peças prontas para imprimir em 3D. Tudo roda no seu navegador.', 'Here you design a drawer organizer and download the parts ready to 3D print. Everything runs in your browser.')),
      h('p', null, tr('O projeto de exemplo já está aberto: mexa nas medidas à esquerda e veja o desenho mudar. Quando quiser, o botão Ajuda mostra o passo a passo.', 'The example project is already open: change the dimensions on the left and watch the drawing change. Whenever you like, the Help button shows the step by step.')),
    ],
    () => root.remove(),
  )
}
