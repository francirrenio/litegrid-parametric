import { tr } from '../i18n'
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
      title: tr('Esqueleto sem travamento', 'Skeleton without bracing'),
      detail: tr('Uma moldura retangular sem diagonais deforma como paralelogramo. Diagonais nas janelas custam pouco filamento e travam nas duas direções.', 'A rectangular frame without diagonals deforms like a parallelogram. Diagonals in the windows cost little filament and lock it in both directions.'),
      patches: [{ path: 'skeleton.bracing', value: 'auto' }],
    })
  }

  if (p.materialLevel === 'minimo' && heavyBays.length > 0) {
    add({
      id: 'level-heavy', severity: 'warn', target: 'cabinet',
      title: tr('Nível mínimo com gavetas pesadas', 'Minimum level with heavy drawers'),
      detail: tr(`${heavyBays.length} gaveta(s) marcadas como pesadas. As prateleiras no nível mínimo são só trilhos: use "equilibrado" para trilhos com travessas.`, `${heavyBays.length} drawer(s) marked as heavy. Shelves at the minimum level are just rails: use "equilibrado" (balanced) for rails with crossbars.`),
      patches: [{ path: 'materialLevel', value: 'equilibrado' }],
    })
  }

  const wide = layout.bays.filter((b) => b.clearWidth > WIDE_SPAN && loadOf(b.section, b.row) !== 'leve')
  if (wide.length > 0 && p.materialLevel === 'minimo') {
    add({
      id: 'level-span', severity: 'info', target: 'cabinet',
      title: tr('Vãos largos no nível mínimo', 'Wide spans at the minimum level'),
      detail: tr(`Há vãos de mais de ${WIDE_SPAN} mm com carga média ou pesada. Nervuras no fundo da gaveta ou o nível equilibrado evitam o fundo embarrigar.`, `There are spans wider than ${WIDE_SPAN} mm with medium or heavy load. Ribs on the drawer floor or the balanced level keep the floor from sagging.`),
      patches: [{ path: 'drawerDefaults.floor.reinforcement', value: 'ribs' }],
    })
  }

  const tall = layout.bays.filter((b) => b.drawer.height > TALL_WALL)
  const sides = p.drawerDefaults.sides
  if (tall.length > 0 && sides.reinforcement === 'none' && sides.fill !== 'truss') {
    add({
      id: 'drawer-tall-walls', severity: 'info', target: 'drawerDefaults',
      title: tr('Paredes altas e finas nas gavetas', 'Tall, thin drawer walls'),
      detail: tr(`Em ${tall.length} gaveta(s) a parede passa de ${TALL_WALL} mm de altura. Uma borda superior reforçada trava a parede por quase nada de material; nervuras ou pilares e vigas também servem.`, `In ${tall.length} drawer(s) the wall is taller than ${TALL_WALL} mm. A reinforced top rim braces the wall for almost no material; ribs or pillars and beams also work.`),
      patches: [{ path: 'drawerDefaults.topRim', value: true }],
    })
  }

  if (sides.fill === 'closed' && heavyBays.length === 0 && tall.length > 0) {
    add({
      id: 'drawer-perforate', severity: 'info', target: 'drawerDefaults',
      title: tr('Vazar as paredes das gavetas', 'Perforate the drawer walls'),
      detail: tr('Paredes vazadas em hexágonos (favo de mel) mantêm a rigidez com bem menos material. O vazado para na altura que você definir, para peças pequenas não escaparem.', 'Walls perforated with hexagons (honeycomb) keep their stiffness with far less material. The perforation stops at the height you set, so small items do not fall out.'),
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
        title: tr('Painel de fixação sem recuo', 'Mounting panel without standoff'),
        detail: tr('As garras dos ganchos entram atrás do painel. Sem espaçadores ou bolsos os acessórios não assentam.', 'The hook claws go behind the panel. Without spacers or pockets the accessories do not seat properly.'),
        patches: [{ path: `skins.${face}.standoff`, value: 'spacers' }],
      })
    }
  }

  if (p.material === 'PLA' && heavyBays.length > 0) {
    add({
      id: 'material-creep', severity: 'info', target: 'cabinet',
      title: tr('PLA com carga pesada', 'PLA under heavy load'),
      detail: tr('O PLA cede aos poucos sob carga constante e amolece perto de 55 °C. Para ferramentas, PETG ou ASA aguentam melhor.', 'PLA slowly creeps under constant load and softens near 55 °C. For tools, PETG or ASA hold up better.'),
      patches: [{ path: 'material', value: 'PETG' }],
    })
  }

  if (p.cabinetMode === 'monolithic' && (p.width > p.printBed.x || p.depth > p.printBed.y || p.height > p.printBed.x)) {
    add({
      id: 'mono-bed', severity: 'warn', target: 'cabinet',
      title: tr('Gabinete maior que a mesa', 'Cabinet larger than the bed'),
      detail: tr('A peça única não cabe na mesa configurada. O modo esqueleto divide em peças planas que cabem em qualquer mesa.', 'The single piece does not fit the configured bed. Skeleton mode splits it into flat parts that fit any bed.'),
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
      title: tr('Gaveta maior que a mesa', 'Drawer larger than the bed'),
      detail: tr(`${count} gaveta(s) da fila ${row} (seção ${sec}) não cabem na mesa de ${p.printBed.x} x ${p.printBed.y} mm. Dividir a fila em mais gavetas deixa cada uma menor e mais fácil de imprimir.`, `${count} drawer(s) in row ${row} (section ${sec}) do not fit the ${p.printBed.x} x ${p.printBed.y} mm bed. Splitting the row into more drawers makes each one smaller and easier to print.`),
      patches: [{ path: `sections.${sec - 1}.rows.${row - 1}.divisions`, value: cur + 1 }],
    })
  }

  const narrowDividers = layout.bays.filter((b) => p.drawerDefaults.dividerSlots > 0 && b.clearWidth < 25)
  if (narrowDividers.length > 0) {
    add({
      id: 'dividers-narrow', severity: 'info', target: 'drawerDefaults',
      title: tr('Divisórias em gavetas estreitas', 'Dividers in narrow drawers'),
      detail: tr(`${narrowDividers.length} gaveta(s) têm menos de 25 mm de largura útil: as divisórias removíveis ficam inúteis.`, `${narrowDividers.length} drawer(s) have less than 25 mm of usable width: removable dividers become useless.`),
      patches: [{ path: 'drawerDefaults.dividerSlots', value: 0 }],
    })
  }

  if (nz.nozzle >= 0.6 && p.drawerDefaults.perimeters > 2) {
    add({
      id: 'nozzle-wall', severity: 'info', target: 'drawerDefaults',
      title: tr('Bico grosso: 2 perímetros bastam', 'Thick nozzle: 2 perimeters are enough'),
      detail: tr(`Com bico ${nz.nozzle} mm, 2 perímetros já dão ${nz.wall(2).toFixed(2)} mm de parede. Mais que isso gasta material sem ganho útil na maioria das gavetas.`, `With a ${nz.nozzle} mm nozzle, 2 perimeters already give ${nz.wall(2).toFixed(2)} mm of wall. More than that wastes material with no useful gain in most drawers.`),
      patches: [{ path: 'drawerDefaults.perimeters', value: 2 }],
    })
  }

  return out
}
