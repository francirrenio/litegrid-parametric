import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

const version: string = JSON.parse(readFileSync('./package.json', 'utf8')).version
let commit = 'dev'
try {
  commit = execSync('git rev-parse --short HEAD').toString().trim()
} catch {
  /* not a git checkout */
}
const built = new Date().toISOString()

export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(commit),
    __APP_BUILT__: JSON.stringify(built),
  },
  plugins: [
    {
      name: 'version-file',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version, commit, built }) })
      },
    },
  ],
})
