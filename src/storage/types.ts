export type EntityKind = 'item' | 'mob' | 'location' | 'lore' | 'title'

export interface GenerationMeta {
  characterName: string
  /** Character level at time of generation. Recorded so area-gen
   *  payloads can recover their tier on rehydration even when the
   *  stored Area predates the `level` field. Optional for back-compat
   *  with older cache entries. */
  characterLevel?: number
  worldId: string
  modelId: string
  generatedAt: number
}

export interface EntityCacheEntry {
  hash: string
  kind: EntityKind
  createdAt: number
  payload: unknown
  meta?: GenerationMeta
}

export interface EntityCache {
  get(hash: string): Promise<EntityCacheEntry | null>
  put(entry: EntityCacheEntry): Promise<void>
  /** Prefix scan across the hash primary key. O(log n) on Dexie's indexed
   *  store. Returns every entry whose hash starts with `prefix` — used by
   *  rehydration paths that need to discover all generations for a given
   *  (template, world) pair without an external index. */
  listByPrefix(prefix: string): Promise<EntityCacheEntry[]>
  /** Remove a single entry by its full hash key. No-op if the hash isn't
   *  present. Used to drop stale / malformed cache entries discovered
   *  during rehydration. */
  delete(hash: string): Promise<void>
  /** Purge every entry whose hash starts with `${templateId}:${worldId}:`.
   *  Used when author-editable context changes make prior generations stale.
   *  Returns the count removed so callers can show "N entries purged". */
  deleteByTemplateAndWorld(templateId: string, worldId: string): Promise<number>
}

export interface SaveMetadata {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

export interface SaveRecord extends SaveMetadata {
  data: unknown
}

export interface SaveStore {
  list(): Promise<SaveMetadata[]>
  load(id: string): Promise<SaveRecord | null>
  save(record: SaveRecord): Promise<void>
  delete(id: string): Promise<void>
}

export interface Storage {
  entities: EntityCache
  saves: SaveStore
}
