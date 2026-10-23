import { useState } from 'react'
import type { KeepItState } from '../hooks/useKeepIt'
import type { CodeTarget } from '../data/repository'

function codeLabel(key: string): string {
  if (key.startsWith('place:')) return 'Метка KeepIt (бывшая свободная метка или метка удалённого места)'
  if (key.startsWith('item:')) return 'Метка KeepIt удалённой вещи'
  return key.length > 60 ? `${key.slice(0, 60)}…` : key
}

/** Присвоенные вещи или месту коды: их скан открывает её; можно отвязать. */
export function AssignedCodes({ state, target, codes }: { state: KeepItState; target: CodeTarget; codes?: string[] }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!codes?.length) return null

  return (
    <div className="stack-tight assigned-codes">
      <button type="button" className="ghost assigned-codes-toggle" onClick={() => setOpen((value) => !value)}>
        Присвоенные коды: {codes.length} {open ? '▴' : '▾'}
      </button>
      {open ? (
        <div className="list">
          {codes.map((key) => (
            <div key={key} className="row gather-picked">
              <span className="grow">{codeLabel(key)}</span>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  if (!window.confirm('Отвязать этот код? Его скан больше не будет открывать это.')) return
                  setError(null)
                  void state.unassignCode(target, key).catch((err: unknown) => {
                    setError(err instanceof Error ? err.message : 'Не удалось отвязать')
                  })
                }}
              >
                Отвязать
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
    </div>
  )
}
