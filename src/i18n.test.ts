import { describe, expect, it } from 'vitest'
import { getLang, num, tr } from './i18n'

describe('i18n', () => {
  it('defaults to Portuguese outside the browser', () => {
    expect(getLang()).toBe('pt')
    expect(tr('Largura', 'Width')).toBe('Largura')
    expect(num('1.5')).toBe('1,5')
  })
})
