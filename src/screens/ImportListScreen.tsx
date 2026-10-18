import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeepItState } from '../hooks/useKeepIt'
import { readFileAsText } from '../data/backup'
import { newId } from '../data/ids'
import {
  normalizeName,
  parseInventoryText,
  similarNames,
  toggleBlockKind,
  type DraftBlock,
  type DraftItem,
} from '../data/listImport/parseList'
import { modeForQuantity } from '../data/listImport/quantity'
import { ProgressPanel } from '../components/ProgressPanel'
import type { ImportPlan, ImportProgress, ImportResult } from '../data/repository'
import { UNIT_OPTIONS, formatQty } from '../data/units'
import type { Item, Place, UnitCode } from '../types'

type RowItem = DraftItem & { id: string; enabled: boolean; qtyText: string }
type RowBlock = { id: string; kind: 'box' | 'items'; name: string; items: RowItem[] }

type ItemChoice = 'skip' | 'sum' | 'separate'

type Conflict =
  | { kind: 'box'; blockId: string; incoming: string; existing: Place }
  | { kind: 'item'; itemId: string; incoming: RowItem; existing: Item }

type Phase = 'choose' | 'paste' | 'preview' | 'conflicts' | 'saving' | 'done'

const CLIPBOARD_TIMEOUT_MS = 1500

const PLACEHOLDER =
  'Дровокол: одна штука. Топор: одна штука. Струбцина большая: две штуки.\n\nКоробка с электрикой. Удлинитель: две штуки. Набор отвёрток: один комплект.'

function toRows(blocks: DraftBlock[]): RowBlock[] {
  return blocks.map((block) => ({
    id: newId(),
    kind: block.kind,
    name: block.kind === 'box' ? block.name : '',
    items: block.items.map(toRowItem),
  }))
}

function toRowItem(item: DraftItem): RowItem {
  return { ...item, id: newId(), enabled: true, qtyText: String(item.quantity) }
}

function rowQuantity(row: RowItem): number {
  const value = Number(row.qtyText.replace(',', '.'))
  return Number.isFinite(value) && value > 0 ? value : 0
}

function rowDraft(row: RowItem): DraftItem {
  const quantity = rowQuantity(row)
  return {
    name: row.name.trim(),
    quantity,
    unit: row.unit,
    mode: modeForQuantity(quantity, row.unit),
    raw: row.raw,
    warning: row.warning,
  }
}

function rowValid(row: RowItem): boolean {
  return row.enabled && row.name.trim() !== '' && rowQuantity(row) > 0
}

export function ImportListScreen({ state, placeId }: { state: KeepItState; placeId: string }) {
  const place = state.findPlace(placeId)
  const fileRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>('choose')
  const [text, setText] = useState('')
  const [clipboardHint, setClipboardHint] = useState<string | null>(null)
  const [blocks, setBlocks] = useState<RowBlock[]>([])
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const [conflictIndex, setConflictIndex] = useState(0)
  const [boxChoice, setBoxChoice] = useState<Record<string, string | null>>({})
  const [itemChoice, setItemChoice] = useState<Record<string, { choice: ItemChoice; existingId: string }>>({})
  const [applyToAll, setApplyToAll] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [progress, setProgress] = useState<ImportProgress>({ done: 0, total: 0 })
  const [startedAt, setStartedAt] = useState(0)

  const pastePreview = useMemo(() => parseInventoryText(text), [text])

  useEffect(() => {
    if (phase !== 'paste') return
    let cancelled = false
    void (async () => {
      try {
        // Некоторые браузеры (встроенные WebView) не отвечают на запрос доступа к буферу
        const value = await Promise.race([
          navigator.clipboard.readText(),
          new Promise<string>((_, reject) =>
            window.setTimeout(() => reject(new Error('clipboard timeout')), CLIPBOARD_TIMEOUT_MS),
          ),
        ])
        if (cancelled) return
        if (!value.trim()) {
          setClipboardHint('Буфер пуст. Вставьте список сюда (удерживайте поле → Вставить).')
          return
        }
        setText((current) => (current.trim() ? current : value))
        setClipboardHint('Текст из буфера подставлен. Проверьте и нажмите «Разобрать».')
      } catch {
        if (!cancelled) {
          setClipboardHint('Вставьте список сюда (удерживайте поле → Вставить) и нажмите «Разобрать».')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [phase])

  if (!place) {
    return (
      <div className="panel">
        <p>Место не найдено</p>
      </div>
    )
  }

  const counts = blocks.reduce(
    (acc, block) => {
      const valid = block.items.filter(rowValid).length
      if (block.kind === 'box' && block.name.trim()) acc.boxes += 1
      acc.items += valid
      return acc
    },
    { boxes: 0, items: 0 },
  )

  function startPreview(source: string) {
    const parsed = parseInventoryText(source)
    if (parsed.length === 0) {
      setError('Не нашли ни одной вещи. Проверьте, что в тексте есть названия.')
      return
    }
    setError(null)
    setBlocks(toRows(parsed))
    setPhase('preview')
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    try {
      const value = await readFileAsText(file)
      setText(value)
      startPreview(value)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось прочитать файл')
    }
  }

  function updateBlock(blockId: string, patch: (block: RowBlock) => RowBlock) {
    setBlocks((current) => current.map((block) => (block.id === blockId ? patch(block) : block)))
  }

  function updateItem(blockId: string, itemId: string, patch: Partial<RowItem>) {
    updateBlock(blockId, (block) => ({
      ...block,
      items: block.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
    }))
  }

  function toggleKind(block: RowBlock) {
    const draft: DraftBlock =
      block.kind === 'box'
        ? { kind: 'box', name: block.name, items: block.items.map(rowDraft) }
        : { kind: 'items', items: block.items.map(rowDraft) }
    const next = toggleBlockKind(draft)
    updateBlock(block.id, () => ({
      id: block.id,
      kind: next.kind,
      name: next.kind === 'box' ? next.name : '',
      items: next.items.map(toRowItem),
    }))
  }

  function existingChildBox(name: string): Place | undefined {
    const key = normalizeName(name)
    return state.childPlaces(placeId).find((child) => normalizeName(child.name) === key)
  }

  function itemConflictsFor(boxes: Record<string, string | null>): Conflict[] {
    const found: Conflict[] = []
    for (const block of blocks) {
      let targetId: string | null = placeId
      if (block.kind === 'box') targetId = boxes[block.id] ?? null
      if (!targetId) continue
      const existingItems = state.itemsInPlace(targetId)
      for (const row of block.items.filter(rowValid)) {
        const existing = existingItems.find((item) => similarNames(item.name, row.name))
        if (existing) found.push({ kind: 'item', itemId: row.id, incoming: row, existing })
      }
    }
    return found
  }

  function goToConflicts() {
    const boxConflicts: Conflict[] = []
    for (const block of blocks) {
      if (block.kind !== 'box' || !block.name.trim()) continue
      const existing = existingChildBox(block.name)
      if (existing) {
        boxConflicts.push({ kind: 'box', blockId: block.id, incoming: block.name, existing })
      }
    }
    setBoxChoice({})
    setItemChoice({})
    setApplyToAll(false)
    if (boxConflicts.length > 0) {
      setConflicts(boxConflicts)
      setConflictIndex(0)
      setPhase('conflicts')
      return
    }
    const items = itemConflictsFor({})
    if (items.length > 0) {
      setConflicts(items)
      setConflictIndex(0)
      setPhase('conflicts')
      return
    }
    void save({}, {})
  }

  function resolveBox(conflict: Extract<Conflict, { kind: 'box' }>, useExisting: boolean) {
    const nextBoxes = { ...boxChoice, [conflict.blockId]: useExisting ? conflict.existing.id : null }
    setBoxChoice(nextBoxes)
    const nextIndex = conflictIndex + 1
    if (nextIndex < conflicts.length) {
      setConflictIndex(nextIndex)
      return
    }
    const items = itemConflictsFor(nextBoxes)
    if (items.length > 0) {
      setConflicts(items)
      setConflictIndex(0)
      return
    }
    void save(nextBoxes, itemChoice)
  }

  function resolveItem(choice: ItemChoice) {
    const nextChoices = { ...itemChoice }
    const targets = applyToAll ? conflicts.slice(conflictIndex) : [conflicts[conflictIndex]!]
    for (const target of targets) {
      if (target.kind !== 'item') continue
      const allowed = choice === 'sum' && target.existing.unit !== target.incoming.unit ? 'separate' : choice
      nextChoices[target.itemId] = { choice: allowed, existingId: target.existing.id }
    }
    setItemChoice(nextChoices)
    const nextIndex = applyToAll ? conflicts.length : conflictIndex + 1
    if (nextIndex < conflicts.length) {
      setConflictIndex(nextIndex)
      return
    }
    void save(boxChoice, nextChoices)
  }

  async function save(
    boxes: Record<string, string | null>,
    choices: Record<string, { choice: ItemChoice; existingId: string }>,
  ) {
    const plan: ImportPlan = { boxes: [], items: [] }
    for (const block of blocks) {
      let boxKey: string | null = null
      if (block.kind === 'box' && block.name.trim()) {
        boxKey = block.id
        plan.boxes.push({ key: block.id, name: block.name.trim(), existingPlaceId: boxes[block.id] ?? null })
      }
      for (const row of block.items.filter(rowValid)) {
        const decision = choices[row.id]
        if (decision?.choice === 'skip') continue
        plan.items.push({
          boxKey,
          draft: rowDraft(row),
          mergeIntoId: decision?.choice === 'sum' ? decision.existingId : null,
        })
      }
    }
    setBusy(true)
    setError(null)
    setProgress({ done: 0, total: 0 })
    setStartedAt(performance.now())
    setPhase('saving')
    try {
      const saved = await state.importList(placeId, plan, setProgress)
      setResult(saved)
      setPhase('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось импортировать')
      setPhase('preview')
    } finally {
      setBusy(false)
    }
  }

  if (phase === 'saving') {
    return (
      <div className="stack">
        <ProgressPanel
          title={`Импорт в «${place.name}»`}
          done={progress.done}
          total={progress.total}
          startedAt={startedAt}
          finishing={progress.total > 0 && progress.done >= progress.total}
        />
      </div>
    )
  }

  if (phase === 'done' && result) {
    const pending = state.uncategorizedItems(placeId).length
    return (
      <div className="stack">
        <div className="panel stack">
          <strong>Импорт завершён</strong>
          <p>
            Создано коробок: {result.boxesCreated}. Добавлено вещей: {result.itemsCreated}
            {result.itemsMerged > 0 ? `. Сложено с имеющимися: ${result.itemsMerged}` : ''}.
          </p>
          <p className="muted">
            Названия добавлены в справочник. Следующий шаг — присвоить новым вещам категории: подсказки
            уже подготовлены.
          </p>
          {pending > 0 ? (
            <button type="button" onClick={() => state.jump({ name: 'categorize', placeId })}>
              Присвоить категории ({pending})
            </button>
          ) : null}
          <button type="button" className="secondary" onClick={() => state.jump({ name: 'place', placeId })}>
            Вернуться к месту «{place.name}»
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'conflicts' && conflicts[conflictIndex]) {
    const conflict = conflicts[conflictIndex]!
    const step = `${conflictIndex + 1} из ${conflicts.length}`
    if (conflict.kind === 'box') {
      return (
        <div className="stack">
          <div className="panel stack">
            <strong>Такая коробка уже есть · {step}</strong>
            <p>
              В месте «{place.name}» уже есть «{conflict.existing.name}». В списке — «{conflict.incoming}».
            </p>
            <button type="button" disabled={busy} onClick={() => resolveBox(conflict, true)}>
              Положить вещи в имеющуюся
            </button>
            <button type="button" className="secondary" disabled={busy} onClick={() => resolveBox(conflict, false)}>
              Создать новую коробку
            </button>
            <button type="button" className="ghost" disabled={busy} onClick={() => setPhase('preview')}>
              ← Назад к списку
            </button>
          </div>
        </div>
      )
    }
    const sameUnit = conflict.existing.unit === conflict.incoming.unit
    return (
      <div className="stack">
        <div className="panel stack">
          <strong>Похожая вещь · {step}</strong>
          <p>
            Уже есть «{conflict.existing.name}» ({formatQty(conflict.existing.quantity, conflict.existing.unit)}).
            В списке — «{conflict.incoming.name}» ({formatQty(rowQuantity(conflict.incoming), conflict.incoming.unit)}).
          </p>
          <button type="button" className="secondary" disabled={busy} onClick={() => resolveItem('skip')}>
            Оставить имеющуюся
          </button>
          <button type="button" disabled={busy || !sameUnit} onClick={() => resolveItem('sum')}>
            Сложить количество
          </button>
          {!sameUnit ? <p className="muted">Сложить нельзя: разные единицы измерения.</p> : null}
          <button type="button" className="secondary" disabled={busy} onClick={() => resolveItem('separate')}>
            Добавить отдельно
          </button>
          {conflicts.length - conflictIndex > 1 ? (
            <label className="row">
              <input type="checkbox" checked={applyToAll} onChange={(e) => setApplyToAll(e.target.checked)} />
              <span>Применить ко всем остальным совпадениям ({conflicts.length - conflictIndex - 1})</span>
            </label>
          ) : null}
          <button type="button" className="ghost" disabled={busy} onClick={() => setPhase('preview')}>
            ← Назад к списку
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'preview') {
    return (
      <div className="stack">
        <div className="panel stack">
          <strong>Проверьте список</strong>
          <p className="muted">
            Место: {place.name}. Снимите галочку, чтобы не добавлять строку. Название и количество можно
            исправить. Неверно распознанный абзац можно переключить «коробка / отдельные вещи» или
            убрать целиком.
          </p>
        </div>

        {blocks.map((block) => (
          <div key={block.id} className={`panel import-block${block.kind === 'box' ? ' box' : ''}`}>
            {block.kind === 'box' ? (
              <label className="field">
                Коробка (новое место внутри «{place.name}»)
                <input
                  value={block.name}
                  onChange={(e) => updateBlock(block.id, (current) => ({ ...current, name: e.target.value }))}
                />
              </label>
            ) : (
              <strong>Отдельные вещи в «{place.name}»</strong>
            )}
            <div className="chip-row">
              <button type="button" className="suggest-chip neutral" onClick={() => toggleKind(block)}>
                {block.kind === 'box' ? 'Это не коробка' : 'Сделать коробкой'}
              </button>
              <button
                type="button"
                className="suggest-chip danger"
                onClick={() => setBlocks((current) => current.filter((entry) => entry.id !== block.id))}
              >
                {block.kind === 'box' ? 'Убрать коробку со всем содержимым' : 'Убрать весь абзац'}
              </button>
            </div>
            {block.items.length === 0 ? <p className="muted">Пустая коробка</p> : null}
            {block.items.map((item) => (
              <div key={item.id} className={`import-row${item.enabled ? '' : ' off'}`}>
                <input
                  type="checkbox"
                  checked={item.enabled}
                  aria-label="Добавлять"
                  onChange={(e) => updateItem(block.id, item.id, { enabled: e.target.checked })}
                />
                <input
                  value={item.name}
                  aria-label="Название"
                  onChange={(e) => updateItem(block.id, item.id, { name: e.target.value })}
                />
                <input
                  value={item.qtyText}
                  aria-label="Количество"
                  inputMode="decimal"
                  onChange={(e) => updateItem(block.id, item.id, { qtyText: e.target.value })}
                />
                <select
                  value={item.unit}
                  aria-label="Единица"
                  onChange={(e) => updateItem(block.id, item.id, { unit: e.target.value as UnitCode })}
                >
                  {UNIT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {item.warning ? <span className="import-warning">Не распознано — {item.warning}</span> : null}
              </div>
            ))}
          </div>
        ))}

        <button type="button" className="secondary" disabled={busy} onClick={() => setPhase('choose')}>
          Другой текст
        </button>

        <div className="panel stack sticky-actions">
          {error ? <p className="error">{error}</p> : null}
          <div className="row">
            <span className="grow muted">
              Коробок: {counts.boxes} · вещей: {counts.items}
            </span>
            <button type="button" disabled={busy || counts.items + counts.boxes === 0} onClick={goToConflicts}>
              Импортировать
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'paste') {
    return (
      <div className="stack">
        <div className="panel stack">
          <strong>Из буфера</strong>
          <p className="muted">
            {clipboardHint ?? 'Вставьте список. Абзац со слова «Коробка» — коробка с содержимым, остальные — отдельные вещи.'}
          </p>
          <label className="field">
            Текст списка
            <textarea
              className="import-textarea"
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setError(null)
              }}
              placeholder={PLACEHOLDER}
            />
          </label>
          {pastePreview.length > 0 ? (
            <p className="muted">
              Найдено: коробок — {pastePreview.filter((block) => block.kind === 'box').length}, вещей —{' '}
              {pastePreview.reduce((sum, block) => sum + block.items.length, 0)}
            </p>
          ) : null}
          {error ? <p className="error">{error}</p> : null}
          <button type="button" disabled={pastePreview.length === 0} onClick={() => startPreview(text)}>
            Разобрать
          </button>
          <button type="button" className="secondary" onClick={() => setPhase('choose')}>
            Назад
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="panel stack">
        <strong>Импорт списка в «{place.name}»</strong>
        <p className="muted">
          Абзац, начинающийся со слов «Короб» или «Коробка», станет коробкой: первое предложение — её
          название, дальше вещи внутри. Остальные абзацы — отдельные вещи в этом месте. Вещи разделяются
          точкой, количество — после двоеточия, числом или словом.
        </p>
        <p className="muted" style={{ whiteSpace: 'pre-line' }}>
          Пример:{'\n'}
          {PLACEHOLDER}
        </p>
        <div className="hero-actions">
          <button
            type="button"
            onClick={() => {
              setError(null)
              setClipboardHint(null)
              setText('')
              setPhase('paste')
            }}
          >
            Из буфера
          </button>
          <button type="button" className="secondary" onClick={() => fileRef.current?.click()}>
            Из файла
          </button>
        </div>
        <input
          ref={fileRef}
          className="file-input-hidden"
          type="file"
          accept=".txt,.md,.text,text/plain"
          onChange={(event) => {
            void onFile(event.target.files?.[0])
            event.target.value = ''
          }}
        />
        {error ? <p className="error">{error}</p> : null}
      </div>
    </div>
  )
}
