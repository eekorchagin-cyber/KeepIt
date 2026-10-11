import type { KeepItState } from '../hooks/useKeepIt'
import type { Screen } from '../types'

type Tab = 'home' | 'scan' | 'search' | 'more'

function activeTab(screen: Screen): Tab {
  if (screen.name === 'scan') return 'scan'
  if (screen.name === 'search') return 'search'
  if (screen.name === 'more' || screen.name === 'settings' || screen.name === 'print') return 'more'
  return 'home'
}

export function BottomNav({ state }: { state: KeepItState }) {
  if (state.screen.name === 'print') return null

  const tab = activeTab(state.screen)

  return (
    <nav className="bottom-nav" aria-label="Основные разделы">
      <button
        type="button"
        className={tab === 'home' ? 'active' : ''}
        onClick={() => state.jump({ name: 'home' })}
      >
        <img src="./icons/app-192.png" alt="" />
        <span>Разделы</span>
      </button>
      <button
        type="button"
        className={tab === 'scan' ? 'active' : ''}
        onClick={() => state.jump({ name: 'scan' })}
      >
        <span className="nav-glyph nav-scan" aria-hidden />
        <span>Сканер</span>
      </button>
      <button
        type="button"
        className={tab === 'search' ? 'active' : ''}
        onClick={() => state.jump({ name: 'search' })}
      >
        <span className="nav-glyph nav-search" aria-hidden />
        <span>Поиск</span>
      </button>
      <button
        type="button"
        className={tab === 'more' ? 'active' : ''}
        onClick={() => state.jump({ name: 'more' })}
      >
        <span className="nav-glyph nav-more" aria-hidden />
        <span>Ещё</span>
      </button>
    </nav>
  )
}
