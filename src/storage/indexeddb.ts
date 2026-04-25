import Dexie, { type EntityTable } from 'dexie'
import type {
  EntityCache,
  EntityCacheEntry,
  SaveMetadata,
  SaveRecord,
  SaveStore,
  Storage,
} from './types'

const DB_NAME = 'understudy'
const DB_VERSION = 1

class UnderstudyDB extends Dexie {
  entities!: EntityTable<EntityCacheEntry, 'hash'>
  saves!: EntityTable<SaveRecord, 'id'>

  constructor(name: string = DB_NAME) {
    super(name)
    this.version(DB_VERSION).stores({
      entities: '&hash, kind, createdAt',
      saves: '&id, updatedAt',
    })
  }
}

export class IndexedDBStorage implements Storage {
  readonly entities: EntityCache
  readonly saves: SaveStore
  private readonly db: UnderstudyDB

  constructor(dbName: string = DB_NAME) {
    this.db = new UnderstudyDB(dbName)
    const db = this.db

    this.entities = {
      async get(hash) {
        return (await db.entities.get(hash)) ?? null
      },
      async put(entry) {
        await db.entities.put(entry)
      },
      async deleteByTemplateAndWorld(templateId, worldId) {
        // Cache keys are formatted "<templateId>:<worldId>:<hex>" — a
        // prefix range scan on the primary key is O(log n) on Dexie's
        // indexed store.
        return db.entities.where('hash').startsWith(`${templateId}:${worldId}:`).delete()
      },
    }

    this.saves = {
      async list() {
        const rows = await db.saves.toArray()
        return rows.map(
          ({ id, name, createdAt, updatedAt }): SaveMetadata => ({
            id,
            name,
            createdAt,
            updatedAt,
          }),
        )
      },
      async load(id) {
        return (await db.saves.get(id)) ?? null
      },
      async save(record) {
        await db.saves.put(record)
      },
      async delete(id) {
        await db.saves.delete(id)
      },
    }
  }

  async close(): Promise<void> {
    this.db.close()
  }
}
