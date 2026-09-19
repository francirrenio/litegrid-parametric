import { PRESETS } from '../model/defaults'
import { confirmDialog, download, dropdown, h, icon, menuHeading, menuItem, toast } from './dom'
import { createExportMenu } from './export-menu'
import { slug } from '../export'
import { exportProjectText, importProjectText } from './storage'
import { shareUrl } from './share'
import type { Store } from './state'

export function createHeader(st: Store): HTMLElement {
  const name = h('input', {
    type: 'text', class: 'name-input', value: st.project.name, maxlength: 80, 'aria-label': 'Nome do projeto', spellcheck: 'false',
  })
  name.addEventListener('input', () => st.set('name', name.value.trim() === '' ? 'Sem nome' : name.value, false))
  name.addEventListener('keydown', (e) => e.key === 'Enter' && name.blur())
  const syncName = () => {
    if (document.activeElement !== name) name.value = st.project.name
  }
  st.on('rebuild', () => (name.value = st.project.name))
  st.on('projects', syncName)

  const projBtn = h('button', { type: 'button', class: 'btn' }, icon('folder', 16), h('span', { class: 'hide-sm' }, 'Projetos'))
  const projects = dropdown(projBtn, () => {
    const list = st.listProjects()
    const items: HTMLElement[] = [menuHeading('Projetos salvos')]
    for (const m of list) {
      items.push(menuItem(m.name, () => st.switchTo(m.id), { active: m.id === st.projectId, icon: m.id === st.projectId ? 'check' : undefined }))
    }
    items.push(
      menuHeading('Ações'),
      menuItem('Novo projeto', () => st.newProject(), { icon: 'plus' }),
      menuItem('Duplicar projeto atual', () => st.duplicateProject(), { icon: 'copy' }),
      menuItem('Renomear', () => { name.focus(); name.select() }),
      menuItem('Excluir projeto atual', async () => {
        if (await confirmDialog(`Excluir "${st.project.name}"? Isso não pode ser desfeito.`, 'Excluir')) st.removeProject(st.projectId)
      }, { icon: 'trash', danger: true }),
    )
    if (!st.repo.persistent) items.push(h('p', { class: 'menu-note' }, 'Armazenamento do navegador indisponível: os projetos existem só nesta sessão. Use Salvar arquivo.'))
    return h('div', { class: 'menu-list' }, items)
  })

  const presetBtn = h('button', { type: 'button', class: 'btn' }, icon('preset', 16), h('span', { class: 'hide-sm' }, 'Presets'))
  const presets = dropdown(presetBtn, () =>
    h('div', { class: 'menu-list' }, [
      menuHeading('Novo projeto a partir de'),
      ...Object.entries(PRESETS).map(([key, make]) => menuItem(make().name, () => st.newFromPreset(key))),
    ]),
  )

  const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true, 'aria-hidden': 'true', tabindex: '-1' })
  file.addEventListener('change', async () => {
    const f = file.files?.[0]
    file.value = ''
    if (!f) return
    try {
      const project = importProjectText(await f.text())
      st.newProject(project)
      toast(`Projeto "${project.name}" aberto.`, 'ok')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível abrir o arquivo.', 'error')
    }
  })
  const save = h('button', { type: 'button', class: 'btn', title: 'Baixar o projeto como arquivo JSON', onClick: () => download(exportProjectText(st.project), `${slug(st.project.name)}.json`, 'application/json') }, icon('save', 16), h('span', { class: 'hide-sm' }, 'Salvar arquivo'))
  const share = h(
    'button',
    {
      type: 'button',
      class: 'btn',
      title: 'Copia um link com o projeto dentro; quem abrir o link recebe uma cópia',
      onClick: async () => {
        try {
          const url = await shareUrl(st.project, location.href)
          try {
            await navigator.clipboard.writeText(url)
          } catch {
            window.prompt('Copie o link:', url)
          }
          toast('Link copiado. Quem abrir recebe uma cópia do projeto.', 'ok')
        } catch {
          toast('Não foi possível criar o link.', 'error')
        }
      },
    },
    icon('copy', 16),
    h('span', { class: 'hide-sm' }, 'Copiar link'),
  )
  const open = h('button', { type: 'button', class: 'btn', title: 'Abrir um projeto salvo em JSON', onClick: () => file.click() }, icon('open', 16), h('span', { class: 'hide-sm' }, 'Abrir arquivo'))

  const undoBtn = h('button', { type: 'button', class: 'btn icon-only', title: 'Desfazer (Ctrl+Z)', 'aria-label': 'Desfazer', onClick: () => st.undo() }, icon('undo', 17))
  const redoBtn = h('button', { type: 'button', class: 'btn icon-only', title: 'Refazer (Ctrl+Shift+Z)', 'aria-label': 'Refazer', onClick: () => st.redo() }, icon('redo', 17))
  const paintHistory = () => {
    undoBtn.disabled = !st.canUndo
    redoBtn.disabled = !st.canRedo
  }
  st.on('history', paintHistory)
  st.on('rebuild', paintHistory)
  paintHistory()
  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
    if (!(e.ctrlKey || e.metaKey)) return
    const k = e.key.toLowerCase()
    if (k === 'z' && !e.shiftKey) {
      e.preventDefault()
      st.undo()
    } else if ((k === 'z' && e.shiftKey) || k === 'y') {
      e.preventDefault()
      st.redo()
    }
  })

  const themeBtn = h('button', { type: 'button', class: 'btn icon-only', title: 'Alternar tema claro e escuro', 'aria-label': 'Alternar tema', onClick: () => st.setTheme(st.theme === 'dark' ? 'light' : 'dark') })
  const paintTheme = () => {
    themeBtn.textContent = ''
    themeBtn.append(icon(st.theme === 'dark' ? 'sun' : 'moon', 17))
  }
  st.on('theme', paintTheme)
  paintTheme()

  return h(
    'header',
    { class: 'hdr' },
    h(
      'div',
      { class: 'brand' },
      h('div', { class: 'logo', 'aria-hidden': 'true' }, icon('gabinete', 22)),
      h('div', { class: 'brand-text' }, h('div', { class: 'eyebrow mono' }, 'LiteGrid Parametric · mm'), name),
    ),
    h('div', { class: 'hdr-actions' }, undoBtn, redoBtn, projects, presets, save, open, share, file, themeBtn, createExportMenu(st)),
  )
}
