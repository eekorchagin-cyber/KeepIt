import { useRef, useState } from 'react'
import type { KeepItState } from '../hooks/useKeepIt'
import { objectLabelFromPlaces } from '../data/icons'
import { readFileAsText } from '../data/backup'

export function MoreScreen({ state }: { state: KeepItState }) {
  const active = state.settings?.activeObject ?? 'dacha'
  const root = state.places.find((place) => place.type === 'object' && place.objectKey === active)
  const lentCount = state.lentItems().length
  const activeLabel = objectLabelFromPlaces(active, state.places)
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

    if (
      !confirm(
        'Импорт заменит все данные на этом устройстве содержимым файла. Продолжить?',
      )
    ) {
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
      state.jump({ name: 'home' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось импортировать')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack screen-fill">
      <div className="panel stack">
        <strong>Ещё</strong>
        <p className="muted">
          Активный объект: {activeLabel}. Данные хранятся на этом устройстве — переносите через
          экспорт и импорт файла.
        </p>
      </div>

      <div className="panel stack">
        <button type="button" className="list-item" onClick={() => state.navigate({ name: 'lent' })}>
          <span>
            <strong>Передано на время</strong>
            <span className="muted">Кому отдали и с какой даты</span>
          </span>
          {lentCount > 0 ? <span className="badge warn">{lentCount}</span> : null}
        </button>
        <button
          type="button"
          className="list-item"
          onClick={() => state.navigate({ name: 'categories' })}
        >
          <span>
            <strong>Справочник категорий</strong>
            <span className="muted">Категории и подкатегории</span>
          </span>
        </button>
        <button
          type="button"
          className="list-item"
          onClick={() => state.navigate({ name: 'print', placeId: root?.id })}
        >
          <span>
            <strong>Печать меток</strong>
            <span className="muted">QR на лист A4</span>
          </span>
        </button>
        <button type="button" className="list-item" onClick={() => state.navigate({ name: 'settings' })}>
          <span>
            <strong>Настройки</strong>
            <span className="muted">Тема и сведения о версии</span>
          </span>
        </button>
      </div>

      <div className="panel stack">
        <strong>Обмен данными</strong>
        <p className="muted">
          Экспорт на одном устройстве → передайте файл → импорт на другом. Импортируйте в том же
          браузере, где пользуетесь KeepIt (не в превью мессенджера).
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
    </div>
  )
}
