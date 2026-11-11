import { useEffect, useRef, useState } from 'react'
import { copyText, getNfcCapability, writeUrlToNfcTag } from '../data/nfc'

/**
 * Ссылка KeepIt для NFC-метки (та же, что в QR).
 * iPhone: копирование + запись во внешнем приложении (NFC Tools).
 * Android с Web NFC: запись прямо из KeepIt.
 */
export function NfcLinkPanel({
  url,
  label,
  defaultOpen = false,
}: {
  url: string
  /** «вещи» / «места» — для текстов */
  label: 'вещи' | 'места'
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [capability] = useState(() => getNfcCapability())
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  async function onCopy() {
    setError(null)
    const result = await copyText(url)
    setMessage(result === 'copied' ? 'Ссылка скопирована — вставьте её в NFC Tools как URL / Website.' : null)
    if (result === 'failed') setError('Не удалось скопировать — выделите ссылку вручную.')
  }

  async function onWrite() {
    setError(null)
    setMessage(null)
    setBusy(true)
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    try {
      setMessage('Поднесите чистую NFC-метку (NTAG213) к телефону…')
      await writeUrlToNfcTag(url, controller.signal)
      setMessage('Готово: метка записана. Поднесите iPhone или Android — откроется эта карточка.')
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setMessage(null)
        return
      }
      setError(err instanceof Error ? err.message : 'Не удалось записать метку')
      setMessage(null)
    } finally {
      setBusy(false)
    }
  }

  function onCancelWrite() {
    abortRef.current?.abort()
    setBusy(false)
    setMessage(null)
  }

  const shortUrl = url.length > 64 ? `${url.slice(0, 64)}…` : url

  return (
    <div className="stack-tight">
      <button type="button" className="ghost crumb" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? 'Скрыть NFC-метку' : 'NFC-метка'}
      </button>
      {open ? (
        <div className="stack">
          <span className="muted">
            На NFC пишется та же ссылка KeepIt, что в QR {label}. Поднесите iPhone к метке — откроется карточка (как
            при скане QR). Подходят метки <strong>NTAG213</strong> (наклейки); на металл — только on-metal.
          </span>
          <code className="assign-code-value nfc-url">{shortUrl}</code>
          <div className="row wrap">
            <button type="button" className="secondary" disabled={busy} onClick={() => void onCopy()}>
              Скопировать ссылку
            </button>
            {capability.webNfc ? (
              busy ? (
                <button type="button" className="secondary" onClick={onCancelWrite}>
                  Отменить запись
                </button>
              ) : (
                <button type="button" disabled={busy} onClick={() => void onWrite()}>
                  Записать на NFC-метку
                </button>
              )
            ) : null}
          </div>
          {capability.writeHint === 'external-app' ? (
            <span className="muted">
              На iPhone KeepIt сам метки не пишет (нет Web NFC). Откройте NFC Tools → запись URL / Website → вставьте
              ссылку → поднесите метку.
            </span>
          ) : (
            <span className="muted">Запись из KeepIt доступна на этом телефоне (Web NFC). Можно и через NFC Tools.</span>
          )}
          {message ? <p className="scan-feedback ok">{message}</p> : null}
          {error ? <p className="error">{error}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
