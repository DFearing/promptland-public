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

// ---- registry ------------------------------------------------------------

export const TEMPLATES = {
  itemFlavor: itemFlavorTemplate,
  mobFlavor: mobFlavorTemplate,
  areaFlavor: areaFlavorTemplate,
  roomFlavor: roomFlavorTemplate,
  loreSnippet: loreSnippetTemplate,
  classTitle: classTitleTemplate,
} as const

export type TemplateId = keyof typeof TEMPLATES
