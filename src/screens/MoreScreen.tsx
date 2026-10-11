import type { KeepItState } from '../hooks/useKeepIt'
import { objectLabelFromPlaces } from '../data/icons'

export function MoreScreen({ state }: { state: KeepItState }) {
  const active = state.settings?.activeObject ?? 'dacha'
  const root = state.places.find((place) => place.type === 'object' && place.objectKey === active)
  const lentCount = state.lentItems().length
  const activeLabel = objectLabelFromPlaces(active, state.places)

  return (
    <div className="stack screen-fill">
      <div className="panel stack">
        <strong>Ещё</strong>
        <p className="muted">
          Активный объект: {activeLabel}. Данные хранятся на этом устройстве.
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
    </div>
  )
}
