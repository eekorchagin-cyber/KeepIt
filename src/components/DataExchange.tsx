import { useRef, useState } from 'react'
import type { KeepItState } from '../hooks/useKeepIt'
import { readFileAsText } from '../data/backup'

/** Экспорт и импорт всех данных файлом JSON */
export function DataExchange({ state, onDone }: { state: KeepItState; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onExport() {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await state.exportData()
      setMessage('Резервная копия готова')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось экспортировать')
    } finally {
      setBusy(false)
    }
  }

  function askImport() {
    setError(null)
    setMessage(null)
    fileRef.current?.click()
  }

  async function onImportFile(file: File | undefined) {
    if (!file) return

    // Важно: читаем файл ДО confirm — иначе на iOS содержимое часто уже пустое.
    let text: string
    try {
      text = await readFileAsText(file)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось прочитать файл')
      if (fileRef.current) fileRef.current.value = ''
      return
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }

    if (!confirm('Импорт заменит все данные на этом устройстве содержимым файла. Продолжить?')) {
      return
    }

    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const summary = await state.importData(text)
      const when = summary.exportedAt ? ` от ${summary.exportedAt.slice(0, 10)}` : ''
      const done = `Импортировано${when}: ${summary.places} мест, ${summary.items} вещей`
      setMessage(done)
      window.alert(done)
      onDone()
      state.jump({ name: 'home' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось импортировать')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <strong>Обмен данными</strong>
      <p className="muted">
        Данные хранятся на этом устройстве. Экспорт на одном устройстве → передайте файл → импорт на другом.
        Импортируйте в том же браузере, где пользуетесь KeepIt (не в превью мессенджера).
      </p>
      <button type="button" className="list-item" disabled={busy} onClick={() => void onExport()}>
        <span>
          <strong>Экспорт</strong>
          <span className="muted">Скачать или поделиться JSON</span>
        </span>
      </button>
      <button type="button" className="list-item" disabled={busy} onClick={askImport}>
        <span>
          <strong>Импорт</strong>
          <span className="muted">Заменить данные из файла</span>
        </span>
      </button>
      <input
        ref={fileRef}
        className="file-input-hidden"
        type="file"
        accept=".json,application/json,text/plain,text/*"
        onChange={(event) => void onImportFile(event.target.files?.[0])}
      />
      {message ? <p className="muted">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </div>
  )
}
