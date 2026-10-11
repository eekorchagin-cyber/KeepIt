export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function publicAppUrl(): string {
  const fromEnv = import.meta.env.VITE_PUBLIC_APP_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  if (typeof location !== 'undefined') {
    return `${location.origin}${location.pathname.replace(/\/$/, '')}`
  }
  return ''
}

export function randomCode(length = 5): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let code = ''
  for (const byte of bytes) {
    code += CODE_ALPHABET[byte % CODE_ALPHABET.length] ?? 'A'
  }
  return code
}

export function inviteCode(): string {
  return `D-${randomCode(5)}`
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/[\s-]/g, '')
}

export function formatCode(code: string): string {
  const raw = normalizeCode(code)
  if (raw.length < 2) return raw
  return `${raw[0]}-${raw.slice(1)}`
}

export function editCode(value: string): string {
  const raw = normalizeCode(value)
  if (!raw) return ''
  if (raw.length === 1) return `${raw}-`
  return `${raw[0]}-${raw.slice(1)}`
}

export function isInviteCode(code: string): boolean {
  const raw = normalizeCode(code)
  return raw.length === 6 && raw.startsWith('D')
}

export function randomPassword(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function localAuthEmail(userId: string): string {
  return `${userId.replaceAll('-', '')}@keepit.local`
}

export function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local')
}
