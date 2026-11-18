import assert from 'node:assert/strict'
import { planDemoteCategory, planMoveSubcategory, type CategoryNode } from './categories.ts'

const tree: CategoryNode[] = [
  { name: 'Инструменты', children: ['Ручные', 'Электрические'] },
  { name: 'Оборудование', children: ['Садовая техника'] },
  { name: 'Прочее', children: [] },
]

const moved = planMoveSubcategory(tree, 'Инструменты', 'Ручные', 'Оборудование')
assert.deepEqual(moved.from, { category: 'Инструменты', subcategory: 'Ручные' })
assert.deepEqual(moved.to, { category: 'Оборудование', subcategory: 'Ручные' })
assert.deepEqual(
  moved.tree.find((node) => node.name === 'Инструменты')?.children,
  ['Электрические'],
)
assert.deepEqual(moved.tree.find((node) => node.name === 'Оборудование')?.children, [
  'Ручные',
  'Садовая техника',
])
assert.deepEqual(tree[0]?.children, ['Ручные', 'Электрические'])

const merged = planMoveSubcategory(
  [
    { name: 'Инструменты', children: ['Ручные'] },
    { name: 'Оборудование', children: ['ручные'] },
  ],
  'Инструменты',
  'Ручные',
  'Оборудование',
)
assert.equal(merged.to.subcategory, 'ручные')
assert.deepEqual(merged.tree.find((node) => node.name === 'Оборудование')?.children, ['ручные'])

assert.throws(
  () => planMoveSubcategory(tree, 'Инструменты', 'Ручные', 'Инструменты'),
  /уже в этой категории/,
)

const demoted = planDemoteCategory(tree, 'Инструменты', 'Оборудование', ['Ручные', 'Редкие'])
assert.equal(demoted.fromCategory, 'Инструменты')
assert.equal(demoted.toCategory, 'Оборудование')
assert.equal(demoted.bareSubcategory, 'Инструменты')
assert.equal(
  demoted.tree.some((node) => node.name === 'Инструменты'),
  false,
)
const equipment = demoted.tree.find((node) => node.name === 'Оборудование')
assert.ok(equipment)
assert.deepEqual(equipment.children, ['Инструменты', 'Редкие', 'Ручные', 'Садовая техника', 'Электрические'])
const keptManual = demoted.kept.find((row) => row.from === 'Ручные')
assert.deepEqual(keptManual, { from: 'Ручные', to: 'Ручные' })
assert.equal(
  demoted.kept.some((row) => row.from === 'Инструменты'),
  false,
)

const folded = planDemoteCategory(
  [
    { name: 'Инструменты', children: ['Ручные'] },
    { name: 'Оборудование', children: ['ручные', 'инструменты'] },
  ],
  'Инструменты',
  'Оборудование',
  ['Ручные'],
)
assert.equal(folded.bareSubcategory, 'инструменты')
assert.deepEqual(folded.kept.find((row) => row.from === 'Ручные'), { from: 'Ручные', to: 'ручные' })
assert.deepEqual(folded.tree.find((node) => node.name === 'Оборудование')?.children, [
  'инструменты',
  'ручные',
])

assert.throws(() => planDemoteCategory(tree, 'Прочее', 'Прочее'), /саму в себя/)

console.log('category move ok')
