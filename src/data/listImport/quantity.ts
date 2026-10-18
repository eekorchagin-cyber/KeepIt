import type { AccountingMode, UnitCode } from '../../types'
import { isCountableUnit } from '../units'

const NUMBER_WORDS: Record<string, number> = {
  ноль: 0,
  один: 1,
  одна: 1,
  одно: 1,
  одну: 1,
  одной: 1,
  одного: 1,
  два: 2,
  две: 2,
  двух: 2,
  три: 3,
  трех: 3,
  четыре: 4,
  четырех: 4,
  пять: 5,
  шесть: 6,
  семь: 7,
  восемь: 8,
  девять: 9,
  десять: 10,
  одиннадцать: 11,
  двенадцать: 12,
  тринадцать: 13,
  четырнадцать: 14,
  пятнадцать: 15,
  шестнадцать: 16,
  семнадцать: 17,
  восемнадцать: 18,
  девятнадцать: 19,
  двадцать: 20,
  тридцать: 30,
  сорок: 40,
  пятьдесят: 50,
  шестьдесят: 60,
  семьдесят: 70,
  восемьдесят: 80,
  девяносто: 90,
  сто: 100,
  двести: 200,
  триста: 300,
  четыреста: 400,
  пятьсот: 500,
  шестьсот: 600,
  семьсот: 700,
  восемьсот: 800,
  девятьсот: 900,
  полтора: 1.5,
  полторы: 1.5,
  половина: 0.5,
}

const UNIT_PATTERNS: Array<{ unit: UnitCode; pattern: RegExp }> = [
  { unit: 'pcs', pattern: /^(шт|штук[аи]?|штучк[аи]|штучек)$/ },
  { unit: 'set', pattern: /^(компл|комплект(а|ов)?|к-т|набор(а|ов)?)$/ },
  { unit: 'pair', pattern: /^(пар[аы]?)$/ },
  { unit: 'pack', pattern: /^(уп|упак|упаковк[аи]|упаковок|пакет(а|ов)?|пачк[аи]|пачек)$/ },
  { unit: 'kg', pattern: /^(кг|килограмм(а|ов)?|кило)$/ },
  { unit: 'l', pattern: /^(л|литр(а|ов)?)$/ },
  { unit: 'm', pattern: /^(м|метр(а|ов)?)$/ },
  { unit: 'roll', pattern: /^(рул|рулон(а|ов)?)$/ },
  { unit: 'bag', pattern: /^(меш|мешок|мешка|мешков)$/ },
  { unit: 'bottle', pattern: /^(бут|бутылк[аи]|бутылок)$/ },
]

export type ParsedQuantity = {
  quantity: number
  unit: UnitCode
  /** Текст количества не распознан полностью — исходник сохраняем в примечание */
  warning?: string
}

function unitFromWord(word: string): UnitCode | null {
  for (const entry of UNIT_PATTERNS) {
    if (entry.pattern.test(word)) return entry.unit
  }
  return null
}

/** «одна штука», «2 шт.», «два комплекта», «1,5 кг», «один пакет». */
export function parseQuantity(text: string): ParsedQuantity {
  const source = text.trim()
  if (!source) return { quantity: 1, unit: 'pcs' }

  const tokens = source
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/(\d)\s*,\s*(\d)/g, '$1.$2')
    .replace(/(\d)(\p{L})/gu, '$1 $2')
    .split(/\s+/)
    .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean)

  let digits: number | null = null
  let words: number | null = null
  let unit: UnitCode | null = null
  const unknown: string[] = []

  for (const token of tokens) {
    if (/^\d+(\.\d+)?$/.test(token)) {
      if (digits === null) digits = Number(token)
      continue
    }
    const value = NUMBER_WORDS[token]
    if (value !== undefined) {
      words = (words ?? 0) + value
      continue
    }
    const tokenUnit = unitFromWord(token)
    if (tokenUnit && !unit) {
      unit = tokenUnit
      continue
    }
    unknown.push(token)
  }

  const number = digits ?? words
  const quantity = number !== null && number > 0 ? number : 1
  const recognized = (number !== null && number > 0) || unit !== null
  if (!recognized || unknown.length > 0) {
    return { quantity, unit: unit ?? 'pcs', warning: `Количество: ${source}` }
  }
  return { quantity, unit: unit ?? 'pcs' }
}

/** Штучные единицы с целым количеством — постоянное хранение, остальное — расходники. */
export function modeForQuantity(quantity: number, unit: UnitCode): AccountingMode {
  return isCountableUnit(unit) && Number.isInteger(quantity) ? 'durable' : 'consumable'
}
