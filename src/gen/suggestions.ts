import type { Layout } from '../core/layout'
import type { Nozzle } from '../core/nozzle'
import type { Suggestion } from '../model/part'
import type { ProjectState } from '../model/types'

const TALL_WALL = 45
const WIDE_SPAN = 110

export function buildSuggestions(p: ProjectState, layout: Layout, nz: Nozzle): Suggestion[] {
  const out: Suggestion[] = []
  const add = (s: Suggestion) => out.push(s)
  const loadOf = (section: number, row: number) => p.sections[section - 1]?.rows[row - 1]?.load ?? 'media'
  const heavyBays = layout.bays.filter((b) => loadOf(b.section, b.row) === 'pesada')

  if (p.skeleton.bracing === 'none') {
    add({
      id: 'skeleton-bracing', severity: 'warn', target: 'cabinet',
      title: 'Esqueleto sem travamento',
      detail: 'Uma moldura retangular sem diagonais deforma como paralelogramo. Diagonais nas janelas custam pouco filamento e travam nas duas direções.',
      patches: [{ path: 'skeleton.bracing', value: 'auto' }],
    })
  }

  if (p.materialLevel === 'minimo' && heavyBays.length > 0) {
    add({
      id: 'level-heavy', severity: 'warn', target: 'cabinet',
      title: 'Nível mínimo com gavetas pesadas',
      detail: `${heavyBays.length} gaveta(s) marcadas como pesadas. As prateleiras no nível mínimo são só trilhos: use "equilibrado" para trilhos com travessas.`,
      patches: [{ path: 'materialLevel', value: 'equilibrado' }],
    })
  }

  const wide = layout.bays.filter((b) => b.clearWidth > WIDE_SPAN && loadOf(b.section, b.row) !== 'leve')
  if (wide.length > 0 && p.materialLevel === 'minimo') {
    add({
      id: 'level-span', severity: 'info', target: 'cabinet',
      title: 'Vãos largos no nível mínimo',
      detail: `Há vãos de mais de ${WIDE_SPAN} mm com carga média ou pesada. Nervuras no fundo da gaveta ou o nível equilibrado evitam o fundo embarrigar.`,
      patches: [{ path: 'drawerDefaults.floor.reinforcement', value: 'ribs' }],
    })
  }

  const tall = layout.bays.filter((b) => b.drawer.height > TALL_WALL)
  const sides = p.drawerDefaults.sides
  if (tall.length > 0 && sides.reinforcement === 'none' && sides.fill !== 'truss') {
    add({
      id: 'drawer-tall-walls', severity: 'info', target: 'drawerDefaults',
      title: 'Paredes altas e finas nas gavetas',
      detail: `Em ${tall.length} gaveta(s) a parede passa de ${TALL_WALL} mm de altura. Uma borda superior reforçada trava a parede por quase nada de material; nervuras ou pilares e vigas também servem.`,
      patches: [{ path: 'drawerDefaults.topRim', value: true }],
    })
  }

  if (sides.fill === 'closed' && heavyBays.length === 0 && tall.length > 0) {
    add({
      id: 'drawer-perforate', severity: 'info', target: 'drawerDefaults',
      title: 'Vazar as paredes das gavetas',
      detail: 'Paredes vazadas em hexágonos (favo de mel) mantêm a rigidez com bem menos material. O vazado para na altura que você definir, para peças pequenas não escaparem.',
      patches: [
        { path: 'drawerDefaults.sides.fill', value: 'perforated' },
        { path: 'drawerDefaults.sides.pattern', value: 'hexagon' },
      ],
    })
  }

  for (const face of ['left', 'right', 'top', 'bottom', 'back'] as const) {
    const s = p.skins[face]
    if (s.enabled && s.fill === 'panel' && s.standoff === 'none') {
      add({
        id: `skin-standoff-${face}`, severity: 'warn', target: face,
        title: 'Painel de fixação sem recuo',
        detail: 'As garras dos ganchos entram atrás do painel. Sem espaçadores ou bolsos os acessórios não assentam.',
        patches: [{ path: `skins.${face}.standoff`, value: 'spacers' }],
      })
    }
  }

  if (p.material === 'PLA' && heavyBays.length > 0) {
    add({
      id: 'material-creep', severity: 'info', target: 'cabinet',
      title: 'PLA com carga pesada',
      detail: 'O PLA cede aos poucos sob carga constante e amolece perto de 55 °C. Para ferramentas, PETG ou ASA aguentam melhor.',
      patches: [{ path: 'material', value: 'PETG' }],
    })
  }

  if (p.cabinetMode === 'monolithic' && (p.width > p.printBed.x || p.depth > p.printBed.y || p.height > p.printBed.x)) {
    add({
      id: 'mono-bed', severity: 'warn', target: 'cabinet',
      title: 'Gabinete maior que a mesa',
      detail: 'A peça única não cabe na mesa configurada. O modo esqueleto divide em peças planas que cabem em qualquer mesa.',
      patches: [{ path: 'cabinetMode', value: 'skeleton' }],
    })
  }

  const bedMax = Math.max(p.printBed.x, p.printBed.y), bedMin = Math.min(p.printBed.x, p.printBed.y)
  const rowsTooBig = new Map<string, { s: number; r: number; count: number }>()
  for (const b of layout.bays) {
    const a = Math.max(b.drawer.width, b.drawer.depth), c = Math.min(b.drawer.width, b.drawer.depth)
    if (a > bedMax - 4 || c > bedMin - 4) {
      const k = `${b.section}-${b.row}`
      const cur = rowsTooBig.get(k) ?? { s: b.section, r: b.row, count: 0 }
      cur.count++
      rowsTooBig.set(k, cur)
    }
  }
  for (const { s: sec, r: row, count } of rowsTooBig.values()) {
    const cur = p.sections[sec - 1]?.rows[row - 1]?.divisions ?? 1
    add({
      id: `drawer-bed-${sec}-${row}`, severity: 'warn', target: `BAY_S${sec}_R${row}_C1`,
      title: 'Gaveta maior que a mesa',
      detail: `${count} gaveta(s) da fila ${row} (seção ${sec}) não cabem na mesa de ${p.printBed.x} x ${p.printBed.y} mm. Dividir a fila em mais gavetas deixa cada uma menor e mais fácil de imprimir.`,
      patches: [{ path: `sections.${sec - 1}.rows.${row - 1}.divisions`, value: cur + 1 }],
    })
  }

  const narrowDividers = layout.bays.filter((b) => p.drawerDefaults.dividerSlots > 0 && b.clearWidth < 25)
  if (narrowDividers.length > 0) {
    add({
      id: 'dividers-narrow', severity: 'info', target: 'drawerDefaults',
      title: 'Divisórias em gavetas estreitas',
      detail: `${narrowDividers.length} gaveta(s) têm menos de 25 mm de largura útil: as divisórias removíveis ficam inúteis.`,
      patches: [{ path: 'drawerDefaults.dividerSlots', value: 0 }],
    })
  }

  if (nz.nozzle >= 0.6 && p.drawerDefaults.perimeters > 2) {
    add({
      id: 'nozzle-wall', severity: 'info', target: 'drawerDefaults',
      title: 'Bico grosso: 2 perímetros bastam',
      detail: `Com bico ${nz.nozzle} mm, 2 perímetros já dão ${nz.wall(2).toFixed(2)} mm de parede. Mais que isso gasta material sem ganho útil na maioria das gavetas.`,
      patches: [{ path: 'drawerDefaults.perimeters', value: 2 }],
    })
  }

  return out
}
