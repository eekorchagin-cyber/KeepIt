import { useEffect, useState, type ReactNode } from 'react'
import { onAddPlaceRequest, onMovePlaceRequest } from '../data/uiEvents'
import { ChoiceSelect } from './ChoiceSelect'
import { DataExchange } from './DataExchange'
import { MoveItemSheet, MovePlaceSheet } from './MoveItemSheet'
import { ObjectAppearanceSheet, appearanceFromPlace } from './ObjectAppearanceSheet'
import { helpForScreen } from '../data/help'
import { defaultObjectAppearance, objectLabelFromPlaces } from '../data/icons'
import { PLACE_TYPES, canNest } from '../data/placeTypes'
import { dueServiceItems } from '../data/service'
import type { KeepItState } from '../hooks/useKeepIt'
import type { PlaceType, Screen } from '../types'

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
  if (screen.name === 'import-list') return 'Импорт списка'
  if (screen.name === 'gather-items') return 'Перенести сюда'
  if (screen.name === 'duplicates') return 'Дубли вещей'
  if (screen.name === 'inventory') return 'Инвентаризация'
  if (screen.name === 'reminders') return 'Напоминания'
  if (screen.name === 'categorize') return 'Категории вещей'
  if (screen.name === 'scan') return 'Сканер'
  if (screen.name === 'search') return 'Поиск'
  if (screen.name === 'print') return 'Печать QR-меток'
  if (screen.name === 'lent') return 'Передано'
  if (screen.name === 'categories') return 'Категории'
  if (screen.name === 'settings') return 'Настройки'
  if (screen.name === 'about') return 'О программе'
  if (screen.name === 'releases') return 'История обновлений'
  if (screen.name === 'assign-code') return 'Присвоить код'
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
  | 'add-object'
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
  const addEnabled =
    state.screen.name === 'home' || state.screen.name === 'object' || state.screen.name === 'place'
  const newObjectDefaults = defaultObjectAppearance('custom')
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

  // «Добавить место» с экрана пустого места
  const screenName = state.screen.name
  useEffect(
    () =>
      onAddPlaceRequest(() => {
        setPlaceName('')
        setPlaceType(screenName === 'object' ? 'room' : 'box')
        setHint(null)
        setActionError(null)
        setSheet('add-place')
      }),
    [screenName],
  )
  // Значок «Перенести это место» на экране места
  useEffect(
    () =>
      onMovePlaceRequest(() => {
        setHint(null)
        setActionError(null)
        setSheet('move-place')
      }),
    [],
  )

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
    const contents = state.contentsOf(placeId)
    const withContents = contents.places + contents.items > 0
    setBusy(true)
    setActionError(null)
    try {
      if (withContents) await state.removePlaceWithContents(placeId)
      else await state.removePlace(placeId)
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
    if (state.screen.name === 'home') {
      openSheet('add-object')
      return
    }
    if (state.screen.name === 'object' || state.screen.name === 'place') {
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

  // Только подходящие типы: в полку — не полку, в стеллаж — не стеллаж и т. д.
  const addParent = state.screen.name === 'place' ? state.findPlace(state.screen.placeId) : undefined
  const typeOptions =
    state.screen.name === 'object'
      ? PLACE_TYPES.filter((option) => option.value === 'room')
      : PLACE_TYPES.filter((option) => !addParent || canNest(addParent.type, option.value))

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
          <NavButton state={state} tab="scan" label="Сканер" target={{ name: 'scan' }}>
            <ScanIcon />
          </NavButton>
          <NavButton state={state} tab="search" label="Поиск" target={{ name: 'search' }}>
            <SearchIcon />
          </NavButton>
          <NavButton state={state} tab="more" label="Ещё" target={{ name: 'more' }}>
            <MoreIcon />
          </NavButton>
          {addEnabled ? (
            <button
              type="button"
              className="icon-btn"
              aria-label={state.screen.name === 'home' ? 'Добавить объект' : 'Добавить место или вещь'}
              onClick={onAdd}
            >
              +
            </button>
          ) : null}
          <button
            type="button"
            className="icon-btn"
            aria-label="Справка по экрану"
            title="Справка по экрану"
            onClick={() => openSheet('help')}
          >
            ?
          </button>
          <button type="button" className="icon-btn" aria-label="Действия и настройки" onClick={() => openSheet('menu')}>
            ···
          </button>
        </div>
      </header>

      {sheet === 'help' ? (
        <PageFrame title={hint ? 'Подсказка' : `Справка: ${help.title}`} onClose={closeSheet}>
          <div className="panel stack">
            <p className="help-text">{hint ?? help.body}</p>
          </div>
        </PageFrame>
      ) : null}

      {sheet === 'menu' ? (
        <PageFrame title="Действия и настройки" onClose={closeSheet}>
          <div className="panel stack">
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
          </div>
          <div className="panel stack">
            <AppMenuLinks state={state} onClose={closeSheet} />
          </div>
          <div className="panel stack">
            <DataExchange state={state} onDone={closeSheet} />
          </div>
        </PageFrame>
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

      {sheet === 'add-object' && state.screen.name === 'home' ? (
        <ObjectAppearanceSheet
          title="Новый объект"
          initialName=""
          initialIconId={newObjectDefaults.iconId}
          initialIconBg={newObjectDefaults.iconBg}
          confirmLabel="Создать"
          busy={busy}
          onClose={closeSheet}
          onSave={async ({ name, iconId, iconBg }) => {
            setBusy(true)
            try {
              const created = await state.createRootObject({ name, iconId, iconBg })
              closeSheet()
              await state.setActiveObject(created.objectKey)
              state.navigate({ name: 'object', objectKey: created.objectKey })
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
          <DeletePlaceText state={state} placeId={state.screen.placeId} />
          {actionError ? <p className="error">{actionError}</p> : null}
          <button type="button" className="danger" disabled={busy} onClick={() => void submitDeletePlace()}>
            Удалить
          </button>
          <button type="button" className="secondary" disabled={busy} onClick={closeSheet}>
            Отмена
          </button>
        </SheetFrame>
      ) : null}

      {sheet === 'add-choice' && parentIdForAdd() ? (
        <AddChoiceSheet
          placeId={parentIdForAdd()!}
          isObject={state.screen.name === 'object'}
          onClose={closeSheet}
          onAddPlace={() => {
            setPlaceName('')
            setPlaceType(state.screen.name === 'object' ? 'room' : 'box')
            openSheet('add-place')
          }}
          onAddItem={(placeId) => {
            closeSheet()
            state.navigate({ name: 'add-item', placeId })
          }}
          onImportList={(placeId) => {
            closeSheet()
            state.navigate({ name: 'import-list', placeId })
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
            <ChoiceSelect title="Тип места" value={placeType} options={typeOptions} onChange={setPlaceType} />
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
  isObject,
  onClose,
  onAddPlace,
  onAddItem,
  onImportList,
}: {
  placeId: string
  isObject: boolean
  onClose: () => void
  onAddPlace: () => void
  onAddItem: (placeId: string) => void
  onImportList: (placeId: string) => void
}) {
  return (
    <SheetFrame title="Добавить" onClose={onClose}>
      <button type="button" className="list-item" onClick={onAddPlace}>
        <strong>{isObject ? 'Помещение' : 'Место хранения'}</strong>
      </button>
      {isObject ? null : (
        <button type="button" className="list-item" onClick={() => onAddItem(placeId)}>
          <strong>Вещь</strong>
        </button>
      )}
      <button type="button" className="list-item" onClick={() => onImportList(placeId)}>
        <span>
          <strong>Импорт списка</strong>
          <span className="muted">Коробки и вещи из буфера или файла</span>
        </span>
      </button>
    </SheetFrame>
  )
}

function DeletePlaceText({ state, placeId }: { state: KeepItState; placeId: string }) {
  const place = state.findPlace(placeId)
  const name = place?.name ?? 'место'
  const contents = state.contentsOf(placeId)
  const empty = contents.places + contents.items === 0
  if (empty) return <p>Удалить пустое место «{name}»?</p>
  return (
    <p>
      Удалить «{name}» вместе со всем содержимым? Будет удалено вещей: {contents.items}
      {contents.places > 0 ? `, вложенных мест: ${contents.places}` : ''}. Это нельзя отменить — если что-то
      нужно сохранить, сначала перенесите это в другое место.
    </p>
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

/** Окно на весь экран, оформленное как обычный экран (например «Ещё»): «←», заголовок, панели */
function PageFrame({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="page-overlay" role="dialog" aria-modal aria-label={title}>
      <div className="app-shell">
        <header className="topbar">
          <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}>
            ←
          </button>
          <h1 className="topbar-title">
            <span>{title}</span>
          </h1>
        </header>
        <main className="app-main">
          <div className="stack screen-fill">{children}</div>
        </main>
      </div>
    </div>
  )
}

type Tab = 'scan' | 'search' | 'more'

function activeTab(screen: Screen): Tab | null {
  if (screen.name === 'scan') return 'scan'
  if (screen.name === 'search') return 'search'
  if (screen.name === 'more' || screen.name === 'print' || screen.name === 'lent') return 'more'
  return null
}

/** Основные разделы — значки в верхней строке (подпись — во всплывающей подсказке и для экранного диктора) */
function NavButton({
  state,
  tab,
  label,
  target,
  children,
}: {
  state: KeepItState
  tab: Tab
  label: string
  target: Screen
  children: ReactNode
}) {
  const active = activeTab(state.screen) === tab
  return (
    <button
      type="button"
      className={`icon-btn nav-btn${active ? ' active' : ''}`}
      aria-label={label}
      title={label}
      aria-current={active ? 'page' : undefined}
      onClick={() => state.navigate(target)}
    >
      {children}
    </button>
  )
}

/** Видоискатель с уголками и линией сканирования */
function ScanIcon() {
  return (
    <svg className="nav-svg" viewBox="0 0 24 24" aria-hidden>
      <path d="M4 9V6a2 2 0 0 1 2-2h3M15 4h3a2 2 0 0 1 2 2v3M20 15v3a2 2 0 0 1-2 2h-3M9 20H6a2 2 0 0 1-2-2v-3" />
      <path d="M7 12h10" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg className="nav-svg" viewBox="0 0 24 24" aria-hidden>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5" />
    </svg>
  )
}

/** «Ещё» — плитки разделов */
function MoreIcon() {
  return (
    <svg className="nav-svg" viewBox="0 0 24 24" aria-hidden>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </svg>
  )
}

/** Общие пункты меню «···» на любом экране */
function AppMenuLinks({ state, onClose }: { state: KeepItState; onClose: () => void }) {
  const dueCount = dueServiceItems(state.serviceItems()).length
  const links: Array<{ screen: Screen; title: string; hint: string; badge?: number }> = [
    { screen: { name: 'reminders' }, title: 'Напоминания', hint: 'Техническое обслуживание оборудования', badge: dueCount },
    { screen: { name: 'categories' }, title: 'Справочник категорий', hint: 'Категории и подкатегории' },
    { screen: { name: 'settings' }, title: 'Настройки', hint: 'Тема и уведомления' },
    { screen: { name: 'about' }, title: 'О программе', hint: 'Версия, обновления, разработчик' },
  ]
  return (
    <>
      {links
        .filter((link) => link.screen.name !== state.screen.name)
        .map((link) => (
          <button
            key={link.screen.name}
            type="button"
            className="list-item"
            onClick={() => {
              onClose()
              state.navigate(link.screen)
            }}
          >
            <span>
              <strong>{link.title}</strong>
              <span className="muted">{link.hint}</span>
            </span>
            {link.badge ? <span className="badge warn">{link.badge}</span> : null}
          </button>
        ))}
    </>
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

  if (screen.name === 'home' || screen.name === 'more') return null

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
              <strong>Перенести в другое место (с содержимым)</strong>
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
