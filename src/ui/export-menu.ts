import { tr } from '../i18n'
import {
  allPlates3mf, assemblyGuide, orca3mf, manifestJson, plate3mf, plateStl, projectZip, slicerProfileText, slug, zipStore,
} from '../export'
import { planPlates } from '../export'
import { generate } from '../gen'
import { stlBytes } from '../export/stl'
import { download, dropdown, h, icon, menuHeading, menuItem, toast } from './dom'
import type { Store } from './state'

function guard(label: string, fn: () => void): () => void {
  return () => {
    try {
      fn()
    } catch (e) {
      console.error(e)
      toast(tr(`Falha ao exportar ${label}: ${e instanceof Error ? e.message : String(e)}`, `Failed to export ${label}: ${e instanceof Error ? e.message : String(e)}`), 'error')
    }
  }
}

export function createExportMenu(st: Store): HTMLElement {
  const trigger = h('button', { type: 'button', class: 'btn primary' }, icon('download', 16), h('span', null, tr('Exportar', 'Export')))
  return dropdown(
    trigger,
    () => {
      const r = st.result
      const p = st.project
      const base = slug(p.name)
      const hasParts = r.parts.length > 0
      const plate = st.plates[st.view.plate]
      const n = plate?.index ?? 1
      const items: HTMLElement[] = [
        menuHeading(tr('Peças', 'Parts')),
        menuItem(tr('STL por peça (ZIP)', 'STL per part (ZIP)'), guard(tr('STL por peça', 'STL per part'), () => {
          const files = r.parts.map((part) => ({
            name: `${slug(part.id)}_x${part.instances.length}.stl`,
            data: stlBytes([{ name: part.label, mesh: part.mesh }]),
          }))
          download(zipStore(files), `${base}-pecas.zip`, 'application/zip')
        }), { disabled: !hasParts, hint: hasParts ? `${r.parts.length}` : tr('sem peças', 'no parts') }),
        menuItem(tr('STL da mesa atual', 'STL of current bed'), guard(tr('STL da mesa', 'bed STL'), () => {
          if (plate) download(plateStl(plate, r.parts), `${base}-mesa-${n}.stl`, 'model/stl')
        }), { disabled: !plate, hint: plate ? tr(`mesa ${n}`, `bed ${n}`) : '' }),
        menuItem(tr('3MF da mesa atual', '3MF of current bed'), guard(tr('3MF da mesa', 'bed 3MF'), () => {
          if (plate) download(plate3mf(plate, r.parts), `${base}-mesa-${n}.3mf`, 'model/3mf')
        }), { disabled: !plate, hint: plate ? tr(`mesa ${n}`, `bed ${n}`) : '' }),
        menuItem(tr('3MF para Orca Slicer (mesa por mesa)', '3MF for Orca Slicer (bed by bed)'), guard(tr('3MF do Orca', 'Orca 3MF'), () => download(orca3mf(st.plates, r.parts, p), `${base}-orca.3mf`, 'model/3mf')), { disabled: st.plates.length === 0, hint: st.plates.length ? tr(`${st.plates.length} mesas`, `${st.plates.length} beds`) : '' }),
        menuItem(tr('3MF com todas as mesas', '3MF with all beds'), guard(tr('3MF de todas as mesas', 'all-beds 3MF'), () => download(allPlates3mf(st.plates, r.parts, p.printBed.x), `${base}-todas-as-mesas.3mf`, 'model/3mf')), { disabled: st.plates.length === 0, hint: st.plates.length ? tr(`${st.plates.length} mesas`, `${st.plates.length} beds`) : '' }),
        menuHeading(tr('Antes de imprimir tudo', 'Before printing everything')),
        menuItem(tr('Peça de teste (STL, uma mesa)', 'Test piece (STL, one bed)'), guard(tr('peça de teste', 'test piece'), () => {
          const test = generate({ ...p, includeTestPiece: true }).parts.filter((x) => x.group === 'teste')
          const pl = planPlates(test, p.printBed)[0]
          if (!pl) throw new Error(tr('não foi possível gerar a peça de teste', 'could not generate the test piece'))
          download(plateStl(pl, test), `${base}-peca-de-teste.stl`, 'model/stl')
        }), { hint: tr('recomendado', 'recommended') }),
        menuHeading(tr('Projeto', 'Project')),
        menuItem(tr('ZIP completo', 'Full ZIP'), guard(tr('ZIP completo', 'full ZIP'), () => download(projectZip(r, p, st.plateLayout), `${base}.zip`, 'application/zip'))),
        menuItem('layout_manifest.json', guard(tr('manifesto', 'manifest'), () => download(manifestJson(r), 'layout_manifest.json', 'application/json'))),
        menuItem(tr('Perfil de fatiador (.txt)', 'Slicer profile (.txt)'), guard(tr('perfil', 'profile'), () => download(slicerProfileText(p, r.parts), `${base}-perfil-fatiador.txt`))),
        menuItem(tr('Guia de montagem (.md)', 'Assembly guide (.md)'), guard(tr('guia', 'guide'), () => download(assemblyGuide(r, p), `${base}-guia-montagem.md`, 'text/markdown'))),
      ]
      return h('div', { class: 'menu-list' }, items)
    },
    'right',
  )
}
