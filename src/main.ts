import './ui/styles.css'
import { mountApp } from './ui/app'
import { Store } from './ui/state'

const root = document.getElementById('app')
if (root) mountApp(root, new Store())
