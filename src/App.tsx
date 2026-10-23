import { useLayoutEffect, useRef, type CSSProperties } from 'react'
import { TopBar } from './components/TopBar'
import { UpdateBanner } from './components/UpdateBanner'
import { useAppUpdate } from './hooks/useAppUpdate'
import { useKeepIt } from './hooks/useKeepIt'
import { useLongPressHints, type LongPressHint } from './hooks/useLongPressHints'
import { useServiceReminders } from './hooks/useServiceReminders'
import { AboutScreen } from './screens/AboutScreen'
import { AddItemScreen } from './screens/AddItemScreen'
import { AssignCodeScreen } from './screens/AssignCodeScreen'
import { CategoriesScreen } from './screens/CategoriesScreen'
import { CategorizeScreen } from './screens/CategorizeScreen'
import { ImportListScreen } from './screens/ImportListScreen'
import { DuplicatesScreen } from './screens/DuplicatesScreen'
import { EditItemScreen } from './screens/EditItemScreen'
import { GatherItemsScreen } from './screens/GatherItemsScreen'
import { HomeScreen } from './screens/HomeScreen'
import { InventoryScreen } from './screens/InventoryScreen'
import { ItemScreen } from './screens/ItemScreen'
import { LentItemsScreen } from './screens/LentItemsScreen'
import { MoreScreen } from './screens/MoreScreen'
import { ObjectScreen } from './screens/ObjectScreen'
import { PlaceScreen } from './screens/PlaceScreen'
import { PrintLabelsScreen } from './screens/PrintLabelsScreen'
import { ReleaseHistoryScreen } from './screens/ReleaseHistoryScreen'
import { RemindersScreen } from './screens/RemindersScreen'
import { ScanScreen } from './screens/ScanScreen'
import { SearchScreen } from './screens/SearchScreen'
import { SettingsScreen } from './screens/SettingsScreen'

/** Подсказка при долгом нажатии: у края экрана плашка сдвигается внутрь, уголок остаётся над значком */
function PressHint({ hint }: { hint: LongPressHint }) {
  const half = 118
  const left = Math.min(Math.max(hint.x, half), window.innerWidth - half)
  return (
    <span
      className={`press-hint${hint.below ? '' : ' above'}`}
      role="tooltip"
      style={{ left, top: hint.y, '--arrow-shift': `${hint.x - left}px` } as CSSProperties}
    >
      {hint.text}
    </span>
  )
}

/** Прокрутка каждого экрана — чтобы вернуть её при «←» */
const scrollByScreen = new Map<string, number>()

export default function App() {
  const state = useKeepIt()
  const update = useAppUpdate()
  useServiceReminders(state)
  const mainRef = useRef<HTMLElement | null>(null)
  const screenKey = JSON.stringify(state.screen)
  const { cameBack } = state
  const hint = useLongPressHints()

  // Новый экран — с верхней строки; при возврате «←» — там, где был
  useLayoutEffect(() => {
    const main = mainRef.current
    if (!main) return
    main.scrollTop = cameBack ? (scrollByScreen.get(screenKey) ?? 0) : 0
  }, [screenKey, cameBack])

  if (state.loading || !state.settings) {
    return (
      <div className="app-shell">
        <div className="panel">Загрузка KeepIt…</div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <TopBar state={state} />

      <main
        className="app-main"
        ref={mainRef}
        onScroll={(event) => scrollByScreen.set(screenKey, event.currentTarget.scrollTop)}
      >
        <UpdateBanner update={update} onShowHistory={() => state.navigate({ name: 'releases' })} />
        {state.error ? <p className="error">{state.error}</p> : null}

        {state.screen.name === 'home' ? <HomeScreen state={state} /> : null}
        {state.screen.name === 'object' ? (
          <ObjectScreen state={state} objectKey={state.screen.objectKey} />
        ) : null}
        {state.screen.name === 'place' ? <PlaceScreen state={state} placeId={state.screen.placeId} /> : null}
        {state.screen.name === 'add-item' ? (
          <AddItemScreen
            key={state.screen.code ?? 'plain'}
            state={state}
            placeId={state.screen.placeId}
            code={state.screen.code}
          />
        ) : null}
        {state.screen.name === 'import-list' ? (
          <ImportListScreen state={state} placeId={state.screen.placeId} />
        ) : null}
        {state.screen.name === 'reminders' ? <RemindersScreen state={state} /> : null}
        {state.screen.name === 'duplicates' ? (
          <DuplicatesScreen state={state} placeId={state.screen.placeId} />
        ) : null}
        {state.screen.name === 'inventory' ? (
          <InventoryScreen key={state.screen.placeId} state={state} screen={state.screen} />
        ) : null}
        {state.screen.name === 'gather-items' ? (
          <GatherItemsScreen state={state} placeId={state.screen.placeId} />
        ) : null}
        {state.screen.name === 'categorize' ? (
          <CategorizeScreen state={state} placeId={state.screen.placeId} />
        ) : null}
        {state.screen.name === 'item' ? <ItemScreen state={state} itemId={state.screen.itemId} /> : null}
        {state.screen.name === 'edit-item' ? (
          <EditItemScreen state={state} itemId={state.screen.itemId} />
        ) : null}
        {state.screen.name === 'scan' ? <ScanScreen state={state} /> : null}
        {state.screen.name === 'search' ? <SearchScreen state={state} /> : null}
        {state.screen.name === 'print' ? <PrintLabelsScreen state={state} placeId={state.screen.placeId} /> : null}
        {state.screen.name === 'settings' ? <SettingsScreen state={state} /> : null}
        {state.screen.name === 'about' ? (
          <AboutScreen update={update} onShowHistory={() => state.navigate({ name: 'releases' })} />
        ) : null}
        {state.screen.name === 'releases' ? <ReleaseHistoryScreen /> : null}
        {state.screen.name === 'assign-code' ? (
          <AssignCodeScreen key={state.screen.code} state={state} code={state.screen.code} />
        ) : null}
        {state.screen.name === 'lent' ? <LentItemsScreen state={state} /> : null}
        {state.screen.name === 'categories' ? <CategoriesScreen state={state} /> : null}
        {state.screen.name === 'more' ? <MoreScreen state={state} /> : null}
      </main>

      {hint ? <PressHint hint={hint} /> : null}
    </div>
  )
}
