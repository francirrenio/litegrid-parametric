import { getLang, setLang, tr } from '../i18n'
import { PRESETS } from '../model/defaults'
import { confirmDialog, download, dropdown, h, icon, menuHeading, menuItem, toast } from './dom'
import { createExportMenu } from './export-menu'
import { slug } from '../export'
import { exportProjectText, importProjectText } from './storage'
import { shareUrl } from './share'
import { openHelp } from './help'
import type { Store } from './state'

export function createHeader(st: Store): HTMLElement {
  const name = h('input', {
    type: 'text', class: 'name-input', value: st.project.name, maxlength: 80, 'aria-label': tr('Nome do projeto', 'Project name'), spellcheck: 'false',
  })
  name.addEventListener('input', () => st.set('name', name.value.trim() === '' ? tr('Sem nome', 'Untitled') : name.value, false))
  name.addEventListener('keydown', (e) => e.key === 'Enter' && name.blur())
  const syncName = () => {
    if (document.activeElement !== name) name.value = st.project.name
  }
  st.on('rebuild', () => (name.value = st.project.name))
  st.on('projects', syncName)

  const projBtn = h('button', { type: 'button', class: 'btn' }, icon('folder', 16), h('span', { class: 'hide-sm' }, tr('Projetos', 'Projects')))
  const projects = dropdown(projBtn, () => {
    const list = st.listProjects()
    const items: HTMLElement[] = [menuHeading(tr('Projetos salvos', 'Saved projects'))]
    for (const m of list) {
      items.push(menuItem(m.name, () => st.switchTo(m.id), { active: m.id === st.projectId, icon: m.id === st.projectId ? 'check' : undefined }))
    }
    items.push(
      menuHeading(tr('Ações', 'Actions')),
      menuItem(tr('Novo projeto', 'New project'), () => st.newProject(), { icon: 'plus' }),
      menuItem(tr('Duplicar projeto atual', 'Duplicate current project'), () => st.duplicateProject(), { icon: 'copy' }),
      menuItem(tr('Renomear', 'Rename'), () => { name.focus(); name.select() }),
      menuItem(tr('Excluir projeto atual', 'Delete current project'), async () => {
        if (await confirmDialog(tr(`Excluir "${st.project.name}"? Isso não pode ser desfeito.`, `Delete "${st.project.name}"? This cannot be undone.`), tr('Excluir', 'Delete'))) st.removeProject(st.projectId)
      }, { icon: 'trash', danger: true }),
    )
    if (!st.repo.persistent) items.push(h('p', { class: 'menu-note' }, tr('Armazenamento do navegador indisponível: os projetos existem só nesta sessão. Use Salvar arquivo.', 'Browser storage unavailable: projects exist only in this session. Use Save file.')))
    return h('div', { class: 'menu-list' }, items)
  })

  const presetBtn = h('button', { type: 'button', class: 'btn' }, icon('preset', 16), h('span', { class: 'hide-sm' }, tr('Presets', 'Presets')))
  const presets = dropdown(presetBtn, () =>
    h('div', { class: 'menu-list' }, [
      menuHeading(tr('Novo projeto a partir de', 'New project from')),
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
      toast(tr(`Projeto "${project.name}" aberto.`, `Project "${project.name}" opened.`), 'ok')
    } catch (e) {
      toast(e instanceof Error ? e.message : tr('Não foi possível abrir o arquivo.', 'Could not open the file.'), 'error')
    }
  })
  const save = h('button', { type: 'button', class: 'btn', title: tr('Baixar o projeto como arquivo JSON', 'Download the project as a JSON file'), onClick: () => download(exportProjectText(st.project), `${slug(st.project.name)}.json`, 'application/json') }, icon('save', 16), h('span', { class: 'hide-sm' }, tr('Salvar arquivo', 'Save file')))
  const share = h(
    'button',
    {
      type: 'button',
      class: 'btn',
      title: tr('Copia um link com o projeto dentro; quem abrir o link recebe uma cópia', 'Copies a link with the project inside; whoever opens it gets a copy'),
      onClick: async () => {
        try {
          const url = await shareUrl(st.project, location.href)
          try {
            await navigator.clipboard.writeText(url)
          } catch {
            window.prompt(tr('Copie o link:', 'Copy the link:'), url)
          }
          toast(tr('Link copiado. Quem abrir recebe uma cópia do projeto.', 'Link copied. Whoever opens it gets a copy of the project.'), 'ok')
        } catch {
          toast(tr('Não foi possível criar o link.', 'Could not create the link.'), 'error')
        }
      },
    },
    icon('copy', 16),
    h('span', { class: 'hide-sm' }, tr('Copiar link', 'Copy link')),
  )
  const open = h('button', { type: 'button', class: 'btn', title: tr('Abrir um projeto salvo em JSON', 'Open a project saved as JSON'), onClick: () => file.click() }, icon('open', 16), h('span', { class: 'hide-sm' }, tr('Abrir arquivo', 'Open file')))

  const undoBtn = h('button', { type: 'button', class: 'btn icon-only', title: tr('Desfazer (Ctrl+Z)', 'Undo (Ctrl+Z)'), 'aria-label': tr('Desfazer', 'Undo'), onClick: () => st.undo() }, icon('undo', 17))
  const redoBtn = h('button', { type: 'button', class: 'btn icon-only', title: tr('Refazer (Ctrl+Shift+Z)', 'Redo (Ctrl+Shift+Z)'), 'aria-label': tr('Refazer', 'Redo'), onClick: () => st.redo() }, icon('redo', 17))
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

  const helpBtn = h('button', { type: 'button', class: 'btn', title: tr('Como usar o LiteGrid', 'How to use LiteGrid'), onClick: () => openHelp() }, h('span', { class: 'help-q', 'aria-hidden': 'true' }, '?'), h('span', { class: 'hide-sm' }, tr('Ajuda', 'Help')))
  const themeBtn = h('button', { type: 'button', class: 'btn icon-only', title: tr('Alternar tema claro e escuro', 'Switch between light and dark theme'), 'aria-label': tr('Alternar tema', 'Switch theme'), onClick: () => st.setTheme(st.theme === 'dark' ? 'light' : 'dark') })
  const paintTheme = () => {
    themeBtn.textContent = ''
    themeBtn.append(icon(st.theme === 'dark' ? 'sun' : 'moon', 17))
  }
  st.on('theme', paintTheme)
  paintTheme()

  const langSel = h(
    'select',
    { class: 'lang-select', 'aria-label': tr('Idioma', 'Language'), title: tr('Idioma', 'Language') },
    h('option', { value: 'pt' }, 'Português'),
    h('option', { value: 'en' }, 'English'),
  )
  langSel.value = getLang()
  langSel.addEventListener('change', () => {
    setLang(langSel.value === 'en' ? 'en' : 'pt')
    location.reload()
  })

  return h(
    'header',
    { class: 'hdr' },
    h(
      'div',
      { class: 'brand' },
      h('div', { class: 'logo', 'aria-hidden': 'true' }, icon('gabinete', 22)),
      h('div', { class: 'brand-text' }, h('div', { class: 'eyebrow mono' }, 'LiteGrid Parametric · mm'), name),
    ),
    h('div', { class: 'hdr-actions' }, undoBtn, redoBtn, projects, presets, save, open, share, file, helpBtn, langSel, themeBtn, createExportMenu(st)),
  )
}
