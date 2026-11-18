import type { CategoryNode } from '../types'

export type { CategoryNode }

/** Начальный справочник (по каталогу и ТЗ). */
export const DEFAULT_CATEGORY_TREE: CategoryNode[] = [
  {
    name: 'Книги',
    children: ['Художественные', 'Профессиональные', 'Справочники'],
  },
  {
    name: 'Электроника',
    children: ['Устройства', 'Аксессуары', 'Кабели и зарядные устройства'],
  },
  {
    name: 'Документы',
    children: ['Личные', 'На имущество', 'Инструкции и гарантии'],
  },
  {
    name: 'Лекарства',
    children: ['Лекарственные препараты', 'Перевязочные материалы'],
  },
  {
    name: 'Канцелярия',
    children: ['Письменные принадлежности', 'Бумага', 'Папки'],
  },
  {
    name: 'Одежда',
    children: ['Верхняя одежда', 'Прочая одежда'],
  },
  {
    name: 'Обувь',
    children: ['По сезонам', 'По назначению'],
  },
  {
    name: 'Материалы для творчества',
    children: ['По виду творчества'],
  },
  {
    name: 'Инструменты',
    children: ['Ручные', 'Электрические', 'Наборы инструментов', 'Требует уточнения'],
  },
  {
    name: 'Оборудование',
    children: ['Садовая техника', 'Уборочная техника'],
  },
  {
    name: 'Расходные материалы',
    children: ['Освещение', 'Фильтры', 'Клеи', 'Лампочки'],
  },
  {
    name: 'Расходные материалы для сада',
    children: ['Удобрения', 'Другие садовые расходники'],
  },
  {
    name: 'Прочее',
    children: [],
  },
]

export function cloneCategoryTree(tree: CategoryNode[] = DEFAULT_CATEGORY_TREE): CategoryNode[] {
  return tree.map((node) => ({ name: node.name, children: [...node.children] }))
}

/** Категории и подкатегории по алфавиту (для показа). */
export function sortCategoryTree(tree: CategoryNode[]): CategoryNode[] {
  return tree
    .map((node) => ({
      name: node.name,
      children: [...node.children].sort((a, b) => a.localeCompare(b, 'ru')),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

export function findCategoryNode(tree: CategoryNode[], name: string): CategoryNode | undefined {
  const q = name.trim().toLowerCase().replaceAll('ё', 'е')
  return tree.find((node) => node.name.toLowerCase().replaceAll('ё', 'е') === q)
}

export function formatCategoryPath(category: string, subcategory = ''): string {
  return [category, subcategory].filter(Boolean).join(' / ')
}

export function normalizeCategoryName(value: string): string {
  return value.trim().toLowerCase().replaceAll('ё', 'е').replace(/\s+/g, ' ')
}

export type CategoryPlacement = {
  category: string
  subcategory: string
}

/** Подкатегория переезжает в другую категорию; название подкатегории сохраняется. */
export type SubcategoryMovePlan = {
  tree: CategoryNode[]
  from: CategoryPlacement
  to: CategoryPlacement
}

/**
 * Категория становится подкатегорией другой.
 * Вещи без подкатегории получают название бывшей категории.
 * Вещи, у которых подкатегория уже стоит, сохраняют её — меняется только категория.
 */
export type CategoryDemotePlan = {
  tree: CategoryNode[]
  fromCategory: string
  toCategory: string
  bareSubcategory: string
  /** Уже присвоенные подкатегории: как были → как записать в новом месте. */
  kept: { from: string; to: string }[]
}

function sameCategoryName(a: string, b: string): boolean {
  return normalizeCategoryName(a) === normalizeCategoryName(b)
}

function findNode(tree: CategoryNode[], name: string): CategoryNode | undefined {
  return tree.find((node) => sameCategoryName(node.name, name))
}

function canonicalChild(children: string[], name: string): string {
  const key = normalizeCategoryName(name)
  return children.find((child) => normalizeCategoryName(child) === key) ?? name.trim()
}

function rememberName(bucket: Map<string, string>, name: string): void {
  const trimmed = name.trim()
  if (!trimmed) return
  const key = normalizeCategoryName(trimmed)
  if (!bucket.has(key)) bucket.set(key, trimmed)
}

function placeChild(children: string[], name: string): string {
  const existing = children.find((child) => sameCategoryName(child, name))
  if (existing) return existing
  children.push(name.trim())
  children.sort((a, b) => a.localeCompare(b, 'ru'))
  return name.trim()
}

/** Перенос подкатегории в другую категорию. Совпадающее имя сливается, дубль в справочнике не появляется. */
export function planMoveSubcategory(
  tree: CategoryNode[],
  fromCategory: string,
  subcategory: string,
  toCategory: string,
): SubcategoryMovePlan {
  if (sameCategoryName(fromCategory, toCategory)) {
    throw new Error('Подкатегория уже в этой категории')
  }
  const next = cloneCategoryTree(tree)
  const from = findNode(next, fromCategory)
  const to = findNode(next, toCategory)
  if (!from) throw new Error('Категория не найдена')
  if (!to) throw new Error('Категория не найдена')
  const index = from.children.findIndex((child) => sameCategoryName(child, subcategory))
  if (index < 0) throw new Error('Подкатегория не найдена')
  const childName = from.children[index]!
  from.children.splice(index, 1)
  const placed = placeChild(to.children, childName)
  return {
    tree: next,
    from: { category: from.name, subcategory: childName },
    to: { category: to.name, subcategory: placed },
  }
}

/**
 * Категория становится подкатегорией другой.
 * `assignedSubcategories` — подкатегории, которые уже стоят на вещах: их нужно унести вместе с вещами,
 * даже если в справочнике такой строки уже нет.
 */
export function planDemoteCategory(
  tree: CategoryNode[],
  category: string,
  intoCategory: string,
  assignedSubcategories: string[] = [],
): CategoryDemotePlan {
  if (sameCategoryName(category, intoCategory)) {
    throw new Error('Категорию нельзя перенести саму в себя')
  }
  const next = cloneCategoryTree(tree)
  const fromIndex = next.findIndex((node) => sameCategoryName(node.name, category))
  if (fromIndex < 0) throw new Error('Категория не найдена')
  const into = findNode(next, intoCategory)
  if (!into) throw new Error('Категория не найдена')
  const from = next[fromIndex]!
  const carried = new Map<string, string>()
  for (const child of from.children) rememberName(carried, child)
  for (const child of assignedSubcategories) rememberName(carried, child)
  const fromName = from.name
  next.splice(fromIndex, 1)
  const target = findNode(next, into.name)
  if (!target) throw new Error('Категория не найдена')
  for (const name of carried.values()) placeChild(target.children, name)
  const bareSubcategory = placeChild(target.children, fromName)
  target.children.sort((a, b) => a.localeCompare(b, 'ru'))
  const kept = [...carried.entries()].map(([key, display]) => ({
    from: display,
    to: canonicalChild(target.children, key),
  }))
  return {
    tree: next,
    fromCategory: fromName,
    toCategory: target.name,
    bareSubcategory,
    kept,
  }
}
