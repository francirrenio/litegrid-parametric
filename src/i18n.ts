export type Lang = 'pt' | 'en'

const KEY = 'litegrid:lang'

function detect(): Lang {
  try {
    const saved = globalThis.localStorage?.getItem(KEY)
    if (saved === 'pt' || saved === 'en') return saved
  } catch {
    /* storage unavailable */
  }
  if (typeof document === 'undefined') return 'pt'
  const nav = (globalThis.navigator?.language ?? 'pt').toLowerCase()
  return nav.startsWith('pt') ? 'pt' : nav.startsWith('en') ? 'en' : 'pt'
}

let current: Lang = detect()

export const getLang = (): Lang => current

/** Changes the language for `tr` and remembers it. The UI text is built once, so the caller reloads the page afterwards. */
export function setLang(lang: Lang): void {
  current = lang
  try {
    globalThis.localStorage?.setItem(KEY, lang)
  } catch {
    /* storage unavailable */
  }
}

/** Picks the text in the current language: `tr('Largura', 'Width')`. */
export const tr = (pt: string, en: string): string => (current === 'en' ? en : pt)

/** Decimal separator follows the language. */
export const num = (n: string): string => (current === 'en' ? n : n.replace('.', ','))
