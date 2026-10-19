import type { KeepItState } from '../hooks/useKeepIt'
export function MoreScreen({ state }: { state: KeepItState }) {
  const active = state.settings?.activeObject ?? 'dacha'
  const root = state.places.find((place) => place.type === 'object' && place.objectKey === active)
  const lentCount = state.lentItems().length
  const uncategorizedCount = state.uncategorizedItems().length
  const duplicateCount = state.duplicateGroups().length
  return (
    <div className="stack screen-fill">
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
          onClick={() => state.navigate({ name: 'duplicates' })}
        >
          <span>
            <strong>Поиск дублей</strong>
            <span className="muted">Одинаковые вещи в месте и на его полках — суммировать или удалить</span>
          </span>
          {duplicateCount > 0 ? <span className="badge warn">{duplicateCount}</span> : null}
        </button>
        <button
          type="button"
          className="list-item"
          onClick={() => state.navigate({ name: 'categorize' })}
        >
          <span>
            <strong>Разбор категорий</strong>
            <span className="muted">Вещи из импорта без категории</span>
          </span>
          {uncategorizedCount > 0 ? <span className="badge warn">{uncategorizedCount}</span> : null}
        </button>
        <button
          type="button"
          className="list-item"
          onClick={() => state.navigate({ name: 'print', placeId: state.recentPlaceId ?? root?.id })}
        >
          <span>
            <strong>Печать меток</strong>
            <span className="muted">QR-метки на принтер или в PDF</span>
          </span>
        </button>
      </div>
    </div>
  )
}
