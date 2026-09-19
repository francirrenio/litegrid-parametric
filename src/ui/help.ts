import { h } from './dom'

const SEEN_KEY = 'litegrid:welcomed'

const STEPS: Array<[string, string]> = [
  ['1. Medidas', 'Na aba Projeto, informe largura, altura e profundidade do gabinete e o diâmetro do bico da sua impressora. Não precisa calibrar nada.'],
  ['2. Layout', 'Na aba Layout, divida o gabinete em seções e filas de gavetas. O desenho 3D atualiza sozinho.'],
  ['3. Gavetas', 'Na aba Gavetas, escolha o tamanho das paredes, o fundo e a etiqueta. Clique numa gaveta no desenho para editar só ela.'],
  ['4. Confira', 'Use Folgas (encaixe das gavetas), Montagem (passo a passo) e Medir (distância entre dois pontos) na barra do desenho.'],
  ['5. Imprima', 'Em Exportar, baixe o ZIP com as peças por mesa, o guia de montagem e o perfil do fatiador. Imprima antes a peça de teste para conferir os encaixes.'],
]

const TIPS: Array<[string, string]> = [
  ['Girar e mover o desenho', 'Botão esquerdo arrastando: girar. Botão direito arrastando: mover. Roda: zoom. Duplo clique: enquadrar.'],
  ['Esconder ou colorir peças', 'Botão Peças, no desenho 3D.'],
  ['Desfazer', 'Ctrl+Z desfaz e Ctrl+Shift+Z refaz.'],
  ['Compartilhar', 'Copiar link gera um endereço com o projeto dentro. Salvar arquivo baixa um JSON para abrir depois.'],
  ['Seus projetos', 'Tudo é salvo automaticamente neste navegador, sem enviar nada para a internet.'],
]

function modal(title: string, body: HTMLElement[], onClose: () => void): HTMLElement {
  const close = h('button', { type: 'button', class: 'btn primary', onClick: onClose }, 'Entendi')
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
  const root = modal('Como usar o LiteGrid', [h('h3', null, 'Passo a passo'), list(STEPS), h('h3', null, 'Dicas'), list(TIPS)], () => root.remove())
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
    'Bem-vindo ao LiteGrid',
    [
      h('p', null, 'Aqui você desenha um organizador de gavetas e baixa as peças prontas para imprimir em 3D. Tudo roda no seu navegador.'),
      h('p', null, 'O projeto de exemplo já está aberto: mexa nas medidas à esquerda e veja o desenho mudar. Quando quiser, o botão Ajuda mostra o passo a passo.'),
    ],
    () => root.remove(),
  )
}
