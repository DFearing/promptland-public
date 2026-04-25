import Dexie, { type EntityTable } from 'dexie'

// Sprites live in their own IndexedDB database rather than extending the
// primary 'promptland' schema — PNG Blobs belong to a different storage-shape
// regime than the JSON entity cache, and isolating them avoids a schema bump
// on the main DB every time we touch sprite storage.
const DB_NAME = 'promptland_sprites'
const DB_VERSION = 1

export interface SpriteRecord {
  /** Content-derived key. Two calls with the same generation inputs collide
   *  here intentionally, so the second call returns the cached Blob instead
   *  of hitting the bridge again. */
  hash: string
  prompt: string
  blob: Blob
  width: number
  height: number
  seed: number
  elapsedMs: number
  createdAt: number
}

class SpritesDB extends Dexie {
  sprites!: EntityTable<SpriteRecord, 'hash'>

  constructor(name: string = DB_NAME) {
    super(name)
    this.version(DB_VERSION).stores({
      sprites: '&hash, createdAt',
    })
  }
}

export interface SpriteCache {
  get(hash: string): Promise<SpriteRecord | null>
  put(record: SpriteRecord): Promise<void>
  list(): Promise<SpriteRecord[]>
  delete(hash: string): Promise<void>
  clear(): Promise<void>
}

export function createSpriteCache(dbName: string = DB_NAME): SpriteCache {
  const db = new SpritesDB(dbName)
  return {
    async get(hash) {
      return (await db.sprites.get(hash)) ?? null
    },
    async put(record) {
      await db.sprites.put(record)
    },
    async list() {
      return db.sprites.orderBy('createdAt').reverse().toArray()
    },
    async delete(hash) {
      await db.sprites.delete(hash)
    },
    async clear() {
      await db.sprites.clear()
    },
  }
}

export interface SpriteCacheKeyInputs {
  prompt: string
  seed?: number
  width?: number
  height?: number
  steps?: number
}

// FNV-1a 64-bit — matches the style used in src/llm/cacheKey.ts. Not
// cryptographic, just deterministic and dependency-free. 64 bits is ample
// for a content cache.
export function spriteCacheKey(inputs: SpriteCacheKeyInputs): string {
  const body = JSON.stringify({
    p: inputs.prompt,
    s: inputs.seed ?? null,
    w: inputs.width ?? null,
    h: inputs.height ?? null,
    t: inputs.steps ?? null,
  })
  const bytes = new TextEncoder().encode(body)
  let hash = 0xcbf29ce484222325n
  const prime = 0x100000001b3n
  const mask = 0xffffffffffffffffn
  for (let i = 0; i < bytes.length; i++) {
    hash = ((hash ^ BigInt(bytes[i])) * prime) & mask
  }
  return hash.toString(16).padStart(16, '0')
}
