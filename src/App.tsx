import { BottomNav } from './components/BottomNav'
import { TopBar } from './components/TopBar'
import { useKeepIt } from './hooks/useKeepIt'
import { AddItemScreen } from './screens/AddItemScreen'
import { EditItemScreen } from './screens/EditItemScreen'
import { HomeScreen } from './screens/HomeScreen'
import { ItemScreen } from './screens/ItemScreen'
import { LentItemsScreen } from './screens/LentItemsScreen'
import { MoreScreen } from './screens/MoreScreen'
import { ObjectScreen } from './screens/ObjectScreen'
import { PlaceScreen } from './screens/PlaceScreen'
import { PrintLabelsScreen } from './screens/PrintLabelsScreen'
import { ScanScreen } from './screens/ScanScreen'
import { SearchScreen } from './screens/SearchScreen'
import { SettingsScreen } from './screens/SettingsScreen'

export default function App() {
  const state = useKeepIt()

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

      <main className="app-main">
        {state.error ? <p className="error">{state.error}</p> : null}

        {state.screen.name === 'home' ? <HomeScreen state={state} /> : null}
        {state.screen.name === 'object' ? (
          <ObjectScreen state={state} objectKey={state.screen.objectKey} />
        ) : null}
        {state.screen.name === 'place' ? <PlaceScreen state={state} placeId={state.screen.placeId} /> : null}
        {state.screen.name === 'add-item' ? <AddItemScreen state={state} placeId={state.screen.placeId} /> : null}
        {state.screen.name === 'item' ? <ItemScreen state={state} itemId={state.screen.itemId} /> : null}
        {state.screen.name === 'edit-item' ? (
          <EditItemScreen state={state} itemId={state.screen.itemId} />
        ) : null}
        {state.screen.name === 'scan' ? <ScanScreen state={state} /> : null}
        {state.screen.name === 'search' ? <SearchScreen state={state} /> : null}
        {state.screen.name === 'print' ? <PrintLabelsScreen state={state} placeId={state.screen.placeId} /> : null}
        {state.screen.name === 'settings' ? <SettingsScreen state={state} /> : null}
        {state.screen.name === 'lent' ? <LentItemsScreen state={state} /> : null}
        {state.screen.name === 'more' ? <MoreScreen state={state} /> : null}
      </main>

      <BottomNav state={state} />
    </div>
  )
}
