export const APP_VERSION = __APP_VERSION__

export type RemoteVersion = {
  version: string
  title?: string
  notes?: string
}

/** «0.2.0+20261018-1651» → номер 0.2.0 и дата сборки 18.10.2026, 16:51. */
export function parseAppVersion(raw = APP_VERSION): { number: string; date: string; time: string } {
  const plus = raw.indexOf('+')
  const number = plus === -1 ? raw : raw.slice(0, plus)
  const stamp = plus === -1 ? '' : raw.slice(plus + 1)
  const match = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(stamp)
  if (!match) return { number, date: stamp, time: '' }
  return { number, date: `${match[3]}.${match[2]}.${match[1]}`, time: `${match[4]}:${match[5]}` }
}

export function versionLabel(raw = APP_VERSION): string {
  const { number, date, time } = parseAppVersion(raw)
  if (!date) return number
  return time ? `${number} от ${date}, ${time}` : `${number} от ${date}`
}

export function isLocalHost(hostname = location.hostname): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local')
}

export async function fetchRemoteVersion(): Promise<RemoteVersion | null> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 8_000)
  try {
    const response = await fetch(`./version.json?t=${Date.now()}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) return null
    const data = (await response.json()) as RemoteVersion
    return data?.version ? data : null
  } catch {
    return null
  } finally {
    window.clearTimeout(timer)
  }
}
