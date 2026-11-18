import assert from 'node:assert/strict'
import { suggestStoragePlaces } from './suggestPlace.ts'

function place(
  id: string,
  parentId: string | null,
  objectKey: string,
  archived = false,
) {
  return { id, parentId, objectKey, archived }
}

function item(name: string, placeId: string, category = '', subcategory = '', needsFill = false) {
  return { name, placeId, category, subcategory, needsFill }
}

const places = [
  place('home', null, 'home'),
  place('garage', 'home', 'home'),
  place('electric', 'garage', 'home'),
  place('fasteners', 'garage', 'home'),
  place('dacha', null, 'dacha'),
  place('shed', 'dacha', 'dacha'),
]

const base = {
  name: '',
  category: '',
  subcategory: '',
  currentPlaceId: 'garage',
  items: [] as ReturnType<typeof item>[],
  places,
}

const same = suggestStoragePlaces({
  ...base,
  name: 'Дрель',
  items: [item('дрель', 'electric'), item('Молоток', 'fasteners')],
})
assert.deepEqual(
  same.map((hint) => hint.placeId),
  ['electric'],
)
assert.equal(same[0]?.kind, 'same')
assert.equal(same[0]?.count, 1)

assert.deepEqual(
  suggestStoragePlaces({
    ...base,
    name: 'Дрель',
    currentPlaceId: 'electric',
    items: [item('Дрель', 'electric')],
  }),
  [],
)

const more = suggestStoragePlaces({
  ...base,
  name: 'Дрель',
  items: [item('Дрель', 'electric'), item('Дрель', 'fasteners'), item('Дрель', 'fasteners')],
})
assert.equal(more[0]?.placeId, 'fasteners')
assert.equal(more[0]?.count, 2)

assert.deepEqual(
  suggestStoragePlaces({
    ...base,
    name: 'Гвоздь',
    category: 'Расходные материалы',
    items: [item('Изолента', 'electric', 'Расходные материалы')],
  }),
  [],
)

const cluster = suggestStoragePlaces({
  ...base,
  name: 'Гвоздь',
  category: 'Расходные материалы',
  items: [
    item('Изолента', 'fasteners', 'Расходные материалы'),
    item('Шуруп', 'fasteners', 'Расходные материалы'),
    item('Клей', 'electric', 'Расходные материалы'),
  ],
})
assert.equal(cluster[0]?.kind, 'kind')
assert.equal(cluster[0]?.placeId, 'fasteners')

assert.deepEqual(
  suggestStoragePlaces({
    ...base,
    category: 'Инструменты',
    items: [
      item('Дрель', 'electric', 'Инструменты'),
      item('Болгарка', 'electric', 'Инструменты'),
      item('Молоток', 'fasteners', 'Инструменты'),
      item('Ключ', 'fasteners', 'Инструменты'),
    ],
  }),
  [],
)

const sub = suggestStoragePlaces({
  ...base,
  name: 'Шуруповёрт',
  category: 'Инструменты',
  subcategory: 'Электрические',
  items: [item('Дрель', 'electric', 'Инструменты', 'Электрические')],
})
assert.equal(sub[0]?.placeId, 'electric')
assert.equal(sub[0]?.kind, 'kind')

const homeWins = suggestStoragePlaces({
  ...base,
  category: 'Инструменты',
  subcategory: 'Ручные',
  items: [
    item('Молоток', 'fasteners', 'Инструменты', 'Ручные'),
    item('Топор', 'shed', 'Инструменты', 'Ручные'),
  ],
})
assert.equal(homeWins[0]?.placeId, 'fasteners')

assert.deepEqual(
  suggestStoragePlaces({
    ...base,
    name: 'Дрель',
    items: [item('Дрель', 'shed', '', '', true)],
  }).filter((hint) => hint.kind === 'same'),
  [],
)

const archived = suggestStoragePlaces({
  ...base,
  name: 'Дрель',
  places: [...places, place('old', 'garage', 'home', true)],
  items: [item('Дрель', 'old')],
})
assert.deepEqual(archived, [])

const similar = suggestStoragePlaces({
  ...base,
  name: 'дрель',
  items: [item('Дрель ударная', 'electric')],
})
assert.equal(similar[0]?.kind, 'similar')
assert.equal(similar[0]?.placeId, 'electric')

assert.deepEqual(suggestStoragePlaces({ ...base, name: 'др' }), [])

const yo = suggestStoragePlaces({
  ...base,
  name: 'Ёлка',
  items: [item('елка', 'electric')],
})
assert.equal(yo[0]?.kind, 'same')

const both = suggestStoragePlaces({
  ...base,
  name: 'Дрель',
  category: 'Инструменты',
  subcategory: 'Электрические',
  items: [
    item('Дрель', 'shed'),
    item('Болгарка', 'electric', 'Инструменты', 'Электрические'),
  ],
})
assert.deepEqual(
  both.map((hint) => [hint.kind, hint.placeId]),
  [
    ['same', 'shed'],
    ['kind', 'electric'],
  ],
)

const tied = suggestStoragePlaces({
  ...base,
  name: 'Дрель',
  items: [item('Дрель', 'electric'), item('Дрель', 'fasteners')],
})
assert.deepEqual(
  tied.map((hint) => hint.placeId).sort(),
  ['electric', 'fasteners'],
)

const deeper = suggestStoragePlaces({
  ...base,
  name: 'Дрель',
  currentPlaceId: 'home',
  items: [item('Дрель', 'garage'), item('Дрель', 'electric')],
})
assert.deepEqual(
  deeper.map((hint) => hint.placeId),
  ['electric'],
)

console.log('suggest place ok')
