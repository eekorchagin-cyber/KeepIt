import type { AccountingMode, UnitCode } from '../../types'
import { modeForQuantity, parseQuantity } from './quantity'

/** Первое слово абзаца, с которого начинается описание коробки. */
export const BOX_WORDS = ['короб', 'коробка']

export type DraftItem = {
  name: string
  quantity: number
  unit: UnitCode
  mode: AccountingMode
  raw: string
  warning?: string
}

export type DraftBlock =
  | { kind: 'box'; name: string; items: DraftItem[] }
  | { kind: 'items'; items: DraftItem[] }

const ITEM_SEPARATOR = /(?<=[\p{L}\p{N}])\.+\s+/u

export function normalizeName(value: string): string {
  return value.toLowerCase().replaceAll('ё', 'е').replace(/\s+/g, ' ').trim()
}

/** Похожие названия: совпадают после нормализации или одно содержит другое (от 4 символов). */
export function similarNames(left: string, right: string): boolean {
  const a = normalizeName(left.replace(/\([^)]*\)/g, ' '))
  const b = normalizeName(right.replace(/\([^)]*\)/g, ' '))
  if (!a || !b) return false
  if (a === b) return true
  if (a.length < 4 || b.length < 4) return false
  return a.includes(b) || b.includes(a)
}

/** Отбрасывает отметку [x]/[ ] и все символы до первой буквы, хвостовую пунктуацию. */
function cleanSegment(segment: string): string {
  return segment
    .replace(/^[^\p{L}[]*\[[ xXхХ✓✗]?\]\s*/u, '')
    .replace(/^[^\p{L}]+/u, '')
    .replace(/[\s.;,]+$/u, '')
    .trim()
}

function splitSegments(paragraph: string): string[] {
  return paragraph
    .split('\n')
    .flatMap((line) => line.split(ITEM_SEPARATOR))
    .map(cleanSegment)
    .filter(Boolean)
}

function parseItem(segment: string): DraftItem | null {
  const colon = segment.indexOf(':')
  const name = (colon >= 0 ? segment.slice(0, colon) : segment).replace(/[\s.;,]+$/u, '').trim()
  if (!name) return null
  const parsed = parseQuantity(colon >= 0 ? segment.slice(colon + 1) : '')
  return {
    name,
    quantity: parsed.quantity,
    unit: parsed.unit,
    mode: modeForQuantity(parsed.quantity, parsed.unit),
    raw: segment,
    warning: parsed.warning,
  }
}

/** Одинаковые названия с одной единицей внутри абзаца складываем. */
function mergeSame(items: DraftItem[]): DraftItem[] {
  const result: DraftItem[] = []
  for (const item of items) {
    const twin = result.find(
      (entry) => entry.unit === item.unit && normalizeName(entry.name) === normalizeName(item.name),
    )
    if (twin) {
      twin.quantity += item.quantity
      twin.mode = modeForQuantity(twin.quantity, twin.unit)
    } else {
      result.push({ ...item })
    }
  }
  return result
}

function isBoxHeader(segment: string): boolean {
  const firstWord = /^\p{L}+/u.exec(segment)?.[0]
  if (!firstWord || !BOX_WORDS.includes(normalizeName(firstWord))) return false
  return !segment.includes(':')
}

export function parseParagraph(paragraph: string): DraftBlock | null {
  const segments = splitSegments(paragraph)
  if (segments.length === 0) return null
  const [first, ...rest] = segments
  if (first && isBoxHeader(first)) {
    const items = rest.map(parseItem).filter((item): item is DraftItem => item !== null)
    return { kind: 'box', name: first, items: mergeSame(items) }
  }
  const items = segments.map(parseItem).filter((item): item is DraftItem => item !== null)
  return items.length > 0 ? { kind: 'items', items: mergeSame(items) } : null
}

export function splitParagraphs(text: string): string[] {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
}

/** Текст списка → упорядоченные блоки: коробки с содержимым и отдельные вещи. */
export function parseInventoryText(text: string): DraftBlock[] {
  return splitParagraphs(text)
    .map(parseParagraph)
    .filter((block): block is DraftBlock => block !== null)
}

/** Переключатель «Это коробка / Это вещи» в предпросмотре. */
export function toggleBlockKind(block: DraftBlock): DraftBlock {
  if (block.kind === 'box') {
    const header = parseItem(block.name)
    return { kind: 'items', items: header ? [header, ...block.items] : block.items }
  }
  const [first, ...rest] = block.items
  if (!first) return block
  return { kind: 'box', name: first.name, items: rest }
}
