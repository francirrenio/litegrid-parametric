import type {
  DrawerConfig, FaceFill, FaceId, FixingConfig, ProjectState, SkeletonConfig, SkinConfig,
} from './types'
import { PROJECT_VERSION } from './types'
import { tr } from '../i18n'

export function defaultFaceFill(overrides: Partial<FaceFill> = {}): FaceFill {
  return {
    fill: 'closed',
    pattern: 'hexagon',
    openPercent: 45,
    solidUpTo: 0,
    frame: 'auto',
    reinforcement: 'auto',
    reinforcementWidth: 'auto',
    panelSystem: 'skadis',
    pegboardHole: '1/4',
    hswVariant: 'sd',
    skadisStaggered: true,
    thickness: 'auto',
    ...overrides,
  }
}

export function defaultSkin(overrides: Partial<SkinConfig> = {}): SkinConfig {
  return {
    ...defaultFaceFill({ fill: 'closed' }),
    enabled: false,
    attach: 'tabs',
    standoff: 'spacers',
    standoffMm: 'auto',
    color: '#2dd4bf',
    ...overrides,
  }
}

export function defaultDrawer(overrides: Partial<DrawerConfig> = {}): DrawerConfig {
  return {
    perimeters: 2,
    floorPerimeters: 'auto',
    sides: defaultFaceFill({ fill: 'perforated', openPercent: 40, solidUpTo: 12, reinforcement: 'auto' }),
    floor: defaultFaceFill({ fill: 'closed', reinforcement: 'auto' }),
    front: 'slope',
    frontHeight: 'auto',
    chamferLength: 'auto',
    frontLip: false,
    lipDepth: 8,
    handle: 'cutout',
    labelHolder: true,
    labelMode: 'external',
    labelWidth: 40,
    labelHeight: 14,
    dividerSlots: 0,
    innerChamfer: true,
    topRim: false,
    rimWidth: 'auto',
    ...overrides,
  }
}

export const DEFAULT_SKELETON: SkeletonConfig = { perimeters: 3, barWidth: 'auto', bracing: 'auto' }

export const DEFAULT_FIXING: FixingConfig = {
  between: { pins: false, butterfly: false, screw: 'none', magnet: false },
  wall: { mode: 'none', screwDiameter: 4 },
  hangOnSkadis: false,
}

export function defaultProject(overrides: Partial<ProjectState> = {}): ProjectState {
  const skins = {} as Record<FaceId, SkinConfig>
  for (const f of ['left', 'right', 'top', 'bottom', 'back'] as FaceId[]) skins[f] = defaultSkin()
  return {
    version: PROJECT_VERSION,
    name: tr('Novo gabinete', 'New cabinet'),
    nozzle: 0.4,
    width: 200,
    height: 180,
    depth: 120,
    material: 'PLA',
    materialLevel: 'equilibrado',
    cabinetMode: 'skeleton',
    sections: [
      {
        width: 'auto',
        rows: [
          { height: 'auto', divisions: 3, load: 'leve' },
          { height: 'auto', divisions: 2, load: 'media' },
          { height: 'auto', divisions: 1, load: 'media' },
        ],
      },
    ],
    skeleton: { ...DEFAULT_SKELETON },
    skins,
    fixing: structuredClone(DEFAULT_FIXING),
    drawerDefaults: defaultDrawer(),
    overrides: {},
    printBed: { x: 220, y: 220 },
    smallestItem: 8,
    advanced: {},
    ...overrides,
  }
}

export const PRESETS: Record<string, () => ProjectState> = {
  parafusos: () =>
    defaultProject({
      name: tr('Parafusos', 'Screws'),
      width: 200,
      height: 200,
      depth: 120,
      smallestItem: 5,
      sections: [
        {
          width: 'auto',
          rows: [
            { height: 'auto', divisions: 4, load: 'leve' },
            { height: 'auto', divisions: 3, load: 'leve' },
            { height: 'auto', divisions: 2, load: 'media' },
            { height: 'auto', divisions: 1, load: 'media' },
          ],
        },
      ],
    }),
  smd: () =>
    defaultProject({
      name: tr('Componentes SMD', 'SMD components'),
      width: 200,
      height: 120,
      depth: 90,
      smallestItem: 3,
      sections: [
        {
          width: 'auto',
          rows: Array.from({ length: 4 }, () => ({ height: 'auto' as const, divisions: 4, load: 'leve' as const })),
        },
      ],
    }),
  ferramentas: () =>
    defaultProject({
      name: tr('Ferramentas', 'Tools'),
      width: 200,
      height: 160,
      depth: 160,
      materialLevel: 'reforcado',
      smallestItem: 20,
      sections: [
        {
          width: 'auto',
          rows: [
            { height: 'auto', divisions: 2, load: 'pesada' },
            { height: 'auto', divisions: 1, load: 'pesada' },
          ],
        },
      ],
      drawerDefaults: defaultDrawer({
        perimeters: 3,
        sides: defaultFaceFill({ fill: 'closed' }),
      }),
    }),
}
