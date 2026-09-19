import { describe, expect, it, vi } from 'vitest'
import { ProjectRepo } from './storage'
import { Store } from './state'

class MockStorage implements Storage {
  data = new Map<string, string>()
  get length() { return this.data.size }
  clear() { this.data.clear() }
  getItem(k: string) { return this.data.get(k) ?? null }
  key(i: number) { return [...this.data.keys()][i] ?? null }
  removeItem(k: string) { this.data.delete(k) }
  setItem(k: string, v: string) { this.data.set(k, v) }
}

vi.setConfig({ testTimeout: 60000 })

const store = () => new Store(new ProjectRepo(() => new MockStorage()))
const settle = () => new Promise((r) => setTimeout(r, 700))

describe('undo and redo', () => {
  it('goes back and forward over edits, one step per burst', async () => {
    const st = store()
    expect(st.canUndo).toBe(false)
    st.set('width', 220)
    st.set('width', 230)
    st.set('width', 240)
    await settle()
    st.set('height', 190)
    await settle()
    expect(st.project.width).toBe(240)
    expect(st.canUndo).toBe(true)
    st.undo()
    expect(st.project.height).toBe(180)
    expect(st.project.width).toBe(240)
    st.undo()
    expect(st.project.width).toBe(200)
    expect(st.canUndo).toBe(false)
    expect(st.canRedo).toBe(true)
    st.redo()
    expect(st.project.width).toBe(240)
    st.redo()
    expect(st.project.height).toBe(190)
    expect(st.canRedo).toBe(false)
  })

  it('a new edit after undo drops the redo branch', async () => {
    const st = store()
    st.set('width', 250)
    await settle()
    st.undo()
    st.set('depth', 130)
    await settle()
    expect(st.canRedo).toBe(false)
    expect(st.project.depth).toBe(130)
    expect(st.project.width).toBe(200)
  })

  it('undo regenerates the result', async () => {
    const st = store()
    const before = st.result.layout.bays.length
    st.mutate((p) => { p.sections[0]!.rows[0]!.divisions = 5 })
    await settle()
    expect(st.result.layout.bays.length).not.toBe(before)
    st.undo()
    expect(st.result.layout.bays.length).toBe(before)
  })
})
