import { tr } from '../i18n'
import { esc, fmt, h } from './dom'
import type { Store } from './state'

const shortId = (id: string) => id.replace(/^BAY_/, '').replace(/_/g, '·')

/** Frontal elevation drawn from the layout, in mm. Clicking selects a bay or a section. */
export function createView2D(st: Store): { el: HTMLElement; refresh: () => void } {
  const el = h('div', { class: 'pane2d' })

  const draw = () => {
    const active = el.contains(document.activeElement) ? (document.activeElement as HTMLElement) : null
    const focusSel = active ? (active.dataset.bay ? `[data-bay="${active.dataset.bay}"]` : active.dataset.sec ? `[data-sec="${active.dataset.sec}"]` : '') : ''
    paint()
    if (focusSel) el.querySelector<HTMLElement>(focusSel)?.focus({ preventScroll: true })
  }

  const paint = () => {
    const p = st.project
    const bays = st.result.layout.bays
    if (bays.length === 0) {
      el.innerHTML = `<div class="empty"><b>${tr('Sem gavetas para desenhar', 'No drawers to draw')}</b><p>${tr('Confira largura, altura, profundidade e as seções na barra lateral.', 'Check the width, height, depth and sections in the sidebar.')}</p></div>`
      return
    }
    const W = p.width, H = p.height
    const big = Math.max(W, H)
    const fs = big * 0.026
    const mL = fs * 4.2, mR = fs * 1.5, mT = fs * 4.2, mB = fs * 5.6
    const vb = `${-mL} ${-mT} ${W + mL + mR} ${H + mT + mB}`
    const out: string[] = []
    const sw = big * 0.0025
    out.push(`<svg viewBox="${vb}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${tr('Vista frontal do gabinete', 'Front view of the cabinet')}" style="--fs:${fs}px">`)
    out.push(`<rect class="cab" x="0" y="0" width="${W}" height="${H}" stroke-width="${sw * 1.6}"/>`)

    for (const b of bays) {
      const y = H - (b.y + b.clearHeight)
      const sel = st.sel.bay === b.id
      const secSel = st.sel.section === b.section - 1
      const ov = st.hasOverride(b.id)
      out.push(
        `<g class="bay${sel ? ' sel' : ''}${secSel && !sel ? ' sec' : ''}${ov ? ' ovr' : ''}" data-bay="${esc(b.id)}" tabindex="0" role="button" aria-label="${esc(tr(`Gaveta ${b.id}, ${fmt(b.clearWidth)} por ${fmt(b.clearHeight)} milímetros`, `Drawer ${b.id}, ${fmt(b.clearWidth)} by ${fmt(b.clearHeight)} millimetres`))}">` +
          `<rect x="${b.x}" y="${y}" width="${b.clearWidth}" height="${b.clearHeight}" stroke-width="${sw}"/>`,
      )
      const cx = b.x + b.clearWidth / 2
      const cy = y + b.clearHeight / 2
      const fitsId = b.clearWidth > fs * 5.5 && b.clearHeight > fs * 2.6
      const fitsDims = b.clearWidth > fs * 7.4 && b.clearHeight > fs * 1.5
      if (fitsId) out.push(`<text class="t-id" x="${cx}" y="${cy - fs * 0.15}" text-anchor="middle">${esc(shortId(b.id))}</text>`)
      if (fitsDims) out.push(`<text class="t-dim" x="${cx}" y="${cy + (fitsId ? fs * 1.05 : fs * 0.35)}" text-anchor="middle">${fmt(b.clearWidth)} × ${fmt(b.clearHeight)}</text>`)
      out.push('</g>')
    }

    // section brackets on top
    const secs = new Map<number, { x0: number; x1: number }>()
    for (const b of bays) {
      const s = secs.get(b.section)
      const x1 = b.x + b.clearWidth
      if (!s) secs.set(b.section, { x0: b.x, x1 })
      else {
        s.x0 = Math.min(s.x0, b.x)
        s.x1 = Math.max(s.x1, x1)
      }
    }
    const ty = -fs * 1.7
    for (const [n, s] of secs) {
      const sel = st.sel.section === n - 1
      out.push(
        `<g class="sec-dim${sel ? ' sel' : ''}" data-sec="${n - 1}" tabindex="0" role="button" aria-label="${tr(`Seção ${n}`, `Section ${n}`)}">` +
          `<rect class="hit" x="${s.x0}" y="${ty - fs * 1.2}" width="${s.x1 - s.x0}" height="${fs * 2.4}"/>` +
          `<line x1="${s.x0}" y1="${ty}" x2="${s.x1}" y2="${ty}" stroke-width="${sw}"/>` +
          `<line x1="${s.x0}" y1="${ty - fs * 0.4}" x2="${s.x0}" y2="${ty + fs * 0.4}" stroke-width="${sw}"/>` +
          `<line x1="${s.x1}" y1="${ty - fs * 0.4}" x2="${s.x1}" y2="${ty + fs * 0.4}" stroke-width="${sw}"/>` +
          `<text x="${(s.x0 + s.x1) / 2}" y="${ty - fs * 0.5}" text-anchor="middle">S${n} · ${fmt(s.x1 - s.x0)}</text></g>`,
      )
    }

    // overall dimensions
    const by = H + fs * 2
    out.push(
      `<g class="dim"><line x1="0" y1="${by}" x2="${W}" y2="${by}" stroke-width="${sw}"/>` +
        `<line x1="0" y1="${by - fs * 0.4}" x2="0" y2="${by + fs * 0.4}" stroke-width="${sw}"/><line x1="${W}" y1="${by - fs * 0.4}" x2="${W}" y2="${by + fs * 0.4}" stroke-width="${sw}"/>` +
        `<text x="${W / 2}" y="${by + fs * 1.4}" text-anchor="middle">${tr('largura', 'width')} ${fmt(W)} mm</text></g>`,
    )
    const lx = -fs * 2
    out.push(
      `<g class="dim"><line x1="${lx}" y1="0" x2="${lx}" y2="${H}" stroke-width="${sw}"/>` +
        `<line x1="${lx - fs * 0.4}" y1="0" x2="${lx + fs * 0.4}" y2="0" stroke-width="${sw}"/><line x1="${lx - fs * 0.4}" y1="${H}" x2="${lx + fs * 0.4}" y2="${H}" stroke-width="${sw}"/>` +
        `<text transform="translate(${lx - fs * 0.6} ${H / 2}) rotate(-90)" text-anchor="middle">${tr('altura', 'height')} ${fmt(H)} mm</text></g>`,
    )
    out.push(`<text class="cap" x="${W}" y="${H + fs * 5}" text-anchor="end">${tr('vista frontal · profundidade', 'front view · depth')} ${fmt(p.depth)} mm</text>`)
    out.push('</svg>')
    el.innerHTML = out.join('')
  }

  const target = (e: Event) => {
    const t = e.target as Element
    const bay = t.closest<SVGElement>('[data-bay]')
    if (bay) return st.selectBay(bay.dataset.bay ?? null)
    const sec = t.closest<SVGElement>('[data-sec]')
    if (sec) return st.selectSection(Number(sec.dataset.sec))
    st.selectBay(null)
  }
  el.addEventListener('click', target)
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      target(e)
    }
  })
  draw()
  return { el, refresh: draw }
}
