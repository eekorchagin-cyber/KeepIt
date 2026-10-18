import type { CategoryNode, ItemName } from '../../types'
import { findCategoryNode, normalizeCategoryName } from '../categories'
import { normalizeName } from './parseList'

export type CategorySuggestion = {
  category: string
  subcategory: string
  /** dictionary — так уже назначали этому названию; rule — по ключевому слову */
  source: 'dictionary' | 'rule'
}

/** Начала слов → категория. Порядок важен: более точные правила выше. */
const RULES: Array<{ stems: string[]; category: string; subcategory: string }> = [
  {
    stems: ['набор отверт', 'набор ключ', 'набор инструм', 'набор бит', 'набор головок'],
    category: 'Инструменты',
    subcategory: 'Наборы инструментов',
  },
  {
    stems: ['дрел', 'шуруповерт', 'болгарк', 'перфоратор', 'лобзик', 'паяльник', 'электрофен', 'фен строит', 'шлифов', 'гайковерт', 'электрорубан'],
    category: 'Инструменты',
    subcategory: 'Электрические',
  },
  {
    stems: ['топор', 'колун', 'дровокол', 'струбцин', 'корнцанг', 'молот', 'кувалд', 'отверт', 'плоскогубц', 'пассатиж', 'кусачк', 'ножовк', 'пила', 'пилы', 'стамеск', 'рубанок', 'напильник', 'ключ', 'рулетк', 'шпател', 'зубил', 'тиск', 'лом', 'лопат', 'грабл', 'вилы', 'секатор', 'уровень строит'],
    category: 'Инструменты',
    subcategory: 'Ручные',
  },
  {
    stems: ['газонокосил', 'триммер', 'культиватор', 'мотоблок', 'бензопил', 'кусторез', 'опрыскиват', 'тачк'],
    category: 'Оборудование',
    subcategory: 'Садовая техника',
  },
  {
    stems: ['снегоубор', 'пылесос', 'мойка высокого', 'воздуходув'],
    category: 'Оборудование',
    subcategory: 'Уборочная техника',
  },
  {
    stems: ['лестниц', 'стремянк', 'печк', 'печь', 'обогреват', 'генератор', 'компрессор', 'гриль', 'мангал', 'сварочн'],
    category: 'Оборудование',
    subcategory: '',
  },
  { stems: ['лампочк', 'лампа'], category: 'Расходные материалы', subcategory: 'Лампочки' },
  { stems: ['фонар', 'светильник', 'гирлянд'], category: 'Расходные материалы', subcategory: 'Освещение' },
  { stems: ['клей', 'герметик'], category: 'Расходные материалы', subcategory: 'Клеи' },
  { stems: ['фильтр'], category: 'Расходные материалы', subcategory: 'Фильтры' },
  {
    stems: ['удобрен', 'компост', 'грунт', 'торф'],
    category: 'Расходные материалы для сада',
    subcategory: 'Удобрения',
  },
  {
    stems: ['семена', 'семян', 'рассад', 'мульч'],
    category: 'Расходные материалы для сада',
    subcategory: 'Другие садовые расходники',
  },
  {
    stems: ['уголь', 'розжиг', 'саморез', 'гвозд', 'шуруп', 'болт', 'гайк', 'дюбел', 'изолент', 'скотч', 'перчатк', 'батарейк', 'свеч', 'мешки для мусора', 'наждач'],
    category: 'Расходные материалы',
    subcategory: '',
  },
  {
    stems: ['удлинител', 'кабел', 'провод', 'зарядк', 'зарядн', 'переходник', 'тройник', 'сетевой фильтр'],
    category: 'Электроника',
    subcategory: 'Кабели и зарядные устройства',
  },
  {
    stems: ['телефон', 'планшет', 'ноутбук', 'роутер', 'колонк', 'телевизор', 'радио', 'фотоаппарат'],
    category: 'Электроника',
    subcategory: 'Устройства',
  },
  { stems: ['наушник', 'мышь', 'клавиатур', 'чехол'], category: 'Электроника', subcategory: 'Аксессуары' },
  { stems: ['бинт', 'пластыр', 'вата', 'марл'], category: 'Лекарства', subcategory: 'Перевязочные материалы' },
  {
    stems: ['таблет', 'мазь', 'капли', 'лекарств', 'аптечк', 'сироп'],
    category: 'Лекарства',
    subcategory: 'Лекарственные препараты',
  },
  {
    stems: ['ручк', 'карандаш', 'маркер', 'фломастер'],
    category: 'Канцелярия',
    subcategory: 'Письменные принадлежности',
  },
  { stems: ['бумаг', 'тетрад', 'блокнот'], category: 'Канцелярия', subcategory: 'Бумага' },
  { stems: ['папк'], category: 'Канцелярия', subcategory: 'Папки' },
  { stems: ['паспорт', 'договор', 'свидетельств'], category: 'Документы', subcategory: 'Личные' },
  { stems: ['инструкц', 'гаранти'], category: 'Документы', subcategory: 'Инструкции и гарантии' },
  { stems: ['куртк', 'пальто', 'шуб', 'пуховик', 'плащ'], category: 'Одежда', subcategory: 'Верхняя одежда' },
  { stems: ['шапк', 'шарф', 'носк', 'свитер', 'брюк', 'футболк', 'рубашк'], category: 'Одежда', subcategory: 'Прочая одежда' },
  { stems: ['сапог', 'ботин', 'кроссовк', 'туфл', 'тапк', 'валенк', 'калош'], category: 'Обувь', subcategory: 'По назначению' },
  { stems: ['справочник', 'словар', 'энциклопед'], category: 'Книги', subcategory: 'Справочники' },
  { stems: ['книг', 'роман'], category: 'Книги', subcategory: '' },
  {
    stems: ['краск', 'кист', 'холст', 'пряж', 'бисер', 'пластилин'],
    category: 'Материалы для творчества',
    subcategory: 'По виду творчества',
  },
]

function matchesStem(name: string, stem: string): boolean {
  let index = name.indexOf(stem)
  while (index >= 0) {
    if (index === 0 || !/\p{L}/u.test(name[index - 1]!)) return true
    index = name.indexOf(stem, index + 1)
  }
  return false
}

/** Категория и подкатегория должны существовать в текущем (редактируемом) справочнике. */
function fitTree(
  tree: CategoryNode[],
  category: string,
  subcategory: string,
): { category: string; subcategory: string } | null {
  const node = findCategoryNode(tree, category)
  if (!node) return null
  const sub = node.children.find(
    (child) => normalizeCategoryName(child) === normalizeCategoryName(subcategory),
  )
  return { category: node.name, subcategory: sub ?? '' }
}

export function suggestCategory(
  name: string,
  tree: CategoryNode[],
  names: ItemName[],
): CategorySuggestion | null {
  const key = normalizeName(name)
  if (!key) return null

  const known = names.find((entry) => entry.nameKey === key && entry.category)
  if (known) {
    const fitted = fitTree(tree, known.category, known.subcategory)
    if (fitted) return { ...fitted, source: 'dictionary' }
  }

  for (const rule of RULES) {
    if (rule.stems.some((stem) => matchesStem(key, stem))) {
      const fitted = fitTree(tree, rule.category, rule.subcategory)
      if (fitted) return { ...fitted, source: 'rule' }
    }
  }
  return null
}
