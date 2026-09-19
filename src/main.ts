import { tr } from './i18n'
import './ui/styles.css'
import { mountApp } from './ui/app'
import { toast } from './ui/dom'
import { maybeWelcome } from './ui/help'
import { projectFromHash } from './ui/share'
import { Store } from './ui/state'

document.querySelector('meta[name="description"]')?.setAttribute('content', tr('Gerador paramétrico de organizadores com gavetas para impressão FDM, direto no navegador.', 'Parametric generator of drawer organizers for FDM printing, right in the browser.'))
const root = document.getElementById('app')
if (root) {
  const store = new Store()
  mountApp(root, store)
  maybeWelcome()
  projectFromHash(location.hash)
    .then((p) => {
      if (!p) return
      history.replaceState(null, '', location.pathname + location.search)
      store.newProject(p)
      toast(tr(`Projeto "${p.name}" aberto a partir do link.`, `Project "${p.name}" opened from the link.`), 'ok')
    })
    .catch((e) => toast(e instanceof Error ? e.message : tr('Link inválido.', 'Invalid link.'), 'error'))
  // ?debug exposes the store for manual and automated checks
  if (location.search.includes('debug')) (window as unknown as { __lg: Store }).__lg = store
}
