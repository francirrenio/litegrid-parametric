import './ui/styles.css'
import { mountApp } from './ui/app'
import { toast } from './ui/dom'
import { maybeWelcome } from './ui/help'
import { projectFromHash } from './ui/share'
import { Store } from './ui/state'

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
      toast(`Projeto "${p.name}" aberto a partir do link.`, 'ok')
    })
    .catch((e) => toast(e instanceof Error ? e.message : 'Link inválido.', 'error'))
  // ?debug exposes the store for manual and automated checks
  if (location.search.includes('debug')) (window as unknown as { __lg: Store }).__lg = store
}
