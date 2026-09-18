import {
  assemblyGuide, manifestJson, plate3mf, plateStl, projectZip, slicerProfileText, slug, zipStore,
} from '../export'
import { stlBytes } from '../export/stl'
import { download, dropdown, h, icon, menuHeading, menuItem, toast } from './dom'
import type { Store } from './state'

function guard(label: string, fn: () => void): () => void {
  return () => {
    try {
      fn()
    } catch (e) {
      console.error(e)
      toast(`Falha ao exportar ${label}: ${e instanceof Error ? e.message : String(e)}`, 'error')
    }
  }
}

export function createExportMenu(st: Store): HTMLElement {
  const trigger = h('button', { type: 'button', class: 'btn primary' }, icon('download', 16), h('span', null, 'Exportar'))
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
        menuHeading('Peças'),
        menuItem('STL por peça (ZIP)', guard('STL por peça', () => {
          const files = r.parts.map((part) => ({
            name: `${slug(part.id)}_x${part.instances.length}.stl`,
            data: stlBytes([{ name: part.label, mesh: part.mesh }]),
          }))
          download(zipStore(files), `${base}-pecas.zip`, 'application/zip')
        }), { disabled: !hasParts, hint: hasParts ? `${r.parts.length}` : 'sem peças' }),
        menuItem('STL da mesa atual', guard('STL da mesa', () => {
          if (plate) download(plateStl(plate, r.parts), `${base}-mesa-${n}.stl`, 'model/stl')
        }), { disabled: !plate, hint: plate ? `mesa ${n}` : '' }),
        menuItem('3MF da mesa atual', guard('3MF da mesa', () => {
          if (plate) download(plate3mf(plate, r.parts), `${base}-mesa-${n}.3mf`, 'model/3mf')
        }), { disabled: !plate, hint: plate ? `mesa ${n}` : '' }),
        menuHeading('Projeto'),
        menuItem('ZIP completo', guard('ZIP completo', () => download(projectZip(r, p), `${base}.zip`, 'application/zip'))),
        menuItem('layout_manifest.json', guard('manifesto', () => download(manifestJson(r), 'layout_manifest.json', 'application/json'))),
        menuItem('Perfil de fatiador (.txt)', guard('perfil', () => download(slicerProfileText(p, r.parts), `${base}-perfil-fatiador.txt`))),
        menuItem('Guia de montagem (.md)', guard('guia', () => download(assemblyGuide(r, p), `${base}-guia-montagem.md`, 'text/markdown'))),
      ]
      return h('div', { class: 'menu-list' }, items)
    },
    'right',
  )
}
