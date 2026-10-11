import { useState } from 'react'
import { ObjectAppearanceSheet } from '../components/ObjectAppearanceSheet'
import { ObjectBadge } from '../components/ObjectBadge'
import { defaultObjectAppearance, rootObjects } from '../data/icons'
import type { KeepItState } from '../hooks/useKeepIt'
import type { ObjectKey } from '../types'

export function HomeScreen({ state }: { state: KeepItState }) {
  const roots = rootObjects(state.places)
  const [addOpen, setAddOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const defaults = defaultObjectAppearance('custom')

  async function openObject(objectKey: ObjectKey) {
    await state.setActiveObject(objectKey)
    state.navigate({ name: 'object', objectKey })
  }

  return (
    <div className="stack screen-fill home-screen">
      <p className="muted home-lead">Выберите объект хранения</p>
      <div className="section-grid">
        {roots.map((root) => {
          const active = state.settings?.activeObject === root.objectKey
          return (
            <button
              key={root.id}
              type="button"
              className={`section-card${active ? ' active' : ''}`}
              onClick={() => void openObject(root.objectKey)}
            >
              <ObjectBadge place={root} size="lg" />
              <span>{root.name}</span>
            </button>
          )
        })}
        <button type="button" className="section-card section-card-add" onClick={() => setAddOpen(true)}>
          <span className="object-badge object-badge-lg object-badge-add" aria-hidden>
            +
          </span>
          <span>Добавить объект</span>
        </button>
      </div>

      {addOpen ? (
        <ObjectAppearanceSheet
          title="Новый объект"
          initialName=""
          initialIconId={defaults.iconId}
          initialIconBg={defaults.iconBg}
          confirmLabel="Создать"
          busy={busy}
          onClose={() => setAddOpen(false)}
          onSave={async ({ name, iconId, iconBg }) => {
            setBusy(true)
            try {
              const created = await state.createRootObject({ name, iconId, iconBg })
              setAddOpen(false)
              await openObject(created.objectKey)
            } finally {
              setBusy(false)
            }
          }}
        />
      ) : null}
    </div>
  )
}
