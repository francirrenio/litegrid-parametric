import { describe, expect, it } from 'vitest'
import { defaultProject } from '../model/defaults'
import {
  ProjectRepo, KEY_CURRENT, KEY_PROJECT, importProjectText, migrateProject,
} from './storage'

class MockStorage implements Storage {
  data = new Map<string, string>()
  get length() { return this.data.size }
  clear() { this.data.clear() }
  getItem(k: string) { return this.data.get(k) ?? null }
  key(i: number) { return [...this.data.keys()][i] ?? null }
  removeItem(k: string) { this.data.delete(k) }
  setItem(k: string, v: string) { this.data.set(k, v) }
}

const throwing = (): Storage => {
  throw new Error('blocked')
}

describe('migrateProject', () => {
  it('returns defaults for garbage', () => {
    for (const bad of [null, undefined, 42, 'x', [], [1, 2]]) {
      expect(migrateProject(bad)).toEqual(defaultProject())
    }
  })

  it('merges partial and old projects into defaults', () => {
    const p = migrateProject({ version: 0, name: 'Antigo', width: 300, extra: 1, skins: { left: { enabled: true } } })
    expect(p.name).toBe('Antigo')
    expect(p.width).toBe(300)
    expect(p.height).toBe(defaultProject().height)
    expect(p.skins.left.enabled).toBe(true)
    expect(p.skins.left.attach).toBe('tabs')
    expect(p.skins.right.enabled).toBe(false)
    expect('extra' in p).toBe(false)
  })

  it('rejects wrongly typed and out of range values', () => {
    const p = migrateProject({ width: 'wide', nozzle: -1, material: 'wood', printBed: { x: 0, y: 'a' } })
    const d = defaultProject()
    expect(p.width).toBe(d.width)
    expect(p.nozzle).toBe(d.nozzle)
    expect(p.material).toBe('PLA')
    expect(p.printBed).toEqual(d.printBed)
  })

  it('accepts auto-or-number fields and sanitises sections', () => {
    const p = migrateProject({
      skeleton: { barWidth: 6 },
      sections: [{ width: 'auto', rows: [{ height: -3, divisions: 99, load: 'xx' }, 5] }, 'bad'],
    })
    expect(p.skeleton.barWidth).toBe(6)
    expect(p.sections).toHaveLength(1)
    expect(p.sections[0]!.rows).toEqual([{ height: 'auto', divisions: 30, load: 'media' }])
  })

  it('unwraps an envelope and completes partial overrides', () => {
    const p = migrateProject({ version: 1, savedAt: 'x', project: { overrides: { BAY_A: { sides: { fill: 'closed' }, labelHolder: false } } } })
    const o = p.overrides.BAY_A!
    expect(o.labelHolder).toBe(false)
    expect(o.sides!.fill).toBe('closed')
    expect(o.sides!.pattern).toBe(defaultProject().drawerDefaults.sides.pattern)
  })

  it('ignores prototype pollution keys', () => {
    const p = migrateProject(JSON.parse('{"overrides":{"__proto__":{"a":1}}}'))
    expect(({} as Record<string, unknown>).a).toBeUndefined()
    expect(Object.keys(p.overrides)).toEqual([])
  })
})

describe('importProjectText', () => {
  it('throws pt-BR errors for invalid input', () => {
    expect(() => importProjectText('{nope')).toThrow(/JSON/)
    expect(() => importProjectText('{"foo":1}')).toThrow(/projeto/)
    expect(() => importProjectText('[]')).toThrow(/projeto/)
  })
  it('imports a bare project', () => {
    expect(importProjectText(JSON.stringify({ name: 'X', width: 111, sections: [] })).width).toBe(111)
  })
})

describe('ProjectRepo', () => {
  it('creates, saves, lists and switches projects', () => {
    const st = new MockStorage()
    const repo = new ProjectRepo(() => st)
    const first = repo.loadInitial()
    expect(repo.currentId()).toBe(first.id)
    repo.save('b', defaultProject({ name: 'B' }))
    expect(repo.list().map((m) => m.id).sort()).toEqual([first.id, 'b'].sort())
    expect(repo.load('b')!.name).toBe('B')
    repo.setCurrentId('b')
    expect(new ProjectRepo(() => st).loadInitial().id).toBe('b')
    repo.remove('b')
    expect(repo.load('b')).toBeNull()
    expect(repo.currentId()).toBeNull()
  })

  it('survives corrupt stored data', () => {
    const st = new MockStorage()
    st.setItem(KEY_PROJECT + 'bad', '{{{')
    st.setItem(KEY_PROJECT + 'arr', '[1]')
    st.setItem(KEY_CURRENT, 'bad')
    const repo = new ProjectRepo(() => st)
    expect(repo.list()).toEqual([])
    const init = repo.loadInitial()
    expect(init.project).toEqual(defaultProject())
    expect(init.id).not.toBe('bad')
  })

  it('falls back to a valid project when the stored envelope is old', () => {
    const st = new MockStorage()
    st.setItem(KEY_PROJECT + 'old', JSON.stringify({ version: 0, project: { name: 'Velho', depth: 99 } }))
    st.setItem(KEY_CURRENT, 'old')
    const init = new ProjectRepo(() => st).loadInitial()
    expect(init.project.name).toBe('Velho')
    expect(init.project.depth).toBe(99)
  })

  it('works when storage access throws', () => {
    const repo = new ProjectRepo(throwing)
    expect(repo.persistent).toBe(false)
    const { id, project } = repo.loadInitial()
    project.name = 'Memória'
    repo.save(id, project)
    expect(repo.load(id)!.name).toBe('Memória')
    expect(repo.list()).toHaveLength(1)
    repo.setTheme('light')
    expect(repo.getTheme()).toBe('light')
  })

  it('works when storage is missing', () => {
    const repo = new ProjectRepo(() => null)
    expect(repo.loadInitial().project.name).toBe(defaultProject().name)
  })

  it('degrades to memory when writes fail later', () => {
    const st = new MockStorage()
    const repo = new ProjectRepo(() => st)
    st.setItem = () => {
      throw new Error('quota')
    }
    repo.save('q', defaultProject({ name: 'Q' }))
    expect(repo.persistent).toBe(false)
    expect(repo.load('q')!.name).toBe('Q')
  })
})
