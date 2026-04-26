import type { AreaFlavor, AreaKind, RoomType } from '../areas/types'
import type { Rarity } from '../items/rarity'
import type { ItemFlavor, ItemKind } from '../items/types'
import type { MobFlavor } from '../mobs/types'
import type { EntityKind } from '../storage/types'
import type { LLMMessage } from './types'

// Context shape for a rarity-scoped scope: always an `any` baseline that applies
// when no specific rarity is requested, plus optional per-rarity overrides.
// Empty strings render as nothing in the prompt (see renderContextLine).
export interface RarityScopedContext {
  any: string
  byRarity?: Partial<Record<Rarity, string>>
}

// Code-authored world context that every LLM prompt is parameterized by. One
// instance per world lives on WorldContent.context. Templates read from this
// directly — there is no runtime override layer.
export interface WorldContextDefaults {
  /** Top-level flavor guidance for the world. Applies to every template. */
  world: string
  /** Shared rarity ladder — voice and length guidance per tier. Applies to
   *  every template when a rarity is passed. `common` is intentionally absent:
   *  the scope's `any` baseline is already the common voice, so an extra blob
   *  saying "commons are ordinary" is just noise tokens. Per-scope `byRarity`
   *  overrides (on items, mobs, etc.) layer on top for kind-specific nuance. */
  rarity: Partial<Record<Rarity, string>>
  item: Partial<Record<ItemKind, RarityScopedContext>>
  mob: RarityScopedContext
  area: Partial<Record<AreaKind, RarityScopedContext>>
  room: Partial<Record<RoomType, RarityScopedContext>>
  lore: RarityScopedContext
}

export interface PromptTemplate<TParams, TPayload> {
  id: string
  version: string
  kind: EntityKind
  /** System prompt with {{placeholder}} substitution points. */
  defaultSystemTemplate: string
  /** Documentation-grade list of placeholders available in defaultSystemTemplate. */
  systemPlaceholders: readonly string[]
  /** Map each placeholder name to its stringified value for a given params set
   *  plus the world's code-authored context. */
  systemValues(params: TParams, ctx: WorldContextDefaults): Record<string, string>
  /** Extract the worldId for cache-key prefixing and per-world purging. */
  worldIdOf(params: TParams): string
  /** User message is code-controlled — it embeds the generation request itself. */
  user(params: TParams): string
  parse(content: string): TPayload
}

// Render a context blob onto its own line when non-empty; collapse to nothing
// when empty so the prompt stays clean.
function contextLine(text: string): string {
  const trimmed = text.trim()
  return trimmed.length > 0 ? '\n' + trimmed : ''
}

// Pull the first JSON object out of a response. Some models wrap output in
// ```json fences or chat around it despite instructions to the contrary.
function extractJson(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) return fenced[1].trim()
  const first = content.indexOf('{')
  const last = content.lastIndexOf('}')
  if (first >= 0 && last > first) return content.slice(first, last + 1)
  return content.trim()
}

function listOr(items: string[], fallback: string): string {
  return items.length > 0 ? items.join(', ') : fallback
}

// Apply {{key}} substitution. Unknown keys render as empty strings so a partial
// override doesn't blow up with a visible "{{undefined}}" in the prompt.
export function substitute(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? '')
}

// Shared builder. The world's code-authored context is passed in; templates
// use it in their systemValues to fill the context placeholders.
export function renderMessages<TParams, TPayload>(
  template: PromptTemplate<TParams, TPayload>,
  params: TParams,
  ctx: WorldContextDefaults,
): LLMMessage[] {
  const values = template.systemValues(params, ctx)
  const system = substitute(template.defaultSystemTemplate, values)
  return [
    { role: 'system', content: system },
    { role: 'user', content: template.user(params) },
  ]
}

// ---- itemFlavor ----------------------------------------------------------

export interface ItemFlavorParams {
  worldId: string
  archetypeKind: ItemKind
  archetypeHint: string
  allowedConcepts: string[]
  forbiddenConcepts: string[]
  rarity?: string
}

export const itemFlavorTemplate: PromptTemplate<ItemFlavorParams, ItemFlavor> = {
  id: 'itemFlavor',
  version: '2',
  kind: 'item',
  defaultSystemTemplate: `You name and describe items for a {{worldId}} world.{{worldContext}}{{rarityContext}}{{itemContext}}{{itemRarityContext}}
Allowed concepts: {{allowedConcepts}}.
Forbidden concepts: {{forbiddenConcepts}}.
Respond only with compact JSON matching {"name": string, "description": string}.
Do not mention rarity or price.`,
  systemPlaceholders: [
    'worldId',
    'allowedConcepts',
    'forbiddenConcepts',
    'worldContext',
    'rarityContext',
    'itemContext',
    'itemRarityContext',
  ],
  systemValues(params, ctx) {
    const kindScope = ctx.item[params.archetypeKind]
    return {
      worldId: params.worldId,
      allowedConcepts: listOr(params.allowedConcepts, '(none listed)'),
      forbiddenConcepts: listOr(params.forbiddenConcepts, '(none)'),
      worldContext: contextLine(ctx.world),
      rarityContext: contextLine(
        params.rarity ? (ctx.rarity[params.rarity as Rarity] ?? '') : '',
      ),
      itemContext: contextLine(kindScope?.any ?? ''),
      itemRarityContext: contextLine(
        params.rarity && kindScope?.byRarity
          ? (kindScope.byRarity[params.rarity as Rarity] ?? '')
          : '',
      ),
    }
  },
  worldIdOf(params) {
    return params.worldId
  },
  user(params) {
    const rarityLine = params.rarity ? ` (rarity: ${params.rarity})` : ''
    return `Kind: ${params.archetypeKind}${rarityLine}. Hint: ${params.archetypeHint}.`
  },
  parse(content) {
    const data = JSON.parse(extractJson(content)) as Partial<ItemFlavor>
    if (typeof data.name !== 'string' || typeof data.description !== 'string') {
      throw new Error('Expected JSON with string "name" and "description".')
    }
    return { name: data.name.trim(), description: data.description.trim() }
  },
}

// ---- mobFlavor -----------------------------------------------------------

export interface MobFlavorParams {
  worldId: string
  archetypeHint: string
  allowedConcepts: string[]
  forbiddenConcepts: string[]
  rarity?: string
}

export const mobFlavorTemplate: PromptTemplate<MobFlavorParams, MobFlavor> = {
  id: 'mobFlavor',
  version: '2',
  kind: 'mob',
  defaultSystemTemplate: `You name and describe mobs (creatures, enemies, NPCs) for a {{worldId}} world.{{worldContext}}{{rarityContext}}{{mobContext}}{{mobRarityContext}}
Allowed concepts: {{allowedConcepts}}.
Forbidden concepts: {{forbiddenConcepts}}.
Respond only with compact JSON matching {"name": string, "description": string}.
Name is 1-3 words. The description evokes look and attitude. Do not mention rarity.`,
  systemPlaceholders: [
    'worldId',
    'allowedConcepts',
    'forbiddenConcepts',
    'worldContext',
    'rarityContext',
    'mobContext',
    'mobRarityContext',
  ],
  systemValues(params, ctx) {
    const rarityOverride =
      params.rarity && ctx.mob.byRarity ? (ctx.mob.byRarity[params.rarity as Rarity] ?? '') : ''
    return {
      worldId: params.worldId,
      allowedConcepts: listOr(params.allowedConcepts, '(none listed)'),
      forbiddenConcepts: listOr(params.forbiddenConcepts, '(none)'),
      worldContext: contextLine(ctx.world),
      rarityContext: contextLine(
        params.rarity ? (ctx.rarity[params.rarity as Rarity] ?? '') : '',
      ),
      mobContext: contextLine(ctx.mob.any),
      mobRarityContext: contextLine(rarityOverride),
    }
  },
  worldIdOf(params) {
    return params.worldId
  },
  user(params) {
    const rarityLine = params.rarity ? ` (rarity: ${params.rarity})` : ''
    return `Mob hint: ${params.archetypeHint}${rarityLine}.`
  },
  parse(content) {
    const data = JSON.parse(extractJson(content)) as Partial<MobFlavor>
    if (typeof data.name !== 'string' || typeof data.description !== 'string') {
      throw new Error('Expected JSON with string "name" and "description".')
    }
    return { name: data.name.trim(), description: data.description.trim() }
  },
}

// ---- areaFlavor ----------------------------------------------------------

export interface AreaFlavorParams {
  worldId: string
  areaKind: AreaKind
  areaHint: string
  allowedConcepts: string[]
  forbiddenConcepts: string[]
  rarity?: string
}

export const areaFlavorTemplate: PromptTemplate<AreaFlavorParams, AreaFlavor> = {
  id: 'areaFlavor',
  version: '2',
  kind: 'location',
  defaultSystemTemplate: `You name and describe areas (regions, dungeons, settlements) for a {{worldId}} world.{{worldContext}}{{rarityContext}}{{areaContext}}{{areaRarityContext}}
Allowed concepts: {{allowedConcepts}}.
Forbidden concepts: {{forbiddenConcepts}}.
Respond only with compact JSON matching {"name": string, "description": string, "theme": string}.
Name is 1-4 words. The description establishes mood and inhabitants. Do not mention rarity.
Theme is 2-4 words of evocative atmosphere for downstream room generation (e.g. "moldering crypt", "neon arcade").`,
  systemPlaceholders: [
    'worldId',
    'allowedConcepts',
    'forbiddenConcepts',
    'worldContext',
    'rarityContext',
    'areaContext',
    'areaRarityContext',
  ],
  systemValues(params, ctx) {
    const kindScope = ctx.area[params.areaKind]
    const rarityOverride =
      params.rarity && kindScope?.byRarity
        ? (kindScope.byRarity[params.rarity as Rarity] ?? '')
        : ''
    return {
      worldId: params.worldId,
      allowedConcepts: listOr(params.allowedConcepts, '(none listed)'),
      forbiddenConcepts: listOr(params.forbiddenConcepts, '(none)'),
      worldContext: contextLine(ctx.world),
      rarityContext: contextLine(
        params.rarity ? (ctx.rarity[params.rarity as Rarity] ?? '') : '',
      ),
      areaContext: contextLine(kindScope?.any ?? ''),
      areaRarityContext: contextLine(rarityOverride),
    }
  },
  worldIdOf(params) {
    return params.worldId
  },
  user(params) {
    const rarityLine = params.rarity ? ` (rarity: ${params.rarity})` : ''
    return `Area kind: ${params.areaKind}${rarityLine}. Hint: ${params.areaHint}.`
  },
  parse(content) {
    const data = JSON.parse(extractJson(content)) as Partial<AreaFlavor>
    if (
      typeof data.name !== 'string' ||
      typeof data.description !== 'string' ||
      typeof data.theme !== 'string'
    ) {
      throw new Error('Expected JSON with string "name", "description", and "theme".')
    }
    return {
      name: data.name.trim(),
      description: data.description.trim(),
      theme: data.theme.trim(),
    }
  },
}

// ---- roomFlavor ----------------------------------------------------------

export interface RoomFlavorPayload {
  name: string
  description: string
}

export interface RoomFlavorParams {
  worldId: string
  areaName: string
  areaTheme: string
  roomType: RoomType
  roomHint: string
  allowedConcepts: string[]
  forbiddenConcepts: string[]
  rarity?: string
}

export const roomFlavorTemplate: PromptTemplate<RoomFlavorParams, RoomFlavorPayload> = {
  id: 'roomFlavor',
  version: '2',
  kind: 'location',
  defaultSystemTemplate: `You name and describe individual rooms within an area of a {{worldId}} world.{{worldContext}}{{rarityContext}}{{roomContext}}{{roomRarityContext}}
Allowed concepts: {{allowedConcepts}}.
Forbidden concepts: {{forbiddenConcepts}}.
Respond only with compact JSON matching {"name": string, "description": string}.
Name is 1-4 words. The room must feel like it belongs to the provided area theme. Do not mention rarity.`,
  systemPlaceholders: [
    'worldId',
    'allowedConcepts',
    'forbiddenConcepts',
    'worldContext',
    'rarityContext',
    'roomContext',
    'roomRarityContext',
  ],
  systemValues(params, ctx) {
    const typeScope = ctx.room[params.roomType]
    const rarityOverride =
      params.rarity && typeScope?.byRarity
        ? (typeScope.byRarity[params.rarity as Rarity] ?? '')
        : ''
    return {
      worldId: params.worldId,
      allowedConcepts: listOr(params.allowedConcepts, '(none listed)'),
      forbiddenConcepts: listOr(params.forbiddenConcepts, '(none)'),
      worldContext: contextLine(ctx.world),
      rarityContext: contextLine(
        params.rarity ? (ctx.rarity[params.rarity as Rarity] ?? '') : '',
      ),
      roomContext: contextLine(typeScope?.any ?? ''),
      roomRarityContext: contextLine(rarityOverride),
    }
  },
  worldIdOf(params) {
    return params.worldId
  },
  user(params) {
    const rarityLine = params.rarity ? ` (rarity: ${params.rarity})` : ''
    return (
      `Area: ${params.areaName} (theme: ${params.areaTheme}). ` +
      `Room type: ${params.roomType}${rarityLine}. Hint: ${params.roomHint}.`
    )
  },
  parse(content) {
    const data = JSON.parse(extractJson(content)) as Partial<RoomFlavorPayload>
    if (typeof data.name !== 'string' || typeof data.description !== 'string') {
      throw new Error('Expected JSON with string "name" and "description".')
    }
    return { name: data.name.trim(), description: data.description.trim() }
  },
}

// ---- loreSnippet ---------------------------------------------------------

export interface LoreSnippet {
  text: string
  topics: string[]
}

export interface LoreSnippetParams {
  worldId: string
  topic: string
  context?: string
  allowedConcepts: string[]
  forbiddenConcepts: string[]
  rarity?: string
}

export const loreSnippetTemplate: PromptTemplate<LoreSnippetParams, LoreSnippet> = {
  id: 'loreSnippet',
  version: '2',
  kind: 'lore',
  defaultSystemTemplate: `You write short lore snippets for a {{worldId}} world.{{worldContext}}{{rarityContext}}{{loreContext}}{{loreRarityContext}}
Allowed concepts: {{allowedConcepts}}.
Forbidden concepts: {{forbiddenConcepts}}.
Respond only with compact JSON matching {"text": string, "topics": string[]}.
In-world voice — no meta commentary, no mention of rarity.
Topics are 2-5 short lowercase keywords matching the text content, for later retrieval.`,
  systemPlaceholders: [
    'worldId',
    'allowedConcepts',
    'forbiddenConcepts',
    'worldContext',
    'rarityContext',
    'loreContext',
    'loreRarityContext',
  ],
  systemValues(params, ctx) {
    const rarityOverride =
      params.rarity && ctx.lore.byRarity
        ? (ctx.lore.byRarity[params.rarity as Rarity] ?? '')
        : ''
    return {
      worldId: params.worldId,
      allowedConcepts: listOr(params.allowedConcepts, '(none listed)'),
      forbiddenConcepts: listOr(params.forbiddenConcepts, '(none)'),
      worldContext: contextLine(ctx.world),
      rarityContext: contextLine(
        params.rarity ? (ctx.rarity[params.rarity as Rarity] ?? '') : '',
      ),
      loreContext: contextLine(ctx.lore.any),
      loreRarityContext: contextLine(rarityOverride),
    }
  },
  worldIdOf(params) {
    return params.worldId
  },
  user(params) {
    const contextClause = params.context ? ` Context: ${params.context}.` : ''
    const rarityLine = params.rarity ? ` (rarity: ${params.rarity})` : ''
    return `Topic: ${params.topic}${rarityLine}.${contextClause}`
  },
  parse(content) {
    const data = JSON.parse(extractJson(content)) as Partial<LoreSnippet>
    if (
      typeof data.text !== 'string' ||
      !Array.isArray(data.topics) ||
      data.topics.some((t) => typeof t !== 'string')
    ) {
      throw new Error('Expected JSON with string "text" and string[] "topics".')
    }
    return {
      text: data.text.trim(),
      topics: data.topics.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0),
    }
  },
}

// ---- classTitle ----------------------------------------------------------

export interface ClassTitlePayload {
  text: string
}

export interface ClassTitleParams {
  worldId: string
  className: string
  classDescription: string
  /** The level at which this title is earned. */
  level: number
  /** Stable index used as the cache discriminator — two characters of the
   *  same class at the same title index share the cached title. */
  titleIndex: number
  /** Most recent title the character wore before this one, for continuity. */
  priorTitle?: string
  allowedConcepts: string[]
  forbiddenConcepts: string[]
}

export const classTitleTemplate: PromptTemplate<ClassTitleParams, ClassTitlePayload> = {
  id: 'classTitle',
  version: '1',
  kind: 'title',
  defaultSystemTemplate: `You invent honorific titles earned by characters of a given class in a {{worldId}} world.{{worldContext}}
Allowed concepts: {{allowedConcepts}}.
Forbidden concepts: {{forbiddenConcepts}}.
Respond only with compact JSON matching {"text": string}.
Rules for the title:
- 1-4 words, no quotes, no trailing punctuation.
- Reads as a rank, honorific, or epithet — not a full sentence.
- Fits the class and the world's voice. Post-100 titles should feel mythic — exalted, venerable, singular — but never generic.
- Must not repeat the prior title.
- Do not mention numbers, levels, or tiers.`,
  systemPlaceholders: [
    'worldId',
    'allowedConcepts',
    'forbiddenConcepts',
    'worldContext',
  ],
  systemValues(params, ctx) {
    return {
      worldId: params.worldId,
      allowedConcepts: listOr(params.allowedConcepts, '(none listed)'),
      forbiddenConcepts: listOr(params.forbiddenConcepts, '(none)'),
      worldContext: contextLine(ctx.world),
    }
  },
  worldIdOf(params) {
    return params.worldId
  },
  user(params) {
    const prior = params.priorTitle ? ` Prior title: "${params.priorTitle}".` : ''
    return (
      `Class: ${params.className} — ${params.classDescription}. ` +
      `This title is earned at level ${params.level}.${prior}`
    )
  },
  parse(content) {
    const data = JSON.parse(extractJson(content)) as Partial<ClassTitlePayload>
    if (typeof data.text !== 'string') {
      throw new Error('Expected JSON with string "text".')
    }
    const trimmed = data.text
      .trim()
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/[.!?;:]+$/g, '')
    if (trimmed.length === 0) {
      throw new Error('classTitle returned empty text.')
    }
    return { text: trimmed }
  },
}

// ---- areaGen (flavor-only pass over a pre-built shape) --------------------

export interface AreaGenRoomFlavor {
  name: string
  description: string
  /** Optional curated encounter override for this room. When present,
   *  spawns this exact mob (either by id from the world pool, or a
   *  bespoke new mob emitted inline) at the given rarity instead of
   *  rolling the random pool. firstOnly marks a one-shot spawn (boss
   *  rooms, story beats) — future entries after defeat revert to the
   *  pool. */
  encounter?: AreaGenRoomEncounter
  /** Optional fixed NPC standing in this room. Generated once at area-
   *  gen time, baked into the cached payload, replayed verbatim
   *  forever — no further LLM calls per interaction. NPCs only belong
   *  in welcoming room types (safe, inn, shrine, shop, water,
   *  entrance); the install pass strips them from rooms where they'd
   *  read as out of place. */
  npc?: AreaGenNPC
}

/** NPC the area-gen LLM emits inline. Field-compatible with the
 *  in-game `NPC` (areas/types.ts) — copied directly into the room at
 *  install time. */
export interface AreaGenNPC {
  id: string
  name: string
  role: string
  description: string
  cares: 'class' | 'species'
  hooks: Record<string, string>
  firstMeet: string
  regular: string[]
  frontierUnknown?: string
  frontierKnown?: string
}

/** Common rarity / firstOnly / loot fields shared by both variants. */
interface AreaGenEncounterBase {
  rarity: Rarity
  firstOnly?: boolean
  /** Optional curated loot override. Carried through the parse pass as
   *  a union (itemId or newItem per entry). The install pipeline
   *  rewrites newItem → itemId so the persisted shape is always by id. */
  loot?: AreaGenCuratedLoot
}

/** Reference an existing mob by id from the world pool. */
export interface AreaGenEncounterByRef extends AreaGenEncounterBase {
  mobId: string
  newMob?: never
}

/** Emit a brand-new mob inline. Goes to the bespoke-mob cache and is
 *  merged into `world.mobs` — after install, the room's encounter is
 *  rewritten to reference the new mob by id so the persisted schema
 *  stays consistent with the ByRef variant. */
export interface AreaGenEncounterByValue extends AreaGenEncounterBase {
  mobId?: never
  newMob: AreaGenBespokeMob
}

export type AreaGenRoomEncounter = AreaGenEncounterByRef | AreaGenEncounterByValue

/** Curated loot payload as emitted by the LLM. Items can be by-id
 *  references or inline bespoke items; both variants support explicit
 *  rarity + qty. */
export interface AreaGenCuratedLoot {
  gold?: { min: number; max: number }
  items?: AreaGenCuratedItem[]
}

export type AreaGenCuratedItem =
  | AreaGenCuratedItemByRef
  | AreaGenCuratedItemByValue

export interface AreaGenCuratedItemByRef {
  itemId: string
  newItem?: never
  rarity?: Rarity
  qty?: number
  level?: number
}

export interface AreaGenCuratedItemByValue {
  itemId?: never
  newItem: AreaGenBespokeItem
  rarity?: Rarity
  qty?: number
  level?: number
}

/** Bespoke item the LLM emits inline when the existing `world.items`
 *  pool has no thematic fit. Field-compatible with ItemDef. Only
 *  equipment and junk kinds are supported inline — consumables and
 *  scrolls require wiring to the consume / spell systems and are
 *  deferred until the engine grows first-class support. */
export interface AreaGenBespokeItem {
  /** Kebab-case slug unique within the world. */
  id: string
  name: string
  description: string
  /** Narrow subset of ItemKind the LLM can emit bespoke. */
  kind: 'junk' | 'equipment'
  value?: number
  stackable?: boolean
  weight?: number
  /** Equipment only — mirrors EquipmentArchetype.slot. */
  slot?:
    | 'weapon'
    | 'armor'
    | 'head'
    | 'arms'
    | 'hands'
    | 'legs'
    | 'feet'
    | 'cape'
    | 'amulet'
    | 'ring'
  /** Equipment only — attack / defense / stat bonuses. */
  bonuses?: {
    attack?: number
    defense?: number
    strength?: number
    dexterity?: number
    constitution?: number
    intelligence?: number
    wisdom?: number
    charisma?: number
  }
  /** Weapon only — 1 = one-handed, 2 = two-handed. */
  hands?: 1 | 2
  /** Equipment only — stat minimums before rarity scaling. */
  requirements?: {
    level?: number
    strength?: number
    dexterity?: number
    intelligence?: number
    wisdom?: number
  }
}

/** Shape the LLM emits for a bespoke mob. Field-compatible with
 *  MobTemplate; installed bespoke mobs are converted into MobTemplate
 *  objects and merged into `world.mobs`. */
export interface AreaGenBespokeMob {
  /** Unique mob id — kebab-case, not already in world.mobs. */
  id: string
  name: string
  description: string
  maxHp: number
  attack: number
  defense: number
  xpReward: number
  level: number
  /** Optional loot table (same shape as hardcoded MobArchetype.loot).
   *  Item ids must resolve to existing world.items; unresolved ids will
   *  be stripped at install time. */
  loot?: Array<
    | { kind: 'gold'; chance: number; min: number; max: number }
    | { kind: 'item'; itemId: string; chance: number; min?: number; max?: number }
  >
}

/** Compact pool entry handed to the LLM so it can pick curated
 *  encounters thematically — sees mob ids, names, and levels only. */
export interface AreaGenMobPoolEntry {
  id: string
  name: string
  level?: number
}

export interface AreaGenPayload {
  id: string
  name: string
  description: string
  /** One flavor entry per shape room, ordered the same as the input
   *  `rooms`. Layout and type live on the shape; the LLM only invents
   *  the name and description. */
  rooms: AreaGenRoomFlavor[]
}

export interface AreaGenShapeRoom {
  x: number
  y: number
  z: number
  type: RoomType
  /** Short hint (from shapeGen) that steers the LLM toward a room
   *  that fits its role — "central town plaza", "boss chamber",
   *  "clearing off the road". Optional; absent means "no extra guidance". */
  hint?: string
}

/** Minimum offset above player level for generated-area difficulty. */
export const AREA_LEVEL_OFFSET_MIN = 2
/** Range of the random offset (0-inclusive). areaLevel = playerLevel +
 *  OFFSET_MIN + rand(0..OFFSET_RANGE-1), yielding +2 or +3. */
export const AREA_LEVEL_OFFSET_RANGE = 2

export interface AreaGenParams {
  worldId: string
  characterName: string
  characterLevel: number
  characterClass: string
  /** Target difficulty level for the generated area. Rolled client-side
   *  as playerLevel + 2..3 so generated content is aspirational — harder
   *  and more rewarding than the player's current level. */
  areaLevel: number
  fromAreaName: string
  fromAreaDescription: string
  /** Flavor name of the exit room the character is stepping through
   *  (e.g. "Northern Road End", "Thornwood Trail"). Included in params so
   *  sibling exits from the same area produce distinct cache hashes — and
   *  the LLM can take the exit name as a thematic hint for what lies beyond. */
  fromExitName: string
  /** Structural shape the LLM must follow — drives per-kind layout
   *  guidance in the prompt (towns feel town-shaped, forests have
   *  roads, dungeons branch into a boss room, etc.). */
  areaKind: AreaKind
  /** The actual pre-built layout. Positions and types are authoritative
   *  — the LLM fills in names and descriptions only. */
  rooms: AreaGenShapeRoom[]
  allowedConcepts: string[]
  forbiddenConcepts: string[]
  /** World's mob pool, passed to the LLM so it can pick curated
   *  per-room encounters (optional) that match the area's tone. */
  mobPool: AreaGenMobPoolEntry[]
  /** World's item pool, passed to the LLM so curated loot drops can
   *  reference existing items by id before inventing bespoke ones. */
  itemPool: AreaGenItemPoolEntry[]
  /** Class ids the world supports. The LLM emits NPC `hooks` keyed by
   *  these ids when an NPC's coin flip lands on `cares: "class"`. */
  classIds: string[]
  /** Species ids the world supports. Same purpose as classIds, but
   *  for the `cares: "species"` axis. */
  speciesIds: string[]
}

/** Compact pool entry handed to the LLM so it can pick curated
 *  loot drops thematically — id + name + kind so the model knows
 *  what kinds of item exist without the full stat block. */
export interface AreaGenItemPoolEntry {
  id: string
  name: string
  kind: string
}

function formatShapeRooms(rooms: AreaGenShapeRoom[]): string {
  return rooms
    .map((r, i) => {
      const hint = r.hint ? ` — ${r.hint}` : ''
      return `${i + 1}. ${r.type} at (${r.x},${r.y},${r.z})${hint}`
    })
    .join('\n')
}

function formatMobPool(pool: AreaGenMobPoolEntry[]): string {
  if (pool.length === 0) return '(none)'
  return pool
    .map((m) => {
      const lvl = typeof m.level === 'number' ? ` (level ${m.level})` : ''
      return `- ${m.id}: ${m.name}${lvl}`
    })
    .join('\n')
}

function formatItemPool(pool: AreaGenItemPoolEntry[]): string {
  if (pool.length === 0) return '(none)'
  return pool.map((i) => `- ${i.id}: ${i.name} [${i.kind}]`).join('\n')
}

function formatIdList(ids: string[]): string {
  if (ids.length === 0) return '(none)'
  return ids.map((id) => `- ${id}`).join('\n')
}

/** Room types where a fixed NPC reads as plausible. Mobs and dungeon
 *  rooms aren't a place to find a chatty informant. Mirrored in the
 *  parser and in payloadToArea so a hallucinated NPC in an unfit room
 *  gets dropped rather than baked into the area. */
const NPC_FRIENDLY_ROOM_TYPES: readonly RoomType[] = [
  'safe',
  'inn',
  'shrine',
  'shop',
  'water',
  'entrance',
]

export function isNPCFriendlyRoomType(t: RoomType): boolean {
  return (NPC_FRIENDLY_ROOM_TYPES as readonly string[]).includes(t)
}

const RARITY_LIST: readonly Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary']

function isRarity(v: unknown): v is Rarity {
  return typeof v === 'string' && (RARITY_LIST as readonly string[]).includes(v)
}

// Bespoke-mob parser. Accepts the shape the LLM emits under
// encounter.newMob and tightens it to a well-typed AreaGenBespokeMob.
// Returns null on any validation failure so the caller can fall back
// to mobId or the random pool — bespoke mobs are a bonus, not a
// load-bearing feature. Numbers are clamped to sane minimums so a
// mis-typed LLM response can't produce a 0-HP mob or negative stats.
function parseBespokeMob(v: unknown): AreaGenBespokeMob | null {
  if (!v || typeof v !== 'object') return null
  const m = v as Record<string, unknown>
  if (
    typeof m.id !== 'string' ||
    typeof m.name !== 'string' ||
    typeof m.description !== 'string' ||
    typeof m.maxHp !== 'number' ||
    typeof m.attack !== 'number' ||
    typeof m.defense !== 'number' ||
    typeof m.xpReward !== 'number' ||
    typeof m.level !== 'number'
  ) {
    return null
  }
  const id = m.id.trim()
  const name = m.name.trim()
  const description = m.description.trim()
  if (id.length === 0 || name.length === 0 || description.length === 0) return null
  const loot = parseBespokeLoot(m.loot)
  return {
    id,
    name,
    description,
    maxHp: Math.max(1, Math.round(m.maxHp)),
    attack: Math.max(0, Math.round(m.attack)),
    defense: Math.max(0, Math.round(m.defense)),
    xpReward: Math.max(1, Math.round(m.xpReward)),
    level: Math.max(1, Math.round(m.level)),
    ...(loot && loot.length > 0 ? { loot } : {}),
  }
}

// ---- NPC parser ---------------------------------------------------------

// Tightens the LLM's NPC payload into a well-typed AreaGenNPC. Returns
// null on any structural failure so the room just stays NPC-less rather
// than failing the whole area gen — fixed NPCs are flavor, not load-
// bearing. Strips empty/whitespace strings, drops hooks whose value is
// not a non-empty string, and tolerates an empty `regular` array (the
// runtime line picker falls back to `firstMeet` when there's nothing
// to rotate through).
function parseAreaGenNPC(v: unknown): AreaGenNPC | null {
  if (!v || typeof v !== 'object') return null
  const m = v as Record<string, unknown>
  if (
    typeof m.id !== 'string' ||
    typeof m.name !== 'string' ||
    typeof m.role !== 'string' ||
    typeof m.description !== 'string' ||
    typeof m.firstMeet !== 'string'
  ) {
    return null
  }
  if (m.cares !== 'class' && m.cares !== 'species') return null
  const id = m.id.trim()
  const name = m.name.trim()
  const role = m.role.trim()
  const description = m.description.trim()
  const firstMeet = m.firstMeet.trim()
  if (
    id.length === 0 ||
    name.length === 0 ||
    role.length === 0 ||
    description.length === 0 ||
    firstMeet.length === 0
  ) {
    return null
  }
  const hooks: Record<string, string> = {}
  if (m.hooks && typeof m.hooks === 'object') {
    for (const [k, hv] of Object.entries(m.hooks as Record<string, unknown>)) {
      if (typeof hv !== 'string') continue
      const trimmed = hv.trim()
      if (trimmed.length === 0) continue
      hooks[k.trim()] = trimmed
    }
  }
  const regular: string[] = []
  if (Array.isArray(m.regular)) {
    for (const line of m.regular) {
      if (typeof line !== 'string') continue
      const trimmed = line.trim()
      if (trimmed.length > 0) regular.push(trimmed)
    }
  }
  const out: AreaGenNPC = {
    id,
    name,
    role,
    description,
    cares: m.cares,
    hooks,
    firstMeet,
    regular,
  }
  // Frontier overrides are paired — include both or neither. If only
  // one is present the runtime would fall back to the missing side at
  // the wrong moment, which is worse than no frontier flavor at all.
  if (typeof m.frontierUnknown === 'string' && typeof m.frontierKnown === 'string') {
    const fu = m.frontierUnknown.trim()
    const fk = m.frontierKnown.trim()
    if (fu.length > 0 && fk.length > 0) {
      out.frontierUnknown = fu
      out.frontierKnown = fk
    }
  }
  return out
}

// ---- Curated loot + bespoke item parsers --------------------------------

function parseCuratedLoot(v: unknown): AreaGenCuratedLoot | null {
  if (!v || typeof v !== 'object') return null
  const raw = v as { gold?: unknown; items?: unknown }
  const out: AreaGenCuratedLoot = {}
  if (raw.gold && typeof raw.gold === 'object') {
    const g = raw.gold as { min?: unknown; max?: unknown }
    if (typeof g.min === 'number' && typeof g.max === 'number') {
      const min = Math.max(0, Math.round(g.min))
      const max = Math.max(min, Math.round(g.max))
      out.gold = { min, max }
    }
  }
  if (Array.isArray(raw.items)) {
    const items: AreaGenCuratedItem[] = []
    for (const item of raw.items) {
      if (!item || typeof item !== 'object') continue
      const parsed = parseCuratedItem(item)
      if (parsed) items.push(parsed)
    }
    if (items.length > 0) out.items = items
  }
  // Reject entirely-empty loot overrides — an empty override would
  // silently replace the mob's archetype loot with nothing, which is
  // worse than just omitting the override.
  if (out.gold === undefined && (!out.items || out.items.length === 0)) return null
  return out
}

function parseCuratedItem(v: unknown): AreaGenCuratedItem | null {
  if (!v || typeof v !== 'object') return null
  const raw = v as {
    itemId?: unknown
    newItem?: unknown
    rarity?: unknown
    qty?: unknown
    level?: unknown
  }
  const rarity = isRarity(raw.rarity) ? { rarity: raw.rarity } : {}
  const qty = typeof raw.qty === 'number' && raw.qty > 0 ? { qty: Math.max(1, Math.round(raw.qty)) } : {}
  const level = typeof raw.level === 'number' ? { level: Math.max(1, Math.round(raw.level)) } : {}
  const bespoke = parseBespokeItem(raw.newItem)
  if (bespoke) {
    return { newItem: bespoke, ...rarity, ...qty, ...level }
  }
  if (typeof raw.itemId === 'string' && raw.itemId.trim().length > 0) {
    return { itemId: raw.itemId.trim(), ...rarity, ...qty, ...level }
  }
  return null
}

function parseBespokeItem(v: unknown): AreaGenBespokeItem | null {
  if (!v || typeof v !== 'object') return null
  const m = v as Record<string, unknown>
  if (
    typeof m.id !== 'string' ||
    typeof m.name !== 'string' ||
    typeof m.description !== 'string' ||
    (m.kind !== 'junk' && m.kind !== 'equipment')
  ) {
    return null
  }
  const id = m.id.trim()
  const name = m.name.trim()
  const description = m.description.trim()
  if (id.length === 0 || name.length === 0 || description.length === 0) return null
  const base: AreaGenBespokeItem = {
    id,
    name,
    description,
    kind: m.kind,
  }
  if (typeof m.value === 'number') base.value = Math.max(0, Math.round(m.value))
  if (typeof m.weight === 'number') base.weight = Math.max(0, m.weight)
  if (typeof m.stackable === 'boolean') base.stackable = m.stackable

  if (m.kind === 'equipment') {
    const slot = parseEquipSlot(m.slot)
    if (!slot) return null
    base.slot = slot
    if (m.bonuses && typeof m.bonuses === 'object') {
      base.bonuses = parseEquipBonuses(m.bonuses as Record<string, unknown>)
    }
    if (m.hands === 1 || m.hands === 2) base.hands = m.hands
    if (m.requirements && typeof m.requirements === 'object') {
      base.requirements = parseEquipRequirements(m.requirements as Record<string, unknown>)
    }
  }
  return base
}

const EQUIP_SLOTS = [
  'weapon',
  'armor',
  'head',
  'arms',
  'hands',
  'legs',
  'feet',
  'cape',
  'amulet',
  'ring',
] as const

function parseEquipSlot(v: unknown): AreaGenBespokeItem['slot'] | null {
  if (typeof v !== 'string') return null
  return (EQUIP_SLOTS as readonly string[]).includes(v)
    ? (v as AreaGenBespokeItem['slot'])
    : null
}

function parseEquipBonuses(raw: Record<string, unknown>): NonNullable<AreaGenBespokeItem['bonuses']> {
  const out: NonNullable<AreaGenBespokeItem['bonuses']> = {}
  const keys: Array<keyof NonNullable<AreaGenBespokeItem['bonuses']>> = [
    'attack', 'defense', 'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma',
  ]
  for (const k of keys) {
    const v = raw[k]
    if (typeof v === 'number') out[k] = Math.round(v)
  }
  return out
}

function parseEquipRequirements(
  raw: Record<string, unknown>,
): NonNullable<AreaGenBespokeItem['requirements']> {
  const out: NonNullable<AreaGenBespokeItem['requirements']> = {}
  const keys: Array<keyof NonNullable<AreaGenBespokeItem['requirements']>> = [
    'level', 'strength', 'dexterity', 'intelligence', 'wisdom',
  ]
  for (const k of keys) {
    const v = raw[k]
    if (typeof v === 'number') out[k] = Math.max(1, Math.round(v))
  }
  return out
}

// ---- Existing bespoke-mob loot parser (kept separate — different shape) --

function parseBespokeLoot(v: unknown): AreaGenBespokeMob['loot'] | null {
  if (!Array.isArray(v)) return null
  const out: NonNullable<AreaGenBespokeMob['loot']> = []
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue
    const e = raw as Record<string, unknown>
    const chance = typeof e.chance === 'number' ? Math.max(0, Math.min(1, e.chance)) : null
    if (chance === null) continue
    if (e.kind === 'gold' && typeof e.min === 'number' && typeof e.max === 'number') {
      const min = Math.max(0, Math.round(e.min))
      const max = Math.max(min, Math.round(e.max))
      out.push({ kind: 'gold', chance, min, max })
    } else if (e.kind === 'item' && typeof e.itemId === 'string' && e.itemId.trim().length > 0) {
      const entry: { kind: 'item'; itemId: string; chance: number; min?: number; max?: number } = {
        kind: 'item',
        itemId: e.itemId.trim(),
        chance,
      }
      if (typeof e.min === 'number') entry.min = Math.max(1, Math.round(e.min))
      if (typeof e.max === 'number') {
        entry.max = Math.max(entry.min ?? 1, Math.round(e.max))
      }
      out.push(entry)
    }
  }
  return out
}

// Shape-first area generation. v3 added curated-encounter refs by id.
// v4 added bespoke mobs. v5 added curated per-room loot overrides
// (including bespoke items via inline `newItem`). v6 adds optional
// fixed NPCs in welcoming rooms (safe / inn / shrine / shop / water /
// entrance). Older cached payloads (v2..v5) still parse — every new
// field is optional.
export const areaGenTemplate: PromptTemplate<AreaGenParams, AreaGenPayload> = {
  id: 'areaGen',
  version: '7',
  kind: 'location',
  defaultSystemTemplate: `You generate flavor (names + short descriptions) for new explorable areas in a {{worldId}} world.{{worldContext}}
The character is a level {{characterLevel}} {{characterClass}} named {{characterName}}.
They are stepping out of "{{fromAreaName}}" through an exit called "{{fromExitName}}" into a new area of kind: {{areaKind}}.
This area targets level {{areaLevel}} — 2-3 levels above the character. Generated content should be aspirational: mobs and loot are tougher and more rewarding than the player's home turf.
Allowed concepts: {{allowedConcepts}}.
Forbidden concepts: {{forbiddenConcepts}}.

The area's layout (room positions and room types) is FIXED. You do not choose coordinates or types. You only name and describe each room, plus name and describe the area itself.

The rooms, in order, are:
{{roomsList}}

Available mobs (pick from these ids when adding a curated encounter):
{{mobPoolList}}

Available items (pick from these ids for curated loot drops; kind = junk/consumable/equipment/scroll):
{{itemPoolList}}

Class ids (use these as keys in an NPC's "hooks" map when the NPC's "cares" is "class"):
{{classIdList}}

Species ids (use these as keys in an NPC's "hooks" map when the NPC's "cares" is "species"):
{{speciesIdList}}

Respond with compact JSON in this exact shape:
{"id": string, "name": string, "description": string, "rooms": [{"name": string, "description": string, "encounter"?: (REF | NEW), "npc"?: NPC}]}

An encounter is EITHER a reference to an existing mob (REF), OR a new bespoke mob (NEW). Pick exactly one mob variant per encounter. Both REF and NEW may ALSO carry an optional curated-loot override under "loot".

REF shape:
{"mobId": string, "rarity": "common"|"uncommon"|"rare"|"epic"|"legendary", "firstOnly"?: boolean, "loot"?: CuratedLoot}

NEW shape (for unique foes the existing pool can't express):
{"newMob": {"id": string, "name": string, "description": string, "maxHp": number, "attack": number, "defense": number, "xpReward": number, "level": number, "loot"?: [MobLootEntry]}, "rarity": "common"|"uncommon"|"rare"|"epic"|"legendary", "firstOnly"?: boolean, "loot"?: CuratedLoot}

MobLootEntry is EITHER {"kind":"gold","chance":number,"min":number,"max":number} OR {"kind":"item","itemId":string,"chance":number,"min"?:number,"max"?:number}. (This is the BACKGROUND loot table on the mob itself, rolled on every kill of that archetype anywhere.)

CuratedLoot (the per-ROOM override, guaranteed on defeat):
{"gold"?: {"min": number, "max": number}, "items"?: [CuratedItem]}

CuratedItem is EITHER a by-id reference or an inline bespoke item:
REF: {"itemId": string, "rarity"?: Rarity, "qty"?: number, "level"?: number}
NEW: {"newItem": BespokeItem, "rarity"?: Rarity, "qty"?: number, "level"?: number}

BespokeItem:
{"id": string, "name": string, "description": string, "kind": "junk"|"equipment", "value"?: number, "stackable"?: boolean, "weight"?: number, "slot"?: "weapon"|"armor"|"head"|"arms"|"hands"|"legs"|"feet"|"cape"|"amulet"|"ring", "bonuses"?: {"attack"?: number, "defense"?: number, "strength"?: number, "dexterity"?: number, "constitution"?: number, "intelligence"?: number, "wisdom"?: number, "charisma"?: number}, "hands"?: 1|2, "requirements"?: {"level"?: number, "strength"?: number, "dexterity"?: number, "intelligence"?: number, "wisdom"?: number}}

NPC (a fixed flavor character standing in a room):
{"id": string, "name": string, "role": string, "description": string, "cares": "class"|"species", "hooks": {[id]: string}, "firstMeet": string, "regular": [string], "frontierUnknown"?: string, "frontierKnown"?: string}

Rules:
- id: short kebab-case slug (e.g. "forsaken-hollow").
- name: 1-4 words, thematically keyed off the exit name "{{fromExitName}}" and area kind "{{areaKind}}".
- description: 1-2 sentences establishing mood for the whole area.
- rooms: MUST be exactly {{roomCount}} entries, in the same order as the list above. Entry i describes room i.
- Each room name is 1-4 words. Each room description is 1-2 sentences.
- Let each room's type and hint guide its flavor: a "chamber" hinted as "boss chamber" should read as a climactic room; a "corridor" hinted as "road / trail" should read like a wilderness path; a "safe" hinted as "town plaza" should feel like a civic hub.
- Stay consistent with {{areaKind}} tone: settlements feel civic and lived-in, wilderness feels outdoor and sparse, dungeons feel descending and ominous, ruins feel fragmentary and weathered.
- Encounter guidance (OPTIONAL — most rooms omit it):
  * Add "encounter" on a room only when its hint clearly calls for a specific foe (a boss chamber, a chest-guardian, a themed ambush). Quiet rooms, safe rooms, corridors, and plaza-style safe hubs MUST omit it.
  * rarity must be one of: common, uncommon, rare, epic, legendary. Pick rarity to match the room's weight: boss / terminal chambers are rare+, chest antechambers are uncommon, ambient ambushes are common.
  * firstOnly: true for boss-style one-shot encounters (so the boss doesn't respawn after defeat). Omit or set false for ambient fixtures that should always be present when the room is entered.
  * At most one or two curated encounters per area. Never more than half the rooms.
  * Never put an encounter in a "safe" room — those are downtime hubs.
- REF vs NEW (mobs):
  * PREFER REF. Only use NEW when the pool has no mob that fits the room's hint thematically (e.g. a dungeon boss chamber when the pool contains only rats and wolves).
  * If you use REF, mobId MUST be one of the available mob ids listed above. Do not invent a mobId in REF form.
  * If you use NEW, its id must be a new kebab-case slug not already in the pool. Target area level {{areaLevel}} for stats: maxHp ≈ areaLevel * 8, attack ≈ areaLevel * 2, defense ≈ areaLevel, xpReward ≈ areaLevel * 3, level = {{areaLevel}} (± 1 for variety). Rarity multiplies from that baseline: uncommon ≈ ×1.3, rare ≈ ×1.6, epic ≈ ×2, legendary ≈ ×3.
  * A bespoke NEW mob is cached and reused — a later generation in the same world may reference it in REF form. Pick names and descriptions that a future area could plausibly reuse.
- Curated loot (OPTIONAL — encounter-level "loot" field):
  * Add curated loot ONLY on rare+ or firstOnly encounters. A plain ambient common fixture should use the mob's default loot table (no override).
  * Gold range should match the mob's threat: rare boss ≈ 50-200 gold, epic boss ≈ 200-800, legendary ≈ 800-3000+. Common/uncommon curated ≈ 10-100.
  * 1-3 items per loot table. More than that feels like a vendor dump, not a drop.
  * PREFER REF for items — reuse existing ids from the item pool. Use NEW (bespoke items) only when the pool doesn't have a thematic fit.
  * Bespoke items: kind must be "junk" or "equipment" (consumables and scrolls are not supported as bespoke yet). Equipment requires "slot" and "bonuses". Scale bonuses to area level {{areaLevel}}: roughly areaLevel / 2 each for attack/defense at common rarity, then rarity multiplies (rare ≈ ×1.5, legendary ≈ ×2.5).
  * Rarity on a curated item is OPTIONAL — set it for a named-item drop ("the Marrow Lord's crown is always legendary"), omit for ambient pool items where the usual rarity roll is fine.
- NPC guidance (OPTIONAL — most rooms omit it):
  * Add an "npc" only on rooms with one of these types: safe, inn, shrine, shop, water, entrance. NEVER place an NPC in a corridor, chamber, crypt, storage, portal, or exit room — they read as out of place there and the install pass will drop them anyway.
  * At most ONE NPC per area on a wilderness, dungeon, or ruin (a hermit, a wandering survivor, a shrine-keeper). Settlements may carry up to TWO. Never more.
  * Most rooms have no NPC. NPCs are flavor accents, not fixtures on every safe tile.
  * id: kebab-case slug, unique among NPCs in this area.
  * name: 1-3 words, fitting {{worldId}} naming conventions.
  * role: a single short noun phrase ("retired city guard", "dock-side mender") — shapes voice, not displayed verbatim.
  * description: 1-2 sentences for what the character sees.
  * cares: flip a coin, pick exactly one — "class" OR "species". Each NPC reacts to ONE axis only.
  * hooks: a short greeting fragment per id on the chosen axis, used to color the first meeting. If cares is "class", hooks MUST be keyed by class ids from the list above; if "species", by species ids. Provide a hook for EVERY id in the chosen axis (the engine falls through to a hookless first meet for any missing key, which feels like the NPC didn't notice the player). Each hook is 4-15 words, not a full sentence — it gets prepended to firstMeet.
  * firstMeet: 1-2 sentences that introduce the NPC and give one piece of local lay-of-the-land — what part of the area they know best, what's nearby, who lives here. This line plays once.
  * regular: 2-4 distinct lines (1-2 sentences each), each a different small observation, rumor, or warning. The engine rotates through them on subsequent visits. Each line should READ as if days have passed since the last meeting — references like "still here, eh?" are good.
  * frontierUnknown / frontierKnown: include BOTH or NEITHER. Include them when the NPC's room neighbors an exit room (look at the layout above; an "exit" type at an adjacent (x,y,z) within 2 tiles counts). frontierUnknown is what the NPC says when the exit's destination hasn't been generated yet — phrase it as warning about an unknown route ("there is an exit to an unknown destination, and I would not walk it lightly"). frontierKnown contains a literal "{areaName}" placeholder the engine substitutes once that exit resolves to a named area ("they say {areaName} lies down that way — bring rope").
  * Voice: the NPC speaks IN VOICE — first person, no narration around it. Don't write "Harwick says: 'hello'." Write "Hello, traveler. I'm Harwick — used to walk the city wall before my knees gave out."
  * Tone discipline: every NPC line (firstMeet, hooks, regular, frontierUnknown, frontierKnown) MUST stay inside the "Allowed concepts" list above and MUST NOT mention any item from the "Forbidden concepts" list. NPCs are baked once and replayed forever, so a single tone-breaking word ("chrome" in a fantasy world, "spell" in a sci-fi world) poisons the cached area permanently. When in doubt, choose plainer words from the world's allowed vocabulary.`,
  systemPlaceholders: [
    'worldId',
    'characterName',
    'characterLevel',
    'characterClass',
    'areaLevel',
    'fromAreaName',
    'fromExitName',
    'areaKind',
    'allowedConcepts',
    'forbiddenConcepts',
    'worldContext',
    'roomsList',
    'roomCount',
    'mobPoolList',
    'itemPoolList',
    'classIdList',
    'speciesIdList',
  ],
  systemValues(params, ctx) {
    return {
      worldId: params.worldId,
      characterName: params.characterName,
      characterLevel: String(params.characterLevel),
      characterClass: params.characterClass,
      areaLevel: String(params.areaLevel),
      fromAreaName: params.fromAreaName,
      fromExitName: params.fromExitName,
      areaKind: params.areaKind,
      allowedConcepts: listOr(params.allowedConcepts, '(none listed)'),
      forbiddenConcepts: listOr(params.forbiddenConcepts, '(none)'),
      worldContext: contextLine(ctx.world),
      roomsList: formatShapeRooms(params.rooms),
      roomCount: String(params.rooms.length),
      mobPoolList: formatMobPool(params.mobPool),
      itemPoolList: formatItemPool(params.itemPool),
      classIdList: formatIdList(params.classIds),
      speciesIdList: formatIdList(params.speciesIds),
    }
  },
  worldIdOf(params) {
    return params.worldId
  },
  user(params) {
    return (
      `Name and describe a new ${params.areaKind} connected to "${params.fromAreaName}" via the exit "${params.fromExitName}". ` +
      `Character: level ${params.characterLevel} ${params.characterClass} named ${params.characterName}. ` +
      `Target area level: ${params.areaLevel}. ` +
      `Emit exactly ${params.rooms.length} rooms in order.`
    )
  },
  parse(content) {
    const data = JSON.parse(extractJson(content)) as Partial<AreaGenPayload>
    if (
      typeof data.id !== 'string' ||
      typeof data.name !== 'string' ||
      typeof data.description !== 'string' ||
      !Array.isArray(data.rooms)
    ) {
      throw new Error('Expected JSON with string "id", "name", "description", and array "rooms".')
    }
    const rooms: AreaGenRoomFlavor[] = data.rooms.map((r) => {
      if (typeof r.name !== 'string' || typeof r.description !== 'string') {
        throw new Error('Each room must have name and description (string).')
      }
      const flavor: AreaGenRoomFlavor = {
        name: r.name.trim(),
        description: r.description.trim(),
      }
      // Encounter is optional. Bad shapes get silently dropped rather
      // than failing the whole area gen — a missing curated encounter
      // is a graceful degrade to the random pool; a thrown error would
      // throw out the whole area. Two variants accepted: `mobId`
      // (reference an existing mob) or `newMob` (bespoke mob that will
      // be installed into the world pool). If both are somehow present,
      // `newMob` wins — the LLM explicitly chose to invent something.
      const enc = (r as { encounter?: unknown }).encounter
      if (enc && typeof enc === 'object') {
        const e = enc as {
          mobId?: unknown
          newMob?: unknown
          rarity?: unknown
          firstOnly?: unknown
          loot?: unknown
        }
        if (isRarity(e.rarity)) {
          const firstOnly = typeof e.firstOnly === 'boolean' ? { firstOnly: e.firstOnly } : {}
          const loot = parseCuratedLoot(e.loot)
          const lootField = loot ? { loot } : {}
          const bespoke = parseBespokeMob(e.newMob)
          if (bespoke) {
            flavor.encounter = { newMob: bespoke, rarity: e.rarity, ...firstOnly, ...lootField }
          } else if (typeof e.mobId === 'string' && e.mobId.trim().length > 0) {
            flavor.encounter = { mobId: e.mobId.trim(), rarity: e.rarity, ...firstOnly, ...lootField }
          }
        }
      }
      // NPC is optional, follows the same "drop silently on bad shape"
      // policy as encounter. A malformed NPC shouldn't tank the whole
      // area — the room just stays NPC-less.
      const npc = parseAreaGenNPC((r as { npc?: unknown }).npc)
      if (npc) flavor.npc = npc
      return flavor
    })
    if (rooms.length === 0) {
      throw new Error('Area must have at least one room.')
    }
    return {
      id: data.id.trim(),
      name: data.name.trim(),
      description: data.description.trim(),
      rooms,
    }
  },
}

// ---- mobGen (full mob generation) ----------------------------------------

export interface MobGenPayload {
  id: string
  name: string
  description: string
  maxHp: number
  attack: number
  defense: number
  xpReward: number
  level: number
}

export interface MobGenParams {
  worldId: string
  characterName: string
  characterLevel: number
  characterClass: string
  roomType: string
  areaName: string
  allowedConcepts: string[]
  forbiddenConcepts: string[]
}

export const mobGenTemplate: PromptTemplate<MobGenParams, MobGenPayload> = {
  id: 'mobGen',
  version: '1',
  kind: 'mob',
  defaultSystemTemplate: `You create new unique creatures/enemies for a {{worldId}} world.{{worldContext}}
Generate content appropriate for a level {{characterLevel}} {{characterClass}} named {{characterName}}.
Skew challenge toward {{characterClass}} characters.
The creature is encountered in a {{roomType}} room in the area "{{areaName}}".
Allowed concepts: {{allowedConcepts}}.
Forbidden concepts: {{forbiddenConcepts}}.
Respond only with compact JSON matching:
{"id": string, "name": string, "description": string, "maxHp": number, "attack": number, "defense": number, "xpReward": number, "level": number}
Rules:
- id is a short kebab-case slug.
- name is 1-3 words.
- description evokes look and attitude in 1-2 sentences.
- Stats should be scaled to character level: maxHp ~ level * 8, attack ~ level * 2, defense ~ level, xpReward ~ level * 3.
- level should be 2-3 above the character's level — generated encounters are aspirational, not safe.`,
  systemPlaceholders: [
    'worldId',
    'characterName',
    'characterLevel',
    'characterClass',
    'roomType',
    'areaName',
    'allowedConcepts',
    'forbiddenConcepts',
    'worldContext',
  ],
  systemValues(params, ctx) {
    return {
      worldId: params.worldId,
      characterName: params.characterName,
      characterLevel: String(params.characterLevel),
      characterClass: params.characterClass,
      roomType: params.roomType,
      areaName: params.areaName,
      allowedConcepts: listOr(params.allowedConcepts, '(none listed)'),
      forbiddenConcepts: listOr(params.forbiddenConcepts, '(none)'),
      worldContext: contextLine(ctx.world),
    }
  },
  worldIdOf(params) {
    return params.worldId
  },
  user(params) {
    return (
      `Create a unique creature for a ${params.roomType} room in "${params.areaName}". ` +
      `Character: level ${params.characterLevel} ${params.characterClass}.`
    )
  },
  parse(content) {
    const data = JSON.parse(extractJson(content)) as Partial<MobGenPayload>
    if (
      typeof data.id !== 'string' ||
      typeof data.name !== 'string' ||
      typeof data.description !== 'string' ||
      typeof data.maxHp !== 'number' ||
      typeof data.attack !== 'number' ||
      typeof data.defense !== 'number' ||
      typeof data.xpReward !== 'number' ||
      typeof data.level !== 'number'
    ) {
      throw new Error('Expected JSON with id, name, description (string) and maxHp, attack, defense, xpReward, level (number).')
    }
    return {
      id: data.id.trim(),
      name: data.name.trim(),
      description: data.description.trim(),
      maxHp: Math.max(1, Math.round(data.maxHp)),
      attack: Math.max(0, Math.round(data.attack)),
      defense: Math.max(0, Math.round(data.defense)),
      xpReward: Math.max(1, Math.round(data.xpReward)),
      level: Math.max(1, Math.round(data.level)),
    }
  },
}

// ---- itemGen (full item generation) --------------------------------------

export interface ItemGenBonuses {
  attack?: number
  defense?: number
}

export interface ItemGenPayload {
  id: string
  name: string
  description: string
  kind: ItemKind
  slot?: string
  weight?: number
  value?: number
  bonuses?: ItemGenBonuses
}

export interface ItemGenParams {
  worldId: string
  characterName: string
  characterLevel: number
  characterClass: string
  areaName: string
  allowedConcepts: string[]
  forbiddenConcepts: string[]
}

export const itemGenTemplate: PromptTemplate<ItemGenParams, ItemGenPayload> = {
  id: 'itemGen',
  version: '1',
  kind: 'item',
  defaultSystemTemplate: `You create new unique items for a {{worldId}} world.{{worldContext}}
Generate content appropriate for a level {{characterLevel}} {{characterClass}} named {{characterName}}.
Skew usefulness toward {{characterClass}} characters.
The item is found in the area "{{areaName}}".
Allowed concepts: {{allowedConcepts}}.
Forbidden concepts: {{forbiddenConcepts}}.
Respond only with compact JSON matching:
{"id": string, "name": string, "description": string, "kind": string, "slot": string | null, "weight": number, "value": number, "bonuses": {"attack": number, "defense": number} | null}
Rules:
- id is a short kebab-case slug.
- name is 1-3 words.
- description is 1 sentence.
- kind must be one of: "junk", "equipment".
- If kind is "equipment", slot must be one of: "weapon", "armor", "head", "arms", "hands", "legs", "feet", "cape", "amulet", "ring".
- If kind is "junk", slot should be null and bonuses should be null.
- weight is 1-10. value is 1-100.
- bonuses.attack and bonuses.defense should scale above character level (roughly (level+2)/2 each) — generated items are aspirational rewards.`,
  systemPlaceholders: [
    'worldId',
    'characterName',
    'characterLevel',
    'characterClass',
    'areaName',
    'allowedConcepts',
    'forbiddenConcepts',
    'worldContext',
  ],
  systemValues(params, ctx) {
    return {
      worldId: params.worldId,
      characterName: params.characterName,
      characterLevel: String(params.characterLevel),
      characterClass: params.characterClass,
      areaName: params.areaName,
      allowedConcepts: listOr(params.allowedConcepts, '(none listed)'),
      forbiddenConcepts: listOr(params.forbiddenConcepts, '(none)'),
      worldContext: contextLine(ctx.world),
    }
  },
  worldIdOf(params) {
    return params.worldId
  },
  user(params) {
    return (
      `Create a unique item found in "${params.areaName}". ` +
      `Character: level ${params.characterLevel} ${params.characterClass}.`
    )
  },
  parse(content) {
    const data = JSON.parse(extractJson(content)) as Partial<ItemGenPayload>
    if (
      typeof data.id !== 'string' ||
      typeof data.name !== 'string' ||
      typeof data.description !== 'string' ||
      typeof data.kind !== 'string'
    ) {
      throw new Error('Expected JSON with id, name, description, kind (string).')
    }
    return {
      id: data.id.trim(),
      name: data.name.trim(),
      description: data.description.trim(),
      kind: data.kind as ItemKind,
      slot: typeof data.slot === 'string' ? data.slot.trim() : undefined,
      weight: typeof data.weight === 'number' ? Math.max(1, data.weight) : 1,
      value: typeof data.value === 'number' ? Math.max(1, data.value) : 1,
      bonuses: data.bonuses
        ? {
            attack: typeof data.bonuses.attack === 'number' ? data.bonuses.attack : 0,
            defense: typeof data.bonuses.defense === 'number' ? data.bonuses.defense : 0,
          }
        : undefined,
    }
  },
}

// ---- registry ------------------------------------------------------------

export const TEMPLATES = {
  itemFlavor: itemFlavorTemplate,
  mobFlavor: mobFlavorTemplate,
  areaFlavor: areaFlavorTemplate,
  roomFlavor: roomFlavorTemplate,
  loreSnippet: loreSnippetTemplate,
  classTitle: classTitleTemplate,
  areaGen: areaGenTemplate,
  mobGen: mobGenTemplate,
  itemGen: itemGenTemplate,
} as const

export type TemplateId = keyof typeof TEMPLATES
