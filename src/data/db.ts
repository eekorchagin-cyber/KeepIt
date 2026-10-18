import Dexie, { type EntityTable } from 'dexie'
import type { AppSettings, Item, ItemName, Place, StockMove } from '../types'

export class KeepItDb extends Dexie {
  places!: EntityTable<Place, 'id'>
  items!: EntityTable<Item, 'id'>
  moves!: EntityTable<StockMove, 'id'>
  settings!: EntityTable<AppSettings, 'id'>
  itemNames!: EntityTable<ItemName, 'id'>

  constructor() {
    super('keepit')
    this.version(1).stores({
      places: 'id, familyId, parentId, objectKey, code, updatedAt',
      items: 'id, familyId, placeId, name, mode, updatedAt',
      moves: 'id, familyId, itemId, createdAt',
      settings: 'id',
    })
    this.version(2).stores({
      itemNames: 'id, &nameKey',
    })
  }
}

export const db = new KeepItDb()
