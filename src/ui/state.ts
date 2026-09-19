import type { Warning } from '../core/layout'
import { planPlates, type Plate } from '../export'
import { generate } from '../gen'
import { defaultProject, PRESETS } from '../model/defaults'
import type { GenerateResult } from '../model/part'
import type { ProjectState } from '../model/types'
import { GLOBAL_SCOPE, hasValues, pruneEmpty, type Scope } from '../model/resolve'
import { ALL_VISIBLE, type Visibility } from './appearance'
import { outerBox, type Box } from './bounds'
import type { PartGroup } from '../model/part'
import { newId, ProjectRepo, type ProjectMeta } from './storage'

export type ViewTab = '3d' | '2d' | 'mesa' | 'explodida'
export type SideTab = 'projeto' | 'layout' | 'gabinete' | 'gavetas' | 'fixacao' | 'avancado' | 'pecas'
export type Topic = 'result' | 'rebuild' | 'view' | 'selection' | 'busy' | 'projects' | 'tab' | 'theme'

export interface ViewState {
  tab: ViewTab
  wire: boolean
  cotas: boolean
  grid: boolean
  corte: boolean
  corteEixo: 'x' | 'y' | 'z'
  cortePos: number
  abertura: number
  explosao: number
  plate: number
}

export interface Selection {
  bay: string | null
  section: number | null
}

const UNSAFE = new Set(['__proto__', 'constructor', 'prototype'])

export function getPath(obj: unknown, path: string): unknown {
  let cur = obj as Record<string, unknown> | undefined
  for (const k of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = cur[k] as Record<string, unknown> | undefined
  }
  return cur
}

export function setPath(obj: object, path: string, value: unknown): void {
  const ks = path.split('.')
  if (ks.some((k) => UNSAFE.has(k))) return
  let cur = obj as Record<string, unknown>
  for (let i = 0; i < ks.length - 1; i++) {
    const k = ks[i]!
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = /^\d+$/.test(ks[i + 1]!) ? [] : {}
    cur = cur[k] as Record<string, unknown>
  }
  const last = ks[ks.length - 1]!
  if (value === undefined) delete cur[last]
  else cur[last] = value
}

export type Severity = 'error' | 'warn'
export function severityOf(w: Warning): Severity {
  return w.code === 'overflow' || w.code === 'invalid-input' || w.code === 'generator-error' ? 'error' : 'warn'
}

export function tabOfWarning(w: Warning): SideTab {
  switch (w.code) {
    case 'invalid-input': return 'projeto'
    case 'overflow': case 'leftover': case 'bay-too-narrow': case 'bay-too-short': return 'layout'
    case 'generator-error':
      if (w.where === 'gavetas') return 'gavetas'
      if (w.where === 'fixações') return 'fixacao'
      if (w.where === 'sugestões') return 'pecas'
      return 'gabinete'
    default: return 'gabinete'
  }
}

function fallbackResult(p: ProjectState, e: unknown): GenerateResult {
  const msg = e instanceof Error ? e.message : String(e)
  return {
    layout: { wallStructural: 0, bays: [], warnings: [] },
    parts: [],
    warnings: [{ code: 'generator-error', where: 'projeto', message: `Não foi possível gerar: ${msg}` }],
    suggestions: [],
    manifest: {
      project: p.name,
      global_parameters: { nozzle_diameter_mm: p.nozzle, extrusion_width_mm: 0, layer_height_mm: 0 },
      cabinet_metadata: { total_width_mm: p.width, total_height_mm: p.height, total_depth_mm: p.depth, structural_wall_mm: 0 },
      bays: [],
    },
  }
}

export class Store {
  project: ProjectState
  projectId: string
  result: GenerateResult
  plates: Plate[] = []
  bounds: Box
  busy = false
  sel: Selection = { bay: null, section: null }
  scope: Scope = { ...GLOBAL_SCOPE }
  vis: Visibility = { ...ALL_VISIBLE, hiddenGroups: [], hiddenParts: [] }
  sideTab: SideTab = 'projeto'
  theme: 'dark' | 'light' = 'dark'
  view: ViewState = {
    tab: '3d', wire: false, cotas: false, grid: true, corte: false, corteEixo: 'x', cortePos: 50, abertura: 0, explosao: 0.6, plate: 0,
  }
  readonly repo: ProjectRepo
  private listeners = new Map<Topic, Set<() => void>>()
  private genTimer: ReturnType<typeof setTimeout> | undefined
  private saveTimer: ReturnType<typeof setTimeout> | undefined

  constructor(repo = new ProjectRepo()) {
    this.repo = repo
    const init = repo.loadInitial()
    this.project = init.project
    this.projectId = init.id
    this.result = fallbackResult(this.project, 'ainda não gerado')
    this.bounds = { lo: [0, 0, 0], hi: [this.project.width, this.project.height, this.project.depth] }
    this.theme = repo.getTheme() ?? 'dark'
    this.restoreUi()
    this.generateNow()
  }

  on(topic: Topic, fn: () => void): void {
    let s = this.listeners.get(topic)
    if (!s) this.listeners.set(topic, (s = new Set()))
    s.add(fn)
  }

  emit(topic: Topic): void {
    for (const fn of this.listeners.get(topic) ?? []) {
      try {
        fn()
      } catch (e) {
        console.error(`listener ${topic}`, e)
      }
    }
  }

  get(path: string): unknown {
    return getPath(this.project, path)
  }

  /** Sets a value; `rebuild` recreates the sidebar (use when the set of visible controls changes). */
  set(path: string, value: unknown, rebuild = false): void {
    setPath(this.project, path, value)
    this.changed(rebuild)
  }

  mutate(fn: (p: ProjectState) => void, rebuild = true): void {
    fn(this.project)
    this.changed(rebuild)
  }

  applyPatches(patches: Array<{ path: string; value: unknown }>): void {
    for (const pt of patches) setPath(this.project, pt.path, pt.value)
    this.changed(true)
  }

  changed(rebuild: boolean): void {
    this.scheduleSave()
    this.scheduleGenerate()
    if (rebuild) this.emit('rebuild')
  }

  private scheduleSave(): void {
    clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.saveNow(), 400)
  }

  saveNow(): void {
    clearTimeout(this.saveTimer)
    try {
      this.repo.save(this.projectId, this.project)
      this.repo.setCurrentId(this.projectId)
    } catch (e) {
      console.warn('autosave', e)
    }
    this.emit('projects')
  }

  private scheduleGenerate(): void {
    clearTimeout(this.genTimer)
    if (!this.busy) {
      this.busy = true
      this.emit('busy')
    }
    this.genTimer = setTimeout(() => this.generateNow(), 120)
  }

  generateNow(): void {
    clearTimeout(this.genTimer)
    let result: GenerateResult
    try {
      result = generate(this.project)
    } catch (e) {
      result = fallbackResult(this.project, e)
    }
    this.result = result
    const bed = {
      x: this.project.printBed.x > 0 ? this.project.printBed.x : 220,
      y: this.project.printBed.y > 0 ? this.project.printBed.y : 220,
    }
    try {
      this.plates = planPlates(result.parts, bed)
    } catch {
      this.plates = []
    }
    this.view.plate = Math.min(this.view.plate, Math.max(0, this.plates.length - 1))
    try {
      this.bounds = outerBox(result, this.project)
    } catch {
      this.bounds = { lo: [0, 0, 0], hi: [this.project.width, this.project.height, this.project.depth] }
    }
    const selBefore = `${this.sel.bay}|${this.sel.section}|${JSON.stringify(this.scope)}`
    const bays = result.layout.bays
    if (this.sel.bay && !bays.some((b) => b.id === this.sel.bay)) this.sel = { bay: null, section: this.sel.section }
    if (this.sel.section != null && this.sel.section >= this.project.sections.length) this.sel = { bay: null, section: null }
    this.scope = this.validScope(this.scope, bays)
    const selNow = `${this.sel.bay}|${this.sel.section}|${JSON.stringify(this.scope)}`
    const selChanged = selNow !== selBefore
    this.busy = false
    this.emit('busy')
    this.emit('result')
    if (selChanged) this.emit('selection')
  }

  /* selection / view */

  private validScope(sc: Scope, bays: Array<{ id: string }>): Scope {
    const p = this.project
    if (sc.level === 'global') return sc
    const sec = sc.section != null ? p.sections[sc.section] : undefined
    if (!sec) return { ...GLOBAL_SCOPE }
    if ((sc.level === 'row' || sc.level === 'bay') && (sc.row == null || !sec.rows[sc.row])) {
      return { level: 'section', section: sc.section, row: null, bay: null }
    }
    if (sc.level === 'bay' && !bays.some((b) => b.id === sc.bay)) return { level: 'row', section: sc.section, row: sc.row, bay: null }
    return sc
  }

  /** Clicking a drawer selects it and opens its parameters (unless openPanel is false). */
  selectBay(id: string | null, openPanel = true): void {
    const bay = id ? this.result.layout.bays.find((b) => b.id === id) : undefined
    if (bay) {
      this.sel = { bay: bay.id, section: bay.section - 1 }
      this.scope = { level: 'bay', section: bay.section - 1, row: bay.row - 1, bay: bay.id }
      if (openPanel && this.sideTab !== 'gavetas') {
        this.sideTab = 'gavetas'
        this.persistUi()
        this.emit('tab')
      }
    } else {
      this.sel = { bay: null, section: this.sel.section }
      if (this.scope.level === 'bay') this.scope = { level: 'row', section: this.scope.section, row: this.scope.row, bay: null }
    }
    this.emit('selection')
  }

  selectSection(i: number | null): void {
    this.sel = { bay: null, section: i }
    if (this.sideTab === 'gavetas') this.scope = i == null ? { ...GLOBAL_SCOPE } : { level: 'section', section: i, row: null, bay: null }
    this.emit('selection')
  }

  setScope(scope: Scope): void {
    this.scope = scope
    this.sel = { bay: scope.bay, section: scope.section }
    this.emit('selection')
  }

  setView(patch: Partial<ViewState>): void {
    Object.assign(this.view, patch)
    if (patch.tab) this.persistUi()
    this.emit('view')
  }

  private restoreUi(): void {
    try {
      const u = JSON.parse(sessionStorage.getItem('litegrid:ui') ?? '{}') as { side?: SideTab; view?: ViewTab }
      if (u.side && ['projeto', 'layout', 'gabinete', 'gavetas', 'fixacao', 'avancado', 'pecas'].includes(u.side)) this.sideTab = u.side
      if (u.view && ['3d', '2d', 'mesa', 'explodida'].includes(u.view)) this.view.tab = u.view
    } catch { /* session storage unavailable */ }
  }

  private persistUi(): void {
    try {
      sessionStorage.setItem('litegrid:ui', JSON.stringify({ side: this.sideTab, view: this.view.tab }))
    } catch { /* ignore */ }
  }

  setSideTab(t: SideTab): void {
    this.sideTab = t
    this.persistUi()
    this.emit('tab')
  }

  setTheme(t: 'dark' | 'light'): void {
    this.theme = t
    this.repo.setTheme(t)
    this.emit('theme')
  }

  /* layout structure */

  addSection(): void {
    this.mutate((p) => p.sections.push({ width: 'auto', rows: [{ height: 'auto', divisions: 1, load: 'media' }] }))
  }
  duplicateSection(i: number): void {
    this.mutate((p) => {
      const s = p.sections[i]
      if (s) p.sections.splice(i + 1, 0, structuredClone(s))
    })
  }
  moveSection(i: number, d: -1 | 1): void {
    this.mutate((p) => {
      const j = i + d
      if (j < 0 || j >= p.sections.length) return
      const [s] = p.sections.splice(i, 1)
      if (s) p.sections.splice(j, 0, s)
      if (this.sel.section === i) this.sel.section = j
    })
  }
  removeSection(i: number): void {
    this.mutate((p) => {
      p.sections.splice(i, 1)
    })
  }
  addRow(si: number): void {
    this.mutate((p) => p.sections[si]?.rows.push({ height: 'auto', divisions: 1, load: 'media' }))
  }
  duplicateRow(si: number, ri: number): void {
    this.mutate((p) => {
      const r = p.sections[si]?.rows[ri]
      if (r) p.sections[si]!.rows.splice(ri + 1, 0, structuredClone(r))
    })
  }
  moveRow(si: number, ri: number, d: -1 | 1): void {
    this.mutate((p) => {
      const rows = p.sections[si]?.rows
      if (!rows) return
      const j = ri + d
      if (j < 0 || j >= rows.length) return
      const [r] = rows.splice(ri, 1)
      if (r) rows.splice(j, 0, r)
    })
  }
  removeRow(si: number, ri: number): void {
    this.mutate((p) => {
      p.sections[si]?.rows.splice(ri, 1)
    })
  }

  /* what is shown and how it is coloured (view only; colours are saved with the project) */

  private visChanged(): void {
    this.emit('view')
  }

  toggleGroup(g: PartGroup): void {
    const v = this.vis
    v.hiddenGroups = v.hiddenGroups.includes(g) ? v.hiddenGroups.filter((x) => x !== g) : [...v.hiddenGroups, g]
    this.visChanged()
  }

  togglePart(id: string): void {
    const v = this.vis
    v.hiddenParts = v.hiddenParts.includes(id) ? v.hiddenParts.filter((x) => x !== id) : [...v.hiddenParts, id]
    this.visChanged()
  }

  /** Shows only one part type (one copy or all copies); null goes back to the normal view. */
  setIsolate(id: string | null, one = this.vis.isolateOne): void {
    this.vis.isolate = id
    this.vis.isolateOne = one
    this.visChanged()
  }

  showAll(): void {
    this.vis = { ...ALL_VISIBLE, hiddenGroups: [], hiddenParts: [] }
    this.visChanged()
  }

  setPartColor(id: string, hex: string | null): void {
    const c = (this.project.colors ??= { groups: {}, parts: {} })
    if (hex) c.parts[id] = hex
    else delete c.parts[id]
    this.scheduleSave()
    this.visChanged()
  }

  setGroupColor(g: PartGroup, hex: string | null): void {
    const c = (this.project.colors ??= { groups: {}, parts: {} })
    if (hex) c.groups[g] = hex
    else delete c.groups[g]
    this.scheduleSave()
    this.visChanged()
  }

  /* per-drawer overrides */

  hasOverride(id: string): boolean {
    return hasValues(this.project.overrides[id])
  }

  /** Removes one value (and any objects left empty) so it is inherited again. */
  unsetPath(path: string): void {
    setPath(this.project, path, undefined)
    pruneEmpty(this.project as unknown as Record<string, unknown>, path)
    this.changed(true)
  }

  resetOverride(id: string): void {
    this.mutate((p) => {
      delete p.overrides[id]
    })
  }

  /* projects */

  listProjects(): ProjectMeta[] {
    return this.repo.list()
  }

  private adopt(id: string, project: ProjectState, saveOld = true): void {
    if (saveOld) this.saveNow()
    else clearTimeout(this.saveTimer)
    this.projectId = id
    this.project = project
    this.sel = { bay: null, section: null }
    this.vis = { ...ALL_VISIBLE, hiddenGroups: [], hiddenParts: [] }
    this.view.plate = 0
    this.repo.save(id, project)
    this.repo.setCurrentId(id)
    this.generateNow()
    this.emit('rebuild')
    this.emit('projects')
  }

  newProject(project: ProjectState = defaultProject()): void {
    this.adopt(newId(), project)
  }

  newFromPreset(key: string): void {
    const make = PRESETS[key]
    if (make) this.newProject(make())
  }

  duplicateProject(): void {
    const copy = structuredClone(this.project)
    copy.name = `${copy.name} (cópia)`
    this.newProject(copy)
  }

  switchTo(id: string): void {
    if (id === this.projectId) return
    const p = this.repo.load(id)
    if (p) this.adopt(id, p)
  }

  removeProject(id: string): void {
    this.repo.remove(id)
    if (id === this.projectId) {
      const next = this.repo.list()[0]
      const p = next ? this.repo.load(next.id) : null
      if (next && p) this.adopt(next.id, p, false)
      else this.adopt(newId(), defaultProject(), false)
    } else this.emit('projects')
  }
}
