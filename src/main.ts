import './ui/styles.css'
import { mountApp } from './ui/app'
import { Store } from './ui/state'

const root = document.getElementById('app')
if (root) {
  const store = new Store()
  mountApp(root, store)
  // ?debug exposes the store for manual and automated checks
  if (location.search.includes('debug')) (window as unknown as { __lg: Store }).__lg = store
}
