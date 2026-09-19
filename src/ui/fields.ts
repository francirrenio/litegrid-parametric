import { LEVEL_LABEL, type Level } from '../model/resolve'
import { tr } from '../i18n'
import { h, icon, uid, type Child } from './dom'
import type { Store } from './state'

/** A value the UI edits. `set(v, rebuild)`: rebuild asks for the sidebar to be recreated (structure changed). */
export interface Model<T = unknown> {
  key: string
  get(): T
  set(v: T, rebuild: boolean): void
  /** Where the value comes from when settings cascade; here = set at the level being edited. */
  origin?(): { level: Level; here: boolean } | undefined
  /** Drops the value set at the edited level so it is inherited again. */
  reset?(): void
}

export function originBadge(m: Model<never>): HTMLElement | null {
  const mm = m as Model<unknown>
  const o = mm.origin?.()
  if (!o) return null
  const badge = h(
    'span',
    { class: 'lvl lvl-' + o.level + (o.here ? ' here' : ''), title: o.here ? tr('Definido neste nível (', 'Set at this level (') + LEVEL_LABEL[o.level] + ')' : tr('Herdado de: ', 'Inherited from: ') + LEVEL_LABEL[o.level] },
    LEVEL_LABEL[o.level],
  )
  const reset = mm.reset
  if (o.here && o.level !== 'global' && reset) {
    return h(
      'span',
      { class: 'origin' },
      badge,
      h('button', { type: 'button', class: 'lvl-x', title: tr('Voltar a herdar', 'Inherit again'), 'aria-label': tr('Voltar a herdar', 'Inherit again'), onClick: () => reset() }, '×'),
    )
  }
  return badge
}

export function pathModel<T>(st: Store, path: string): Model<T> {
  return {
    key: path,
    get: () => st.get(path) as T,
    set: (v, rebuild) => st.set(path, v, rebuild),
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Small focusable "?" marker; the text shows as native title and as a CSS popover. */
export function tipEl(tip?: string): HTMLElement | null {
  if (!tip) return null
  return h('span', { class: 'tip', tabindex: '0', role: 'img', 'aria-label': tip, title: tip, 'data-tip': tip }, '?')
}

export function field(label: string, control: Child, opts: { id?: string; hint?: string; tip?: string; extra?: Child; model?: Model<never> } = {}): HTMLElement {
  return h(
    'div',
    { class: 'field' },
    h('div', { class: 'field-head' }, h('label', { class: 'lbl', for: opts.id }, label), tipEl(opts.tip), opts.extra, opts.model ? originBadge(opts.model) : null),
    control,
    opts.hint ? h('p', { class: 'hint' }, opts.hint) : null,
  )
}

export interface NumOpts {
  min: number
  max: number
  step?: number
  unit?: string
  slider?: boolean
  sliderMin?: number
  sliderMax?: number
  rebuild?: boolean
  hint?: string
  tip?: string
  /** Text under the field that follows the value while it changes (e.g. the resulting wall thickness). */
  live?: (v: number) => string
  /** Marks the live text (data-live) so other fields can refresh it. */
  liveId?: string
}

export function numField(m: Model<number>, label: string, o: NumOpts): HTMLElement {
  const id = uid()
  const step = o.step ?? 1
  const input = h('input', { type: 'number', id, min: o.min, max: o.max, step, value: m.get(), 'data-key': m.key, inputmode: 'decimal' })
  const range = o.slider
    ? h('input', {
        type: 'range', min: o.sliderMin ?? o.min, max: o.sliderMax ?? o.max, step, 'aria-label': label,
        value: clamp(m.get(), o.sliderMin ?? o.min, o.sliderMax ?? o.max),
      })
    : null
  const liveEl = o.live ? h('p', { class: 'hint live', 'data-live': o.liveId ?? '' }) : null
  const upd = (v: number) => {
    if (liveEl && o.live) liveEl.textContent = o.live(v)
  }
  upd(m.get())
  input.addEventListener('input', () => {
    const v = input.valueAsNumber
    if (Number.isFinite(v) && v >= o.min && v <= o.max) {
      if (range) range.value = String(v)
      upd(v)
      m.set(v, false)
    }
  })
  input.addEventListener('change', () => {
    let v = input.valueAsNumber
    if (!Number.isFinite(v)) v = m.get()
    v = clamp(v, o.min, o.max)
    input.value = String(v)
    if (range) range.value = String(v)
    upd(v)
    m.set(v, !!o.rebuild)
  })
  if (range) {
    range.addEventListener('input', () => {
      const v = Number(range.value)
      input.value = String(v)
      upd(v)
      m.set(v, false)
    })
    range.addEventListener('change', () => {
      if (o.rebuild) m.set(Number(range.value), true)
    })
  }
  const box = h('div', { class: 'numbox' }, input, o.unit ? h('span', { class: 'unit' }, o.unit) : null)
  const el = field(label, h('div', { class: 'numrow' }, range, box), { id, hint: o.hint, tip: o.tip, model: m as Model<never> })
  if (liveEl) el.append(liveEl)
  return el
}

export interface AutoOpts extends NumOpts {
  fallback?: number
  autoText?: string
}

/** number | 'auto' */
export function autoField(m: Model<number | 'auto'>, label: string, o: AutoOpts): HTMLElement {
  const id = uid()
  const cur = m.get()
  const isAuto = cur === 'auto'
  const liveEl = o.live ? h('p', { class: 'hint live', 'data-live': o.liveId ?? '' }) : null
  const upd = (v: number | 'auto') => {
    if (liveEl && o.live) liveEl.textContent = o.live(v === 'auto' ? (o.fallback ?? o.min) : v)
  }
  upd(cur)
  const input = h('input', {
    type: 'number', id, min: o.min, max: o.max, step: o.step ?? 1, inputmode: 'decimal', 'data-key': m.key,
    value: isAuto ? '' : cur, placeholder: o.autoText ?? tr('auto', 'auto'), disabled: isAuto,
  })
  const chk = h('input', { type: 'checkbox', checked: isAuto, 'aria-label': `${label}: ${tr('automático', 'automatic')}` })
  let last = typeof cur === 'number' ? cur : (o.fallback ?? o.min)
  chk.addEventListener('change', () => {
    if (chk.checked) {
      input.disabled = true
      input.value = ''
      upd('auto')
      m.set('auto', !!o.rebuild)
    } else {
      input.disabled = false
      input.value = String(last)
      upd(last)
      m.set(last, !!o.rebuild)
      input.focus()
    }
  })
  input.addEventListener('input', () => {
    const v = input.valueAsNumber
    if (Number.isFinite(v) && v >= o.min && v <= o.max) {
      last = v
      upd(v)
      m.set(v, false)
    }
  })
  input.addEventListener('change', () => {
    const v = clamp(Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : last, o.min, o.max)
    last = v
    input.value = String(v)
    m.set(v, !!o.rebuild)
  })
  const box = h('div', { class: 'numbox' }, input, o.unit ? h('span', { class: 'unit' }, o.unit) : null)
  const auto = h('label', { class: 'auto-chk' }, chk, h('span', null, tr('auto', 'auto')))
  const el = field(label, h('div', { class: 'numrow' }, box, auto), { id, hint: o.hint, tip: o.tip, model: m as Model<never> })
  if (liveEl) el.append(liveEl)
  return el
}

/** Empty = automatic (undefined), with a restore button. */
export function optField(m: Model<number | undefined>, label: string, o: NumOpts & { placeholder: string }): HTMLElement {
  const id = uid()
  const v0 = m.get()
  const input = h('input', {
    type: 'number', id, min: o.min, max: o.max, step: o.step ?? 1, inputmode: 'decimal', 'data-key': m.key,
    value: v0 ?? '', placeholder: o.placeholder,
  })
  input.addEventListener('input', () => {
    if (input.value === '') return m.set(undefined, false)
    const v = input.valueAsNumber
    if (Number.isFinite(v) && v >= o.min && v <= o.max) m.set(v, false)
  })
  input.addEventListener('change', () => {
    if (input.value === '') return
    const v = clamp(Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : o.min, o.min, o.max)
    input.value = String(v)
    m.set(v, false)
  })
  const restore = h(
    'button',
    {
      type: 'button', class: 'btn sm ghost', title: tr('Voltar ao automático', 'Back to automatic'),
      onClick: () => {
        input.value = ''
        m.set(undefined, false)
      },
    },
    icon('reset', 14),
    h('span', null, tr('restaurar', 'reset')),
  )
  const box = h('div', { class: 'numbox' }, input, o.unit ? h('span', { class: 'unit' }, o.unit) : null)
  return field(label, h('div', { class: 'numrow' }, box, restore), { id, hint: o.hint, tip: o.tip })
}

export function selectField<T extends string>(
  m: Model<T>, label: string, options: Array<[T, string]>, o: { rebuild?: boolean; hint?: string; tip?: string } = {},
): HTMLElement {
  const id = uid()
  const sel = h(
    'select',
    { id, 'data-key': m.key },
    options.map(([v, t]) => h('option', { value: v, selected: v === m.get() }, t)),
  )
  sel.value = m.get()
  sel.addEventListener('change', () => m.set(sel.value as T, !!o.rebuild))
  return field(label, sel, { id, hint: o.hint, tip: o.tip, model: m as Model<never> })
}

export function chips<T extends string | number>(
  m: Model<T>, label: string, options: Array<[T, string]>, o: { rebuild?: boolean; hint?: string; tip?: string; extra?: Child } = {},
): HTMLElement {
  const btns = options.map(([v, t]) =>
    h('button', {
      type: 'button', class: 'chip', 'aria-pressed': String(m.get() === v), 'data-key': `${m.key}:${v}`,
      onClick: () => {
        m.set(v, !!o.rebuild)
        btns.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i]![0] === v)))
      },
    }, t),
  )
  const group = h('div', { class: 'chips', role: 'group', 'aria-label': label }, btns, o.extra)
  return field(label, group, { hint: o.hint, tip: o.tip, model: m as Model<never> })
}

export function checkField(m: Model<boolean>, label: string, o: { rebuild?: boolean; hint?: string; tip?: string } = {}): HTMLElement {
  const input = h('input', { type: 'checkbox', checked: m.get(), 'data-key': m.key })
  input.addEventListener('change', () => m.set(input.checked, !!o.rebuild))
  return h(
    'div',
    { class: 'field' },
    h('div', { class: 'field-head' }, h('label', { class: 'switch' }, input, h('span', { class: 'track', 'aria-hidden': 'true' }), h('span', null, label)), tipEl(o.tip), originBadge(m as Model<never>)),
    o.hint ? h('p', { class: 'hint' }, o.hint) : null,
  )
}

export function colorField(m: Model<string>, label: string, o: { tip?: string } = {}): HTMLElement {
  const id = uid()
  const input = h('input', { type: 'color', id, value: m.get(), 'data-key': m.key })
  input.addEventListener('input', () => m.set(input.value, false))
  return field(label, h('div', { class: 'numrow' }, input, h('code', { class: 'mono' }, m.get())), { id, tip: o.tip })
}

const COLLAPSE_KEY = 'litegrid:collapsed'
const collapsed: Set<string> = (() => {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? '[]') as string[])
  } catch {
    return new Set<string>()
  }
})()

/** A titled block of fields; the title is a button that folds and unfolds it (the choice is remembered). */
export function group(title: string, ...kids: Child[]): HTMLElement {
  const body = h('div', { class: 'group-body' }, kids)
  const head = h('button', { type: 'button', class: 'group-head', 'aria-expanded': String(!collapsed.has(title)) }, icon('chevron', 14), h('span', null, title))
  const sec = h('section', { class: 'group' + (collapsed.has(title) ? ' folded' : '') }, head, body)
  head.addEventListener('click', () => {
    const fold = !sec.classList.contains('folded')
    sec.classList.toggle('folded', fold)
    head.setAttribute('aria-expanded', String(!fold))
    if (fold) collapsed.add(title)
    else collapsed.delete(title)
    try {
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...collapsed]))
    } catch {
      /* storage unavailable */
    }
  })
  return sec
}

/** Open accordions survive sidebar rebuilds. */
export const openKeys = new Set<string>()

export function accordion(
  title: Child, body: Child[], o: { key: string; extra?: Child; selected?: boolean; onToggle?: (open: boolean) => void },
): HTMLDetailsElement {
  const summary = h('summary', null, icon('chevron', 14), h('span', { class: 'acc-title' }, title), o.extra)
  const d = h(
    'details',
    { class: `acc${o.selected ? ' selected' : ''}`, open: openKeys.has(o.key), 'data-acc': o.key },
    summary,
    h('div', { class: 'acc-body' }, body),
  )
  summary.addEventListener('click', (e) => {
    e.preventDefault()
    const open = !d.open
    if (open) openKeys.add(o.key)
    else openKeys.delete(o.key)
    d.open = open
    o.onToggle?.(open)
  })
  return d
}

export type BtnKind = 'primary' | 'ghost' | 'danger' | ''

export function btn(label: string, onClick: (e: MouseEvent) => void, o: { icon?: string; kind?: BtnKind; title?: string; sm?: boolean; disabled?: boolean } = {}): HTMLButtonElement {
  return h(
    'button',
    { type: 'button', class: `btn${o.sm ? ' sm' : ''} ${o.kind ?? ''}`, title: o.title, disabled: o.disabled, onClick },
    o.icon ? icon(o.icon, 15) : null,
    label ? h('span', null, label) : null,
  )
}

export function iconBtn(name: string, title: string, onClick: (e: MouseEvent) => void, disabled = false): HTMLButtonElement {
  return h('button', { type: 'button', class: 'btn sm ghost icon-only', title, 'aria-label': title, disabled, onClick }, icon(name, 15))
}
