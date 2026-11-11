/**
 * NFC для KeepIt: на метку пишется та же ссылка, что в QR (#/item/… или #/place/…).
 * iPhone читает такие метки системой (без Web NFC). Запись из браузера — только где есть Web NFC (Android Chrome).
 */

export type NfcCapability = {
  /** Web NFC API (запись/чтение из страницы) — в основном Android Chrome */
  webNfc: boolean
  /** Подсказка для пользователя */
  writeHint: 'web-nfc' | 'external-app'
}

type NDEFReaderLike = {
  write: (
    message: { records: Array<{ recordType: string; data?: string }> },
    options?: { signal?: AbortSignal },
  ) => Promise<void>
}

function NDEFReaderCtor(): (new () => NDEFReaderLike) | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as unknown as { NDEFReader?: new () => NDEFReaderLike }).NDEFReader
}

export function getNfcCapability(): NfcCapability {
  const webNfc = Boolean(NDEFReaderCtor())
  return {
    webNfc,
    writeHint: webNfc ? 'web-nfc' : 'external-app',
  }
}

export async function copyText(text: string): Promise<'copied' | 'failed'> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return 'copied'
    }
  } catch {
    /* fallback below */
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok ? 'copied' : 'failed'
  } catch {
    return 'failed'
  }
}

/**
 * Записать URL на следующую поднесённую NFC-метку (NTAG с NDEF).
 * Требует жест пользователя и Web NFC.
 */
export async function writeUrlToNfcTag(url: string, signal?: AbortSignal): Promise<void> {
  const Ctor = NDEFReaderCtor()
  if (!Ctor) throw new Error('Этот телефон не умеет писать NFC из KeepIt. Скопируйте ссылку и запишите её в NFC Tools.')
  const reader = new Ctor()
  await reader.write({ records: [{ recordType: 'url', data: url }] }, { signal })
}
