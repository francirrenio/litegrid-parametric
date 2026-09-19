import { describe, expect, it } from 'vitest'
import { defaultProject } from '../model/defaults'
import { decodeProject, projectFromHash, shareUrl } from './share'

describe('share link', () => {
  it('round-trips a project through the URL hash', async () => {
    const p = defaultProject()
    p.name = 'Gabinete da oficina'
    p.width = 321
    const url = await shareUrl(p, 'https://example.com/app/?x=1#old')
    expect(url.startsWith('https://example.com/app/?x=1#p=')).toBe(true)
    expect(url.slice(url.indexOf('#p=') + 3)).toMatch(/^[A-Za-z0-9_-]+$/)
    const back = await projectFromHash(url.slice(url.indexOf('#')))
    expect(back?.name).toBe('Gabinete da oficina')
    expect(back?.width).toBe(321)
  })

  it('ignores other hashes and rejects a damaged link', async () => {
    expect(await projectFromHash('#outra')).toBeNull()
    await expect(decodeProject('@@@')).rejects.toThrow()
  })
})
