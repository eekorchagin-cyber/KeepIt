import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const root = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }

function buildStamp(): string {
  const date = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`
}

const stamp = buildStamp()
const appVersion = `${pkg.version}+${stamp}`

type ReleaseEntry = { version: string; date: string; notes: string }

/** История выпусков, новые сверху: описание для плашки «Доступна новая версия» и экран «История обновлений». */
function releaseHistory(): ReleaseEntry[] {
  const path = join(root, 'release-history.json')
  if (!existsSync(path)) return []
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown
    if (!Array.isArray(raw)) return []
    return raw.filter(
      (entry): entry is ReleaseEntry =>
        typeof entry?.version === 'string' && typeof entry?.date === 'string' && typeof entry?.notes === 'string',
    )
  } catch {
    return []
  }
}

const history = releaseHistory()

/** Описание текущего выпуска — только если запись в истории про эту версию. */
function releaseNote(): { title?: string; notes?: string } {
  const latest = history[0]
  if (!latest || latest.version !== pkg.version) return {}
  return { title: `KeepIt ${latest.version}`, notes: latest.notes }
}

function pagesVersionPlugin(): Plugin {
  return {
    name: 'pages-version',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: `${JSON.stringify({ version: appVersion, ...releaseNote() })}\n`,
      })
    },
    closeBundle() {
      const manifestPath = join(root, 'dist/manifest.webmanifest')
      if (!existsSync(manifestPath)) return
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        start_url?: string
      }
      manifest.start_url = `./?v=${stamp}`
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    },
  }
}

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __RELEASE_HISTORY__: JSON.stringify(history),
  },
  plugins: [react(), pagesVersionPlugin()],
  server: {
    host: true,
    port: 5174,
    strictPort: true,
    headers: {
      'Cache-Control': 'no-store',
    },
  },
})
