import { useState, type ReactNode } from 'react'
import { MoveItemSheet, MovePlaceSheet } from './MoveItemSheet'
import { ObjectAppearanceSheet, appearanceFromPlace } from './ObjectAppearanceSheet'
import { helpForScreen } from '../data/help'
import { objectLabelFromPlaces } from '../data/icons'
import { movesWithContents } from '../data/repository'
import type { KeepItState } from '../hooks/useKeepIt'
import type { PlaceType } from '../types'

const PLACE_TYPES: Array<{ value: PlaceType; label: string }> = [
  { value: 'room', label: 'Помещение' },
  { value: 'cabinet', label: 'Шкаф / стеллаж' },
  { value: 'shelf', label: 'Полка / ящик' },
  { value: 'box', label: 'Коробка' },
  { value: 'container', label: 'Контейнер' },
  { value: 'other', label: 'Другое' },
]

function titleFor(state: KeepItState): string {
  const screen = state.screen
  if (screen.name === 'home') return 'KeepIt'
  if (screen.name === 'object') return objectLabelFromPlaces(screen.objectKey, state.places)
  if (screen.name === 'place') return state.findPlace(screen.placeId)?.name ?? 'Место'
  if (screen.name === 'item') return state.findItem(screen.itemId)?.name ?? 'Вещь'
  if (screen.name === 'edit-item') {
    const item = state.findItem(screen.itemId)
    return item?.needsFill ? 'Заполнить' : 'Изменить'
  }
  if (screen.name === 'add-item') return 'Новая вещь'
  if (screen.name === 'scan') return 'Сканер'
  if (screen.name === 'search') return 'Поиск'
  if (screen.name === 'print') return 'Метки'
  if (screen.name === 'lent') return 'Передано'
  if (screen.name === 'settings') return 'Настройки'
  if (screen.name === 'more') return 'Ещё'
  return 'KeepIt'
}

type Sheet =
  | 'help'
  | 'menu'
  | 'add-choice'
  | 'add-place'
  | 'rename'
  | 'move-item'
  | 'move-place'
  | 'delete-place'
  | 'object-look'
  | null

export function TopBar({ state }: { state: KeepItState }) {
  const [sheet, setSheet] = useState<Sheet>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [placeName, setPlaceName] = useState('')
  const [placeType, setPlaceType] = useState<PlaceType>('box')
  const [renamePlaceId, setRenamePlaceId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const help = helpForScreen(state.screen)
  const title = titleFor(state)
  const addEnabled = state.screen.name === 'object' || state.screen.name === 'place'
  const objectScreen = state.screen.name === 'object' ? state.screen : null
  const objectRoot = objectScreen
    ? state.places.find(
        (place) => place.type === 'object' && place.objectKey === objectScreen.objectKey,
      )
    : undefined

  function openSheet(next: Sheet) {
    setHint(null)
    setActionError(null)
    setSheet(next)
  }

  function closeSheet() {
    setSheet(null)
    setHint(null)
    setActionError(null)
    setRenamePlaceId(null)
  }

  async function submitDeletePlace() {
    if (state.screen.name !== 'place') return
    const placeId = state.screen.placeId
    const place = state.findPlace(placeId)
    setBusy(true)
    setActionError(null)
    try {
      await state.removePlace(placeId)
      closeSheet()
      if (place?.parentId) {
        state.jump({ name: 'place', placeId: place.parentId })
      } else if (place) {
        state.jump({ name: 'object', objectKey: place.objectKey })
      } else {
        state.jump({ name: 'home' })
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось удалить')
    } finally {
      setBusy(false)
    }
  }

  function onAdd() {
    if (state.screen.name === 'object') {
      setPlaceName('')
      setPlaceType('room')
      openSheet('add-place')
      return
    }
    if (state.screen.name === 'place') {
      openSheet('add-choice')
      return
    }
    setHint('На этом экране добавление недоступно. Откройте объект или место.')
    openSheet('help')
  }

  function parentIdForAdd(): string | null {
    if (state.screen.name === 'place') return state.screen.placeId
    if (state.screen.name === 'object') {
      const objectKey = state.screen.objectKey
      return state.places.find((place) => place.type === 'object' && place.objectKey === objectKey)?.id ?? null
    }
    return null
  }

  async function submitNewPlace(parentId: string) {
    if (!placeName.trim()) return
    setBusy(true)
    try {
      const created = await state.createChildPlace(parentId, placeName, placeType)
      closeSheet()
      state.navigate({ name: 'place', placeId: created.id })
    } finally {
      setBusy(false)
    }
  }

  async function submitRename() {
    if (!renamePlaceId || !placeName.trim()) return
    setBusy(true)
    try {
      await state.renameCurrentPlace(renamePlaceId, placeName)
      closeSheet()
    } finally {
      setBusy(false)
    }
  }

  const typeOptions =
    state.screen.name === 'object' ? PLACE_TYPES.filter((option) => option.value === 'room') : PLACE_TYPES

  return (
    <>
      <header className={`topbar${state.screen.name === 'home' ? ' topbar-home' : ''}`}>
        {state.screen.name === 'home' ? null : (
          <button
            type="button"
            className="icon-btn"
            aria-label="Назад"
            disabled={!state.canGoBack}
            onClick={() => state.goBack()}
          >
            ←
          </button>
        )}

        <h1 className="topbar-title">
          {state.screen.name === 'home' ? (
            <>
              <img className="brand-mark" src="./icons/app-192.png" alt="" />
              <span>KeepIt</span>
            </>
          ) : (
            <span>{title}</span>
          )}
        </h1>

        <div className="topbar-actions">
          <button type="button" className="icon-btn" aria-label="Добавить" disabled={!addEnabled} onClick={onAdd}>
            +
          </button>
          <button type="button" className="icon-btn" aria-label="Справка" onClick={() => openSheet('help')}>
            ?
          </button>
          <button type="button" className="icon-btn" aria-label="Действия" onClick={() => openSheet('menu')}>
            ···
          </button>
        </div>
      </header>

      {sheet === 'help' ? (
        <SheetFrame title={hint ? 'Подсказка' : help.title} onClose={closeSheet}>
          <p>{hint ?? help.body}</p>
          <button type="button" onClick={closeSheet}>
            Понятно
          </button>
        </SheetFrame>
      ) : null}

      {sheet === 'menu' ? (
        <SheetFrame title="Действия" onClose={closeSheet}>
          <MenuActions
            state={state}
            onClose={closeSheet}
            onRename={(placeId, name) => {
              setRenamePlaceId(placeId)
              setPlaceName(name)
              openSheet('rename')
            }}
            onMoveItem={() => openSheet('move-item')}
            onMovePlace={() => openSheet('move-place')}
            onDeletePlace={() => openSheet('delete-place')}
            onObjectLook={() => openSheet('object-look')}
          />
        </SheetFrame>
      ) : null}

      {sheet === 'object-look' && objectRoot ? (
        <ObjectAppearanceSheet
          title="Значок и фон"
          initialName={objectRoot.name}
          initialIconId={appearanceFromPlace(objectRoot).iconId}
          initialIconBg={appearanceFromPlace(objectRoot).iconBg}
          busy={busy}
          onClose={closeSheet}
          onSave={async ({ name, iconId, iconBg }) => {
            setBusy(true)
            try {
              await state.updateRootLook(objectRoot.id, { name, iconId, iconBg })
              closeSheet()
            } finally {
              setBusy(false)
            }
          }}
        />
      ) : null}

      {sheet === 'move-item' && state.screen.name === 'item' ? (
        <MoveItemSheet
          state={state}
          itemId={state.screen.itemId}
          onClose={closeSheet}
        />
      ) : null}

      {sheet === 'move-place' && state.screen.name === 'place' ? (
        <MovePlaceSheet state={state} placeId={state.screen.placeId} onClose={closeSheet} />
      ) : null}

      {sheet === 'delete-place' && state.screen.name === 'place' ? (
        <SheetFrame title="Удалить место" onClose={closeSheet}>
          <p>
            Удалить «{state.findPlace(state.screen.placeId)?.name ?? 'место'}»? Место должно быть пустым —
            без вложенных мест и вещей.
          </p>
          {actionError ? <p className="error">{actionError}</p> : null}
          <button type="button" className="danger" disabled={busy} onClick={() => void submitDeletePlace()}>
            Удалить
          </button>
          <button type="button" className="secondary" disabled={busy} onClick={closeSheet}>
            Отмена
          </button>
        </SheetFrame>
      ) : null}

      {sheet === 'add-choice' && state.screen.name === 'place' ? (
        <AddChoiceSheet
          placeId={state.screen.placeId}
          onClose={closeSheet}
          onAddPlace={() => {
            setPlaceName('')
            setPlaceType('box')
            openSheet('add-place')
          }}
          onAddItem={(placeId) => {
            closeSheet()
            state.navigate({ name: 'add-item', placeId })
          }}
        />
      ) : null}

      {sheet === 'add-place' ? (
        <SheetFrame title="Новое место" onClose={closeSheet}>
          <label className="field">
            Название
            <input
              value={placeName}
              onChange={(event) => setPlaceName(event.target.value)}
              placeholder="Например, Коробка «Электрика»"
              autoFocus
            />
          </label>
          <label className="field">
            Тип
            <select value={placeType} onChange={(event) => setPlaceType(event.target.value as PlaceType)}>
              {typeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy || !placeName.trim() || !parentIdForAdd()}
            onClick={() => {
              const parentId = parentIdForAdd()
              if (parentId) void submitNewPlace(parentId)
            }}
          >
            Создать
          </button>
        </SheetFrame>
      ) : null}

      {sheet === 'rename' ? (
        <SheetFrame title="Переименовать" onClose={closeSheet}>
          <label className="field">
            Название
            <input value={placeName} onChange={(event) => setPlaceName(event.target.value)} autoFocus />
          </label>
          <button type="button" disabled={busy || !placeName.trim()} onClick={() => void submitRename()}>
            Сохранить
          </button>
        </SheetFrame>
      ) : null}
    </>
  )
}

function AddChoiceSheet({
  placeId,
  onClose,
  onAddPlace,
  onAddItem,
}: {
  placeId: string
  onClose: () => void
  onAddPlace: () => void
  onAddItem: (placeId: string) => void
}) {
  return (
    <SheetFrame title="Добавить" onClose={onClose}>
      <button type="button" className="list-item" onClick={onAddPlace}>
        <strong>Место хранения</strong>
      </button>
      <button type="button" className="list-item" onClick={() => onAddItem(placeId)}>
        <strong>Вещь</strong>
      </button>
    </SheetFrame>
  )
}

function SheetFrame({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div className="sheet" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal>
        <div className="row">
          <strong className="grow">{title}</strong>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <div className="stack">{children}</div>
      </div>
    </div>
  )
}

function MenuActions({
  state,
  onClose,
  onRename,
  onMoveItem,
  onMovePlace,
  onDeletePlace,
  onObjectLook,
}: {
  state: KeepItState
  onClose: () => void
  onRename: (placeId: string, name: string) => void
  onMoveItem: () => void
  onMovePlace: () => void
  onDeletePlace: () => void
  onObjectLook: () => void
}) {
  const screen = state.screen

  if (screen.name === 'home' || screen.name === 'more') {
    return (
      <button
        type="button"
        className="list-item"
        onClick={() => {
          onClose()
          state.navigate({ name: 'settings' })
        }}
      >
        <strong>Настройки приложения</strong>
      </button>
    )
  }

  if (screen.name === 'object') {
    const objectKey = screen.objectKey
    return (
      <>
        <button
          type="button"
          className="list-item"
          onClick={() => {
            onClose()
            onObjectLook()
          }}
        >
          <strong>Значок и фон</strong>
        </button>
        <button
          type="button"
          className="list-item"
          onClick={() => {
            const root = state.places.find(
              (place) => place.type === 'object' && place.objectKey === objectKey,
            )
            onClose()
            state.navigate({ name: 'print', placeId: root?.id })
          }}
        >
          <strong>Печать меток объекта</strong>
        </button>
      </>
    )
  }

  if (screen.name === 'place') {
    const placeId = screen.placeId
    const place = state.findPlace(placeId)
    const isObjectRoot = place?.type === 'object'
    return (
      <>
        <button type="button" className="list-item" onClick={() => onRename(placeId, place?.name ?? '')}>
          <strong>Переименовать место</strong>
        </button>
        {!isObjectRoot ? (
          <>
            <button
              type="button"
              className="list-item"
              onClick={() => {
                onClose()
                onMovePlace()
              }}
            >
              <strong>
                {place && movesWithContents(place.type) ? 'Перенести с содержимым' : 'Перенести'}
              </strong>
            </button>
            <button
              type="button"
              className="list-item"
              onClick={() => {
                onClose()
                onDeletePlace()
              }}
            >
              <strong>Удалить</strong>
            </button>
          </>
        ) : null}
        <button
          type="button"
          className="list-item"
          onClick={() => {
            onClose()
            state.navigate({ name: 'print', placeId })
          }}
        >
          <strong>Печать метки</strong>
        </button>
      </>
    )
  }

  if (screen.name === 'item') {
    const item = state.findItem(screen.itemId)
    return (
      <>
        <button
          type="button"
          className="list-item"
          onClick={() => {
            onClose()
            onMoveItem()
          }}
        >
          <strong>Перенести</strong>
        </button>
        <button
          type="button"
          className="list-item"
          onClick={() => {
            onClose()
            state.navigate({ name: 'edit-item', itemId: screen.itemId })
          }}
        >
          <strong>{item?.needsFill ? 'Заполнить карточку' : 'Изменить карточку'}</strong>
        </button>
      </>
    )
  }

  return <p className="muted">Для этого экрана отдельных действий пока нет.</p>
}
