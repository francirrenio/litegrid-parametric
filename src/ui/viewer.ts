import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Bay } from '../core/layout'
import type { GenerateResult, Part, PartGroup } from '../model/part'
import type { ProjectState } from '../model/types'
import { stepOf } from './assembly'
import { ALL_VISIBLE, isInstanceVisible, partColor, type Colors, type Visibility } from './appearance'
import { instanceBox, partBox } from './bounds'
import { levelOf, type BayClearance } from './clearance'
import type { DiffItem } from './diff'
import { fmt } from './dom'

export interface ViewOptions {
  wire: boolean
  cotas: boolean
  grid: boolean
  folgas: boolean
  corte: boolean
  corteEixo: 'x' | 'y' | 'z'
  cortePos: number
  /** 0–100: how far the drawers slide out. */
  abertura: number
  /** 0–1: exploded view factor. */
  explosao: number
  selectedBay: string | null
  vis: Visibility
  colors: Colors
}

const GROUP_COLOR: Record<PartGroup, string> = {
  gabinete: '#7b93ad',
  gaveta: '#2dd4bf',
  skin: '#2dd4bf',
  espacador: '#f6b03c',
  fixacao: '#f6b03c',
  teste: '#c084fc',
}

interface Inst {
  partId: string
  step: number | null
  index: number
  node: THREE.Group
  base: THREE.Matrix4
  group: PartGroup
  center: THREE.Vector3
}

const EDGE_TRI_LIMIT = 40_000

export class Viewer {
  readonly el: HTMLElement
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(35, 1, 1, 10_000)
  private controls: OrbitControls
  private content = new THREE.Group()
  private overlay = new THREE.Group()
  private pickers = new THREE.Group()
  private insts: Inst[] = []
  private materials: THREE.Material[] = []
  private edgeMats: THREE.LineBasicMaterial[] = []
  private clip = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0)
  private labels: Array<{ el: HTMLElement; pos: THREE.Vector3 }> = []
  private labelHost: HTMLElement
  private box = new THREE.Box3(new THREE.Vector3(), new THREE.Vector3(1, 1, 1))
  private cabinet = new THREE.Vector3(1, 1, 1)
  private center = new THREE.Vector3()
  private dark = true
  private raf = 0
  private framed = false
  private opts: ViewOptions = {
    wire: false, cotas: false, grid: true, folgas: false, corte: false, corteEixo: 'x', cortePos: 50, abertura: 0, explosao: 0, selectedBay: null,
    vis: { ...ALL_VISIBLE, hiddenGroups: [], hiddenParts: [] }, colors: { groups: {}, parts: {} },
  }
  private partInfo = new Map<string, { mat: THREE.MeshStandardMaterial; part: Part }>()
  private clearGroup: THREE.Group | null = null
  private clearLabels: Array<{ el: HTMLElement; pos: THREE.Vector3 }> = []
  private clearHost: HTMLElement
  private diffItems: DiffItem[] = []
  private diffNodes: THREE.Mesh[] = []
  private diffOn = false
  private grid: THREE.GridHelper | null = null
  private cubeScene = new THREE.Scene()
  private cubeCam = new THREE.PerspectiveCamera(32, 1, 0.1, 20)
  private cube: THREE.Mesh
  private cubeHl: THREE.Mesh
  private cubeRay = new THREE.Raycaster()
  private cubeHover: THREE.Vector3 | null = null
  private anim = 0
  private bays: Bay[] = []
  private ray = new THREE.Raycaster()
  private down: { x: number; y: number } | null = null
  onPickBay: (id: string | null) => void = () => {}
  onPickPart: (id: string | null, clientX: number, clientY: number, bayId: string | null) => void = () => {}

  constructor(host: HTMLElement) {
    this.el = host
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.localClippingEnabled = true
    this.renderer.domElement.className = 'gl'
    host.appendChild(this.renderer.domElement)
    this.labelHost = document.createElement('div')
    this.labelHost.className = 'dim-labels'
    host.appendChild(this.labelHost)
    this.clearHost = document.createElement('div')
    this.clearHost.className = 'dim-labels'
    host.appendChild(this.clearHost)

    this.scene.add(this.content, this.overlay, this.pickers)
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.05))
    const key = new THREE.DirectionalLight(0xffffff, 1.7)
    key.position.set(0.6, 1, 0.9)
    this.camera.add(key)
    this.scene.add(this.camera)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }
    this.controls.screenSpacePanning = true
    this.controls.enableDamping = false
    this.controls.addEventListener('change', () => this.requestRender())

    this.cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.cubeMaterials())
    this.cubeHl = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0.5, depthTest: false }),
    )
    this.cubeHl.visible = false
    this.cubeHl.renderOrder = 2
    this.cubeScene.add(this.cube, this.cubeHl)

    const dom = this.renderer.domElement
    dom.addEventListener('contextmenu', (e) => e.preventDefault())
    dom.addEventListener('pointerdown', (e) => {
      this.down = { x: e.clientX, y: e.clientY }
    })
    dom.addEventListener('pointermove', (e) => {
      const dir = this.cubeDirAt(e)
      const changed = (dir === null) !== (this.cubeHover === null) || (dir && this.cubeHover && !dir.equals(this.cubeHover))
      this.cubeHover = dir
      dom.style.cursor = dir ? 'pointer' : ''
      if (changed) this.requestRender()
    })
    dom.addEventListener('pointerleave', () => {
      if (this.cubeHover) {
        this.cubeHover = null
        this.requestRender()
      }
    })
    dom.addEventListener('pointerup', (e) => {
      const d = this.down
      this.down = null
      if (!d || e.button !== 0 || Math.hypot(e.clientX - d.x, e.clientY - d.y) >= 4) return
      const dir = this.cubeDirAt(e)
      if (dir) this.snapTo(dir)
      else this.pick(e)
    })
    dom.addEventListener('dblclick', (e) => this.recentre(e))
    new ResizeObserver(() => this.resize()).observe(host)
    this.resize()
    this.setCameraDefault()
  }

  setTheme(dark: boolean): void {
    this.dark = dark
    for (const m of this.edgeMats) m.color.set(dark ? 0x0b0e12 : 0x2b3a4d)
    this.paintGrid()
    for (const m of this.cube.material as THREE.MeshBasicMaterial[]) {
      m.map?.dispose()
      m.dispose()
    }
    this.cube.material = this.cubeMaterials()
    this.requestRender()
  }

  /** Rebuilds the scene from a generation result. */
  setResult(result: GenerateResult, project: ProjectState): void {
    this.disposeGroup(this.content)
    this.disposeGroup(this.overlay)
    this.disposeGroup(this.pickers)
    this.insts = []
    this.materials = []
    this.edgeMats = []
    this.partInfo.clear()
    this.diffNodes = []
    this.opts.colors = project.colors ?? { groups: {}, parts: {} }
    this.bays = result.layout.bays
    const W = project.width, H = project.height, D = project.depth
    this.cabinet.set(W, H, D)
    this.center.set(W / 2, H / 2, D / 2)

    const edgeMat = () => {
      const m = new THREE.LineBasicMaterial({ color: this.dark ? 0x0b0e12 : 0x2b3a4d, transparent: true, opacity: 0.55, clippingPlanes: [this.clip] })
      this.edgeMats.push(m)
      return m
    }
    const bb = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(W, H, D))

    for (const part of result.parts) {
      const n = part.mesh.length
      if (n < 9) continue
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(part.mesh), 3))
      geo.computeVertexNormals()
      const mat = new THREE.MeshStandardMaterial({
        color: this.colorOf(part), roughness: 0.62, metalness: 0.04, side: THREE.DoubleSide,
        clippingPlanes: [this.clip], polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
      })
      this.materials.push(mat)
      this.partInfo.set(part.id, { mat, part })
      const edges = n / 9 <= EDGE_TRI_LIMIT ? new THREE.EdgesGeometry(geo, 28) : null
      const emat = edges ? edgeMat() : null
      const pb = partBox(part)
      const local = new THREE.Vector3((pb.lo[0] + pb.hi[0]) / 2, (pb.lo[1] + pb.hi[1]) / 2, (pb.lo[2] + pb.hi[2]) / 2)
      part.instances.forEach((mtx, i) => {
        const node = new THREE.Group()
        node.matrixAutoUpdate = false
        node.userData.partId = part.id
        node.add(new THREE.Mesh(geo, mat))
        if (edges && emat) node.add(new THREE.LineSegments(edges, emat))
        const base = new THREE.Matrix4().set(
          mtx[0]!, mtx[1]!, mtx[2]!, mtx[3]!, mtx[4]!, mtx[5]!, mtx[6]!, mtx[7]!,
          mtx[8]!, mtx[9]!, mtx[10]!, mtx[11]!, mtx[12]!, mtx[13]!, mtx[14]!, mtx[15]!,
        )
        this.content.add(node)
        this.insts.push({ partId: part.id, step: stepOf(part.group, part.assemblyStep), index: i, node, base, group: part.group, center: local.clone().applyMatrix4(base) })
        const b = instanceBox(part, i)
        bb.expandByPoint(new THREE.Vector3(b.lo[0], b.lo[1], b.lo[2]))
        bb.expandByPoint(new THREE.Vector3(b.hi[0], b.hi[1], b.hi[2]))
      })
    }
    this.box = bb

    const empty = this.insts.length === 0
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, D)),
      new THREE.LineBasicMaterial({ color: empty ? 0x2dd4bf : 0x6a7d92, transparent: true, opacity: empty ? 0.9 : 0.35 }),
    )
    outline.position.copy(this.center)
    this.overlay.add(outline)

    for (const b of result.layout.bays) {
      const d = Math.min(b.clearDepth, D)
      const geo = new THREE.BoxGeometry(b.clearWidth, b.clearHeight, d)
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ visible: false }))
      m.position.set(b.x + b.clearWidth / 2, b.y + b.clearHeight / 2, D - d / 2)
      m.userData.bay = b.id
      this.pickers.add(m)
      if (empty) {
        const l = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x4d6a86, transparent: true, opacity: 0.8 }))
        l.position.copy(m.position)
        this.overlay.add(l)
      }
    }
    this.buildGrid()
    this.buildSelection()
    this.buildDims()
    this.applyOptions()
    if (!this.framed) this.frame()
    this.requestRender()
  }

  /** Clearance view: each bay outlined green, amber or red by how much room its drawer has, with the gaps written on it. */
  setClearances(list: BayClearance[]): void {
    if (this.clearGroup) {
      this.overlay.remove(this.clearGroup)
      this.disposeGroup(this.clearGroup)
    }
    this.clearHost.textContent = ''
    this.clearLabels = []
    const group = new THREE.Group()
    const D = this.cabinet.z
    const colors = { ok: 0x34d399, tight: 0xf6b03c, bad: 0xf43f5e }
    for (const c of list) {
      const b = this.bays.find((x) => x.id === c.bay)
      if (!b) continue
      const level = levelOf(c)
      const d = Math.min(b.clearDepth, D)
      const geo = new THREE.BoxGeometry(b.clearWidth, b.clearHeight, d)
      const lines = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: colors[level] }))
      lines.position.set(b.x + b.clearWidth / 2, b.y + b.clearHeight / 2, D - d / 2)
      group.add(lines)
      const el = document.createElement('div')
      el.className = `dim-label clear-${level}`
      el.title = 'Folga lateral (por lado) | topo | fundo, em mm'
      el.textContent = `${fmt(c.lateral, 2)} | ${fmt(c.top, 2)} | ${fmt(c.back, 1)}${c.collision ? ' · colide' : ''}`
      this.clearHost.appendChild(el)
      this.clearLabels.push({ el, pos: new THREE.Vector3(b.x + b.clearWidth / 2, b.y + b.clearHeight / 2, D) })
    }
    group.visible = this.opts.folgas
    this.clearGroup = group
    this.overlay.add(group)
    this.clearHost.style.display = this.opts.folgas ? '' : 'none'
    this.requestRender()
  }

  /** Highlights, in amber, the triangles that changed in the last generation. */
  setDiff(items: DiffItem[]): void {
    this.diffItems = items
    for (const m of this.diffNodes) {
      m.parent?.remove(m)
      m.geometry.dispose()
    }
    this.diffNodes = []
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffb020, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    })
    for (const item of items) {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(item.tris), 3))
      for (const inst of this.insts) {
        if (inst.partId !== item.partId) continue
        const mesh = new THREE.Mesh(geo, mat)
        mesh.visible = this.diffOn
        inst.node.add(mesh)
        this.diffNodes.push(mesh)
      }
    }
    this.requestRender()
  }

  setDiffVisible(on: boolean): void {
    this.diffOn = on
    for (const m of this.diffNodes) m.visible = on
    this.requestRender()
  }

  private lastVisSig = ''

  setOptions(o: ViewOptions): void {
    const selChanged = o.selectedBay !== this.opts.selectedBay
    const sig = JSON.stringify(o.vis)
    const visChanged = sig !== this.lastVisSig && this.lastVisSig !== ''
    this.lastVisSig = sig
    this.opts = { ...o }
    if (selChanged) this.buildSelection()
    this.applyOptions()
    if (visChanged) this.frameVisible()
    this.requestRender()
  }

  /** Brings the camera to what is visible: one isolated drawer fills the view, showing everything frames the cabinet. */
  private frameVisible(): void {
    const box = new THREE.Box3()
    let n = 0
    for (const it of this.insts) {
      if (!it.node.visible) continue
      it.node.updateMatrixWorld(true)
      box.union(new THREE.Box3().setFromObject(it.node))
      n++
    }
    if (n === 0) return
    if (n === this.insts.length) return this.frame()
    const size = box.getSize(new THREE.Vector3())
    const c = box.getCenter(new THREE.Vector3())
    const r = Math.max(size.x, size.y, size.z, 10)
    const dist = (r * 0.85) / Math.tan((this.camera.fov * Math.PI) / 360)
    const dir = this.camera.position.clone().sub(this.controls.target).normalize()
    cancelAnimationFrame(this.anim)
    this.controls.target.copy(c)
    this.camera.position.copy(c).addScaledVector(dir, dist)
    this.controls.minDistance = Math.min(this.controls.minDistance, r * 0.3)
    this.camera.updateProjectionMatrix()
    this.controls.update()
  }

  private colorOf(p: Part): string {
    return partColor(this.opts.colors, p)
  }

  private selMesh: THREE.Object3D | null = null
  private buildSelection(): void {
    if (this.selMesh) {
      this.overlay.remove(this.selMesh)
      this.disposeGroup(this.selMesh as THREE.Group)
      this.selMesh = null
    }
    const b = this.bays.find((x) => x.id === this.opts.selectedBay)
    if (!b) return
    const d = Math.min(b.clearDepth, this.cabinet.z)
    const geo = new THREE.BoxGeometry(b.clearWidth, b.clearHeight, d)
    const g = new THREE.Group()
    g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0.18, depthWrite: false })))
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x6fe9d8 })))
    g.position.set(b.x + b.clearWidth / 2, b.y + b.clearHeight / 2, this.cabinet.z - d / 2)
    this.selMesh = g
    this.overlay.add(g)
  }

  private dimLines: THREE.LineSegments | null = null
  private buildDims(): void {
    this.dimLines = null
    this.labelHost.textContent = ''
    this.labels = []
    const { x: W, y: H, z: D } = this.cabinet
    const off = Math.max(W, H, D) * 0.07
    const segs: number[] = []
    const dim = (a: THREE.Vector3, b: THREE.Vector3, text: string) => {
      segs.push(a.x, a.y, a.z, b.x, b.y, b.z)
      const t = 0.03 * Math.max(W, H, D)
      const d = b.clone().sub(a).normalize()
      const n = new THREE.Vector3(d.y, -d.x, 0).multiplyScalar(t)
      const n2 = Math.abs(d.z) > 0.5 ? new THREE.Vector3(t, 0, 0) : n
      for (const p of [a, b]) segs.push(p.x - n2.x, p.y - n2.y, p.z - n2.z, p.x + n2.x, p.y + n2.y, p.z + n2.z)
      const el = document.createElement('div')
      el.className = 'dim-label'
      el.textContent = text
      this.labelHost.appendChild(el)
      this.labels.push({ el, pos: a.clone().add(b).multiplyScalar(0.5) })
    }
    dim(new THREE.Vector3(0, -off, D + off), new THREE.Vector3(W, -off, D + off), `${fmt(W, 1)} mm`)
    dim(new THREE.Vector3(-off, 0, D + off), new THREE.Vector3(-off, H, D + off), `${fmt(H, 1)} mm`)
    dim(new THREE.Vector3(W + off, -off, 0), new THREE.Vector3(W + off, -off, D), `${fmt(D, 1)} mm`)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3))
    this.dimLines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xf6b03c }))
    this.overlay.add(this.dimLines)
  }

  private applyOptions(): void {
    const o = this.opts
    for (const m of this.materials) {
      const s = m as THREE.MeshStandardMaterial
      s.wireframe = o.wire
    }
    for (const m of this.edgeMats) m.visible = !o.wire
    for (const { mat, part } of this.partInfo.values()) mat.color.set(partColor(o.colors, part))
    if (this.dimLines) this.dimLines.visible = o.cotas
    if (this.clearGroup) this.clearGroup.visible = o.folgas
    this.clearHost.style.display = o.folgas ? '' : 'none'
    if (this.grid) this.grid.visible = o.grid
    this.labelHost.style.display = o.cotas ? '' : 'none'

    const axis = o.corteEixo
    const n = new THREE.Vector3(axis === 'x' ? -1 : 0, axis === 'y' ? -1 : 0, axis === 'z' ? -1 : 0)
    const size = this.box.getSize(new THREE.Vector3())
    const lo = this.box.min
    const len = axis === 'x' ? size.x : axis === 'y' ? size.y : size.z
    const start = axis === 'x' ? lo.x : axis === 'y' ? lo.y : lo.z
    const pos = start + (len * o.cortePos) / 100
    this.clip.normal.copy(n)
    this.clip.constant = pos
    // Disabling clipping means pushing the plane far away rather than toggling the array.
    if (!o.corte) this.clip.constant = 1e6

    const isoBox = o.vis.isolateBay ? this.bays.find((b) => b.id === o.vis.isolateBay) : undefined
    const c = this.center
    const open = (this.cabinet.z * 0.9 * o.abertura) / 100
    const t = new THREE.Matrix4()
    for (const it of this.insts) {
      const off = new THREE.Vector3()
      if (o.explosao > 0) off.copy(it.center).sub(c).multiplyScalar(o.explosao * 1.1)
      if (it.group === 'gaveta') off.z += open
      it.node.visible = isInstanceVisible(o.vis, it.group, it.partId, it.index, isoBox ? this.inBox(it.center, isoBox) : false, it.step)
      t.makeTranslation(off.x, off.y, off.z)
      it.node.matrix.multiplyMatrices(t, it.base)
      it.node.matrixWorldNeedsUpdate = true
    }
  }

  private inBox(p: THREE.Vector3, b: Bay): boolean {
    return p.x >= b.x && p.x <= b.x + b.clearWidth && p.y >= b.y && p.y <= b.y + b.clearHeight
  }

  frame(): void {
    this.framed = true
    cancelAnimationFrame(this.anim)
    this.setCameraDefault()
    this.requestRender()
  }

  /* ground grid: a plane under the cabinet to judge size and position */

  private buildGrid(): void {
    const size = this.box.getSize(new THREE.Vector3())
    const c = this.box.getCenter(new THREE.Vector3())
    const span = Math.max(size.x, size.z, 60) * 2.6
    const steps = [5, 10, 20, 25, 50, 100, 200, 500]
    const step = steps.find((s) => span / s <= 36) ?? 500
    const cells = Math.max(4, Math.ceil(span / step / 2) * 2)
    const g = new THREE.GridHelper(cells * step, cells, 0x3d5068, 0x2a3644)
    g.position.set(c.x, this.box.min.y - 0.05, c.z)
    g.renderOrder = -1
    this.grid = g
    this.overlay.add(g)
    this.paintGrid()
  }

  private paintGrid(): void {
    if (!this.grid) return
    const mats = Array.isArray(this.grid.material) ? this.grid.material : [this.grid.material]
    for (const m of mats) {
      const lm = m as THREE.LineBasicMaterial
      lm.transparent = true
      lm.opacity = this.dark ? 0.75 : 0.9
      lm.depthWrite = false
    }
    const colors = this.grid.geometry.getAttribute('color') as THREE.BufferAttribute
    const centre = new THREE.Color(this.dark ? 0x4b6580 : 0x8fa3ba)
    const line = new THREE.Color(this.dark ? 0x263242 : 0xc6d1de)
    // GridHelper stores 4 vertices per grid index (two lines); the middle index is the axis cross.
    const half = (colors.count / 4 - 1) / 2
    for (let i = 0; i < colors.count; i++) {
      const col = Math.floor(i / 4) === half ? centre : line
      colors.setXYZ(i, col.r, col.g, col.b)
    }
    colors.needsUpdate = true
  }

  /* view cube */

  private cubeMaterials(): THREE.MeshBasicMaterial[] {
    const labels = ['Dir.', 'Esq.', 'Topo', 'Base', 'Frente', 'Trás']
    return labels.map((text) => {
      const c = document.createElement('canvas')
      c.width = c.height = 128
      const g = c.getContext('2d')!
      g.fillStyle = this.dark ? '#1c2532' : '#eef2f6'
      g.fillRect(0, 0, 128, 128)
      g.strokeStyle = this.dark ? '#46566b' : '#aebccd'
      g.lineWidth = 6
      g.strokeRect(3, 3, 122, 122)
      g.fillStyle = this.dark ? '#d4dee8' : '#2b3a4d'
      g.font = '600 26px Rubik, system-ui, sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(text, 64, 66)
      const tex = new THREE.CanvasTexture(c)
      tex.colorSpace = THREE.SRGBColorSpace
      return new THREE.MeshBasicMaterial({ map: tex })
    })
  }

  private static readonly CUBE_PX = 104
  private static readonly CUBE_PAD = 10
  private static readonly CUBE_EDGE = 0.34

  /** The view direction under the pointer when it is over the cube: face, edge or corner. */
  private cubeDirAt(e: MouseEvent): THREE.Vector3 | null {
    const r = this.renderer.domElement.getBoundingClientRect()
    const x = e.clientX - r.left - Viewer.CUBE_PAD
    const y = e.clientY - r.top - Viewer.CUBE_PAD
    const s = Viewer.CUBE_PX
    if (x < 0 || y < 0 || x > s || y > s) return null
    this.syncCubeCam()
    this.cubeRay.setFromCamera(new THREE.Vector2((x / s) * 2 - 1, -(y / s) * 2 + 1), this.cubeCam)
    this.cubeScene.updateMatrixWorld(true)
    const hit = this.cubeRay.intersectObject(this.cube, false)[0]
    if (!hit) return null
    const p = hit.point
    const d = new THREE.Vector3()
    for (const k of ['x', 'y', 'z'] as const) if (Math.abs(p[k]) >= Viewer.CUBE_EDGE) d[k] = Math.sign(p[k])
    return d
  }

  private syncCubeCam(): void {
    this.cubeCam.position.copy(this.camera.position).sub(this.controls.target).normalize().multiplyScalar(3.2)
    this.cubeCam.up.copy(this.camera.up)
    this.cubeCam.lookAt(0, 0, 0)
    this.cubeCam.updateMatrixWorld(true)
  }

  private renderCube(): void {
    const w = this.el.clientWidth, h = this.el.clientHeight
    const s = Viewer.CUBE_PX, pad = Viewer.CUBE_PAD
    if (w < s + pad || h < s + pad) return
    this.syncCubeCam()
    const hl = this.cubeHover
    this.cubeHl.visible = !!hl
    if (hl) {
      const e = Viewer.CUBE_EDGE
      const dims = [hl.x, hl.y, hl.z].map((c) => (c !== 0 ? 0.5 - e : 2 * e) + 0.02)
      this.cubeHl.scale.set(dims[0]!, dims[1]!, dims[2]!)
      const mid = (0.5 + e) / 2
      this.cubeHl.position.set(hl.x * mid, hl.y * mid, hl.z * mid)
    }
    const r = this.renderer
    r.autoClear = false
    r.setScissorTest(true)
    r.setViewport(pad, h - s - pad, s, s)
    r.setScissor(pad, h - s - pad, s, s)
    r.clearDepth()
    r.render(this.cubeScene, this.cubeCam)
    r.setScissorTest(false)
    r.setViewport(0, 0, w, h)
    r.autoClear = true
  }

  /** Turns the camera to look at the cabinet from `dir` (a face, edge or corner of the cube), animated. */
  private snapTo(dir: THREE.Vector3): void {
    const target = this.box.getCenter(new THREE.Vector3())
    const from = this.camera.position.clone().sub(this.controls.target)
    const dist = from.length()
    const to = dir.clone().normalize()
    if (Math.abs(to.y) > 0.999) to.z += 1e-3
    to.normalize()
    const a = from.clone().normalize()
    const angle = a.angleTo(to)
    const startTarget = this.controls.target.clone()
    const t0 = performance.now()
    const dur = 320
    cancelAnimationFrame(this.anim)
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / dur)
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
      const dirNow = angle < 1e-4 ? to.clone() : a.clone().multiplyScalar(Math.sin((1 - e) * angle)).add(to.clone().multiplyScalar(Math.sin(e * angle))).divideScalar(Math.sin(angle))
      this.controls.target.copy(startTarget).lerp(target, e)
      this.camera.position.copy(this.controls.target).addScaledVector(dirNow.normalize(), dist)
      this.controls.update()
      this.requestRender()
      if (k < 1) this.anim = requestAnimationFrame(step)
    }
    step()
  }

  private setCameraDefault(): void {
    const size = this.box.getSize(new THREE.Vector3())
    const c = this.box.getCenter(new THREE.Vector3())
    const r = Math.max(size.x, size.y, size.z, 10) * (1 + this.opts.explosao * 0.9)
    const dist = (r * 1.25) / Math.tan((this.camera.fov * Math.PI) / 360)
    const dir = new THREE.Vector3(0.55, 0.42, 1).normalize()
    this.camera.position.copy(c).addScaledVector(dir, dist)
    this.camera.near = Math.max(0.5, r / 200)
    this.camera.far = dist * 8
    this.camera.updateProjectionMatrix()
    this.controls.target.copy(c)
    this.controls.minDistance = r * 0.15
    this.controls.maxDistance = dist * 4
    this.controls.update()
  }

  private ndc(e: MouseEvent): THREE.Vector2 {
    const r = this.renderer.domElement.getBoundingClientRect()
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
  }

  private pick(e: MouseEvent): void {
    this.ray.setFromCamera(this.ndc(e), this.camera)
    this.scene.updateMatrixWorld(true)
    const hit = this.ray.intersectObjects(this.pickers.children, false)[0]
    const shown = this.insts.filter((i) => i.node.visible).map((i) => i.node)
    const partHit = this.ray.intersectObjects(shown, true).find((h) => h.object instanceof THREE.Mesh)
    let o: THREE.Object3D | null = partHit?.object ?? null
    while (o && !o.userData.partId) o = o.parent
    const bayId = (hit?.object.userData.bay as string | undefined) ?? null
    this.onPickPart((o?.userData.partId as string | undefined) ?? null, e.clientX, e.clientY, bayId)
    this.onPickBay(bayId)
  }

  private recentre(e: MouseEvent): void {
    this.ray.setFromCamera(this.ndc(e), this.camera)
    const hit = this.ray.intersectObjects([...this.content.children.filter((c) => c.visible), ...this.pickers.children], true)[0]
    if (hit) {
      this.controls.target.copy(hit.point)
      this.controls.update()
    } else {
      this.controls.target.copy(this.box.getCenter(new THREE.Vector3()))
      this.controls.update()
    }
    this.requestRender()
  }

  private resize(): void {
    const w = this.el.clientWidth, h = this.el.clientHeight
    if (w < 2 || h < 2) return
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.requestRender()
  }

  requestRender(): void {
    if (this.raf) return
    this.raf = requestAnimationFrame(() => {
      this.raf = 0
      this.render()
    })
  }

  private render(): void {
    if (this.el.clientWidth < 2) return
    this.renderer.render(this.scene, this.camera)
    this.renderCube()
    if (this.opts.folgas) {
      const w = this.el.clientWidth, h = this.el.clientHeight
      const v = new THREE.Vector3()
      for (const l of this.clearLabels) {
        v.copy(l.pos).project(this.camera)
        l.el.style.opacity = v.z < 1 ? '1' : '0'
        l.el.style.transform = `translate(-50%,-50%) translate(${((v.x + 1) / 2) * w}px,${((1 - v.y) / 2) * h}px)`
      }
    }
    if (this.opts.cotas) {
      const w = this.el.clientWidth, h = this.el.clientHeight
      const v = new THREE.Vector3()
      for (const l of this.labels) {
        v.copy(l.pos).project(this.camera)
        const vis = v.z < 1
        l.el.style.opacity = vis ? '1' : '0'
        l.el.style.transform = `translate(-50%,-50%) translate(${((v.x + 1) / 2) * w}px,${((1 - v.y) / 2) * h}px)`
      }
    }
  }

  private disposeGroup(g: THREE.Object3D): void {
    const geos = new Set<THREE.BufferGeometry>()
    const mats = new Set<THREE.Material>()
    g.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.geometry) geos.add(m.geometry)
      if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => mats.add(x))
    })
    geos.forEach((x) => x.dispose())
    mats.forEach((x) => x.dispose())
    if (g === this.content || g === this.overlay || g === this.pickers) g.clear()
  }
}
