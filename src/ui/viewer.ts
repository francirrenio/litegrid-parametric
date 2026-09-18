import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Bay } from '../core/layout'
import type { GenerateResult, Part, PartGroup } from '../model/part'
import type { ProjectState } from '../model/types'
import { instanceBox, partBox } from './bounds'
import { fmt } from './dom'

export interface ViewOptions {
  wire: boolean
  cotas: boolean
  corte: boolean
  corteEixo: 'x' | 'y' | 'z'
  cortePos: number
  /** 0–100: how far the drawers slide out. */
  abertura: number
  /** 0–1: exploded view factor. */
  explosao: number
  selectedBay: string | null
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
    wire: false, cotas: false, corte: false, corteEixo: 'x', cortePos: 50, abertura: 0, explosao: 0, selectedBay: null,
  }
  private bays: Bay[] = []
  private ray = new THREE.Raycaster()
  private down: { x: number; y: number } | null = null
  onPickBay: (id: string | null) => void = () => {}

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

    const dom = this.renderer.domElement
    dom.addEventListener('contextmenu', (e) => e.preventDefault())
    dom.addEventListener('pointerdown', (e) => {
      this.down = { x: e.clientX, y: e.clientY }
    })
    dom.addEventListener('pointerup', (e) => {
      const d = this.down
      this.down = null
      if (d && e.button === 0 && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) this.pick(e)
    })
    dom.addEventListener('dblclick', (e) => this.recentre(e))
    new ResizeObserver(() => this.resize()).observe(host)
    this.resize()
    this.setCameraDefault()
  }

  setTheme(dark: boolean): void {
    this.dark = dark
    for (const m of this.edgeMats) m.color.set(dark ? 0x0b0e12 : 0x2b3a4d)
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
      const edges = n / 9 <= EDGE_TRI_LIMIT ? new THREE.EdgesGeometry(geo, 28) : null
      const emat = edges ? edgeMat() : null
      const pb = partBox(part)
      const local = new THREE.Vector3((pb.lo[0] + pb.hi[0]) / 2, (pb.lo[1] + pb.hi[1]) / 2, (pb.lo[2] + pb.hi[2]) / 2)
      part.instances.forEach((mtx, i) => {
        const node = new THREE.Group()
        node.matrixAutoUpdate = false
        node.add(new THREE.Mesh(geo, mat))
        if (edges && emat) node.add(new THREE.LineSegments(edges, emat))
        const base = new THREE.Matrix4().set(
          mtx[0]!, mtx[1]!, mtx[2]!, mtx[3]!, mtx[4]!, mtx[5]!, mtx[6]!, mtx[7]!,
          mtx[8]!, mtx[9]!, mtx[10]!, mtx[11]!, mtx[12]!, mtx[13]!, mtx[14]!, mtx[15]!,
        )
        this.content.add(node)
        this.insts.push({ node, base, group: part.group, center: local.clone().applyMatrix4(base) })
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
    this.buildSelection()
    this.buildDims()
    this.applyOptions()
    if (!this.framed) this.frame()
    this.requestRender()
  }

  setOptions(o: ViewOptions): void {
    const selChanged = o.selectedBay !== this.opts.selectedBay
    this.opts = { ...o }
    if (selChanged) this.buildSelection()
    this.applyOptions()
    this.requestRender()
  }

  private colorOf(p: Part): string {
    return p.group === 'skin' && p.color ? p.color : GROUP_COLOR[p.group]
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
    if (this.dimLines) this.dimLines.visible = o.cotas
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

    const c = this.center
    const open = (this.cabinet.z * 0.9 * o.abertura) / 100
    const t = new THREE.Matrix4()
    for (const it of this.insts) {
      const off = new THREE.Vector3()
      if (o.explosao > 0) off.copy(it.center).sub(c).multiplyScalar(o.explosao * 1.1)
      if (it.group === 'gaveta') off.z += open
      t.makeTranslation(off.x, off.y, off.z)
      it.node.matrix.multiplyMatrices(t, it.base)
      it.node.matrixWorldNeedsUpdate = true
    }
  }

  frame(): void {
    this.framed = true
    this.setCameraDefault()
    this.requestRender()
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
    this.onPickBay((hit?.object.userData.bay as string | undefined) ?? null)
  }

  private recentre(e: MouseEvent): void {
    this.ray.setFromCamera(this.ndc(e), this.camera)
    const hit = this.ray.intersectObjects([...this.content.children, ...this.pickers.children], true)[0]
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
