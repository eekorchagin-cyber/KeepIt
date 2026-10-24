// Сервис-воркер KeepIt: уведомления об обновлениях и запасная копия программы.
// Страница берётся с сервера (новая версия приходит сразу); если сервер не ответил за несколько секунд
// или недоступен — открывается сохранённая копия, данные и так хранятся на устройстве.

const META_CACHE = 'keepit-meta'
const APP_CACHE = 'keepit-app'
const NAVIGATION_TIMEOUT_MS = 4000
const CURRENT_KEY = './__current-version'
const NOTIFIED_KEY = './__notified-version'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

async function readMeta(key) {
  const cache = await caches.open(META_CACHE)
  const response = await cache.match(key)
  return response ? response.text() : ''
}

async function writeMeta(key, value) {
  const cache = await caches.open(META_CACHE)
  await cache.put(key, new Response(value))
}

function versionLabel(raw) {
  const plus = raw.indexOf('+')
  const version = plus === -1 ? raw : raw.slice(0, plus)
  const match = (plus === -1 ? '' : raw.slice(plus + 1)).match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/)
  return match ? `${version} от ${match[3]}.${match[2]}.${match[1]}` : version
}

async function showUpdate(remote) {
  const notified = await readMeta(NOTIFIED_KEY)
  if (notified === remote.version) return
  await writeMeta(NOTIFIED_KEY, remote.version)
  await self.registration.showNotification('KeepIt: доступно обновление', {
    body: `Версия ${versionLabel(remote.version)}. Откройте KeepIt и нажмите «Обновить».`,
    icon: './icons/app-192.png',
    badge: './icons/app-192.png',
    tag: 'keepit-update',
    data: { version: remote.version },
  })
  if (self.navigator && typeof self.navigator.setAppBadge === 'function') {
    try {
      await self.navigator.setAppBadge(1)
    } catch {
      // значок недоступен
    }
  }
}

async function checkForUpdate() {
  const current = await readMeta(CURRENT_KEY)
  if (!current) return
  const response = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' })
  if (!response.ok) return
  const remote = await response.json()
  if (remote && remote.version && remote.version !== current) await showUpdate(remote)
}

self.addEventListener('message', (event) => {
  const data = event.data || {}
  if (data.type === 'current-version' && typeof data.version === 'string') {
    event.waitUntil(writeMeta(CURRENT_KEY, data.version))
  }
  if (data.type === 'show-update' && data.remote && typeof data.remote.version === 'string') {
    event.waitUntil(showUpdate(data.remote))
  }
})

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'keepit-update-check') event.waitUntil(checkForUpdate())
})

const APP_SHELL_KEY = new URL('./', self.registration.scope).href

/** Убрать из кэша файлы прежних сборок, на которые новая страница уже не ссылается */
async function pruneAssets(html) {
  const cache = await caches.open(APP_CACHE)
  const used = new Set([...html.matchAll(/assets\/[^"' )]+/g)].map((match) => match[0]))
  for (const request of await cache.keys()) {
    const path = new URL(request.url).pathname
    const asset = path.slice(path.indexOf('assets/'))
    if (path.includes('/assets/') && !used.has(asset)) await cache.delete(request)
  }
}

/** Страница программы: сначала сервер, при задержке или ошибке — сохранённая копия */
async function navigationResponse(request) {
  const cache = await caches.open(APP_CACHE)
  const network = fetch(request).then(async (response) => {
    if (response.ok) {
      await cache.put(APP_SHELL_KEY, response.clone())
      response
        .clone()
        .text()
        .then(pruneAssets)
        .catch(() => undefined)
    }
    return response
  })
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NAVIGATION_TIMEOUT_MS))
  try {
    const fast = await Promise.race([network, timeout])
    if (fast && fast.ok) return fast
  } catch {
    // сервер недоступен — ниже сохранённая копия
  }
  const cached = await cache.match(APP_SHELL_KEY)
  if (cached) return cached
  return network
}

/**
 * Файлы сборки (с хэшем в имени — не меняются) и значки: сразу из кэша, иначе с сервера с сохранением.
 * Значки без хэша дополнительно тихо обновляются в фоне.
 */
async function assetResponse(request, refresh) {
  const cache = await caches.open(APP_CACHE)
  const cached = await cache.match(request)
  const load = () =>
    fetch(request).then(async (response) => {
      if (response.ok) await cache.put(request, response.clone())
      return response
    })
  if (!cached) return load()
  if (refresh) load().catch(() => undefined)
  return cached
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  // Номер версии — всегда с сервера, иначе не узнать об обновлении
  if (url.pathname.endsWith('/version.json')) return
  if (request.mode === 'navigate') {
    event.respondWith(navigationResponse(request))
    return
  }
  if (url.pathname.includes('/assets/')) {
    event.respondWith(assetResponse(request, false))
  } else if (url.pathname.includes('/icons/')) {
    event.respondWith(assetResponse(request, true))
  }
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows[0]
      if (open) return open.focus()
      return self.clients.openWindow('./')
    }),
  )
})
