// Сервис-воркер KeepIt: только уведомления об обновлениях. Файлы не кэширует,
// чтобы новая версия всегда приходила с сервера.

const META_CACHE = 'keepit-meta'
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
