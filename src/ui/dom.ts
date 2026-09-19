export type Child = Node | string | number | null | undefined | false | Child[]
export type Props = Record<string, unknown>

const LATE = new Set(['value', 'checked'])

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...kids: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false || LATE.has(k)) continue
      if (k === 'class') el.className = String(v)
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener)
      else if (k === 'disabled' || k === 'hidden') (el as unknown as Record<string, unknown>)[k] = true
      else el.setAttribute(k, v === true ? '' : String(v))
    }
    if (props.value != null) (el as unknown as { value: string }).value = String(props.value)
    if (props.checked != null) (el as unknown as { checked: boolean }).checked = Boolean(props.checked)
  }
  append(el, kids)
  return el
}

export function append(el: Node, kids: Child[]): void {
  for (const k of kids) {
    if (k == null || k === false) continue
    if (Array.isArray(k)) append(el, k)
    else el.appendChild(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(String(k)) : k)
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild)
}

export const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)

let uidN = 0
export const uid = (p = 'f'): string => `${p}${++uidN}`

const ICONS: Record<string, string> = {
  projeto: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="currentColor"/><circle cx="15" cy="12" r="2" fill="currentColor"/><circle cx="8" cy="18" r="2" fill="currentColor"/>',
  layout: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M12 3.5v17M3.5 12H12M12 9h8.5"/>',
  gabinete: '<path d="M4 8l8-4 8 4v9l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v9"/>',
  gavetas: '<rect x="4" y="4" width="16" height="7" rx="1.5"/><rect x="4" y="13" width="16" height="7" rx="1.5"/><path d="M10 7.5h4M10 16.5h4"/>',
  fixacao: '<path d="M9 15l6-6"/><path d="M10.5 6.5l1-1a4 4 0 015.7 5.7l-1 1M13.5 17.5l-1 1a4 4 0 01-5.7-5.7l1-1"/>',
  avancado: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
  pecas: '<path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z"/>',
  folder: '<path d="M3.5 7a2 2 0 012-2h4l2 2.5h7a2 2 0 012 2V17a2 2 0 01-2 2h-13a2 2 0 01-2-2z"/>',
  save: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14"/>',
  open: '<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 19h14"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>',
  download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14"/>',
  preset: '<path d="M12 3l2.4 5.6L20 9.3l-4.2 3.9 1.2 5.8L12 16l-5 3 1.2-5.8L4 9.3l5.6-.7z"/>',
  up: '<path d="M6 14l6-6 6 6"/>',
  down: '<path d="M6 10l6 6 6-6"/>',
  copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/>',
  trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  reset: '<path d="M4 12a8 8 0 108-8M4 4v5h5"/>',
  eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/>',
  eyeoff: '<path d="M3 3l18 18M10.6 5.7A9.9 9.9 0 0112 5.5C18.4 5.5 22 12 22 12a17 17 0 01-3.2 3.9M6.3 6.4A17 17 0 002 12s3.6 6.5 10 6.5a9.6 9.6 0 004-.9"/>',
  frame: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
}

export function icon(name: string, size = 18): SVGSVGElement {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  s.setAttribute('viewBox', '0 0 24 24')
  s.setAttribute('width', String(size))
  s.setAttribute('height', String(size))
  s.setAttribute('fill', 'none')
  s.setAttribute('stroke', 'currentColor')
  s.setAttribute('stroke-width', '1.8')
  s.setAttribute('stroke-linecap', 'round')
  s.setAttribute('stroke-linejoin', 'round')
  s.setAttribute('aria-hidden', 'true')
  s.innerHTML = ICONS[name] ?? ''
  return s
}

export interface MenuItemOpts {
  icon?: string
  disabled?: boolean
  danger?: boolean
  hint?: string
  active?: boolean
}

export function menuItem(label: string, onClick: () => void, o: MenuItemOpts = {}): HTMLButtonElement {
  return h(
    'button',
    {
      type: 'button',
      role: 'menuitem',
      class: `menu-item${o.danger ? ' danger' : ''}${o.active ? ' active' : ''}`,
      disabled: o.disabled,
      onClick,
    },
    o.icon ? icon(o.icon, 16) : null,
    h('span', { class: 'mi-label' }, label),
    o.hint ? h('span', { class: 'mi-hint' }, o.hint) : null,
  )
}

export function menuHeading(text: string): HTMLElement {
  return h('div', { class: 'menu-heading' }, text)
}

/** Button that opens a popover built on demand. Closes on outside click, Escape and after an item is used. */
export function dropdown(
  trigger: HTMLButtonElement,
  build: (close: () => void) => Child,
  align: 'left' | 'right' = 'left',
): HTMLElement {
  const pop = h('div', { class: `dd-pop ${align}`, role: 'menu', hidden: true })
  const wrap = h('div', { class: 'dd' }, trigger, pop)
  trigger.setAttribute('aria-haspopup', 'menu')
  trigger.setAttribute('aria-expanded', 'false')
  let open = false
  const onDoc = (e: Event) => {
    if (!wrap.contains(e.target as Node)) close()
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      close()
      trigger.focus()
    }
  }
  function close() {
    if (!open) return
    open = false
    pop.hidden = true
    trigger.setAttribute('aria-expanded', 'false')
    document.removeEventListener('pointerdown', onDoc, true)
    document.removeEventListener('keydown', onKey)
  }
  trigger.addEventListener('click', () => {
    if (open) return close()
    clear(pop)
    append(pop, [build(close)])
    pop.hidden = false
    open = true
    trigger.setAttribute('aria-expanded', 'true')
    document.addEventListener('pointerdown', onDoc, true)
    document.addEventListener('keydown', onKey)
    pop.querySelector<HTMLElement>('button:not([disabled]),input')?.focus()
  })
  pop.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('button.menu-item')) close()
  })
  return wrap
}

let toastHost: HTMLElement | null = null
export function toast(message: string, kind: 'info' | 'error' | 'ok' = 'info'): void {
  if (!toastHost) {
    toastHost = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' })
    document.body.appendChild(toastHost)
  }
  const t = h('div', { class: `toast ${kind}` }, message)
  toastHost.appendChild(t)
  setTimeout(() => t.remove(), kind === 'error' ? 6000 : 3200)
}

export function download(data: Blob | string, filename: string, mime = 'text/plain'): void {
  const blob = typeof data === 'string' ? new Blob([data], { type: `${mime};charset=utf-8` }) : data
  const url = URL.createObjectURL(blob)
  const a = h('a', { href: url, download: filename })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number): (...a: A) => void {
  let t: ReturnType<typeof setTimeout> | undefined
  return (...a) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...a), ms)
  }
}

export const fmt = (n: number, d = 1): string => {
  const s = n.toFixed(d)
  return (d > 0 ? s.replace(/\.?0+$/, '') : s).replace('.', ',')
}

export function confirmDialog(message: string, okLabel = 'Confirmar'): Promise<boolean> {
  return new Promise((resolve) => {
    const prev = document.activeElement as HTMLElement | null
    const done = (v: boolean) => {
      root.remove()
      prev?.focus?.()
      resolve(v)
    }
    const ok = h('button', { type: 'button', class: 'btn danger', onClick: () => done(true) }, okLabel)
    const cancel = h('button', { type: 'button', class: 'btn ghost', onClick: () => done(false) }, 'Cancelar')
    const root = h(
      'div',
      { class: 'modal-back', onClick: (e: Event) => e.target === root && done(false), onKeydown: (e: KeyboardEvent) => e.key === 'Escape' && done(false) },
      h('div', { class: 'modal', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': message }, h('p', null, message), h('div', { class: 'acts wide' }, cancel, ok)),
    )
    document.body.appendChild(root)
    cancel.focus()
  })
}
