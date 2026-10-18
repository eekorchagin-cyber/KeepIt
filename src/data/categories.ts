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
