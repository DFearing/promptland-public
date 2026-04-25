export type EntityKind = 'item' | 'mob' | 'location' | 'lore' | 'title'

export interface EntityCacheEntry {
  hash: string
  kind: EntityKind
  createdAt: number
  payload: unknown
}

export interface EntityCache {
  get(hash: string): Promise<EntityCacheEntry | null>
  put(entry: EntityCacheEntry): Promise<void>
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
