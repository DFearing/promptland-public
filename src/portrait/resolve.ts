// Item → SpriteDescriptor resolver.
//
// The portrait pipeline needs every wearable item to map to one of the
// finite descriptors in the cache. Item generation today produces
// open-ended LLM names ("Iron Shortsword", "Hooded Robe of the Adept"),
// so we run a keyword heuristic over `item.name` driven by the regex
// tables in `PORTRAIT_CONFIG.resolver`. Tweak the tables, not the code,
// when adding new vocabulary.
//
// Determinism guarantee: the resolver is pure on (item.name, item.rarity,
// slot, config) — same inputs, same descriptor, every time. That's what
// keeps the sprite cache hot.

import type { Rarity } from '../items/rarity'
import type { InventoryItem } from '../character/types'
import type { Material, PortraitSlot, SpriteDescriptor, Tone } from './descriptor'
import { PORTRAIT_CONFIG, type PortraitConfig } from './config'

/** Lower-cases name once and runs the slot's keyword tables in order.
 *  First match wins, which is why the config tables are ordered specific →
 *  generic ("tower shield" before "shield"). */
function matchKeyword<T extends string>(
  haystack: string,
  table: ReadonlyArray<readonly [pattern: string, value: T]> | undefined,
): T | undefined {
  if (!table) return undefined
  for (const [pattern, value] of table) {
    if (new RegExp(pattern, 'i').test(haystack)) return value
  }
  return undefined
}

function resolveMaterial(
  name: string,
  slot: PortraitSlot,
  cfg: PortraitConfig['resolver'],
): Material {
  return matchKeyword(name, cfg.materialKeywords) ?? cfg.fallbackMaterial[slot]
}

function resolveForm(
  name: string,
  slot: PortraitSlot,
  cfg: PortraitConfig['resolver'],
): string {
  return matchKeyword(name, cfg.formKeywords[slot]) ?? cfg.fallbackForm[slot]
}

function resolveTone(rarity: Rarity | undefined, cfg: PortraitConfig['resolver']): Tone {
  return cfg.toneByRarity[rarity ?? 'common']
}

/** Resolve an inventory item to its sprite-layer descriptor for the given
 *  portrait slot. The slot is passed explicitly because some logical item
 *  slots (`ring`) are excluded from the portrait but the caller still has
 *  to map e.g. `armor` → `'armor'` portrait slot.
 *
 *  Internally the keyword tables are typed as `string` because they're
 *  written as ordered (regex, form-token) pairs; the cast at the return
 *  bridges back to the narrow `SlotForm<S>` type. Per-slot fallback
 *  vocab in `SLOT_FORMS` keeps invalid forms out of the descriptor at
 *  config-edit time. */
export function resolveDescriptor(
  item: InventoryItem,
  slot: PortraitSlot,
  config: PortraitConfig['resolver'] = PORTRAIT_CONFIG.resolver,
): SpriteDescriptor {
  const name = item.name ?? ''
  const form = resolveForm(name, slot, config)
  return {
    slot,
    material: resolveMaterial(name, slot, config),
    form: form as SpriteDescriptor['form'],
    tone: resolveTone(item.rarity, config),
  }
}

/** The body-base layer is the underlying species/skin sprite — it has
 *  no item, so `material`/`form` are conventional ('cloth'/'humanoid').
 *  Tone is borrowed from the character's overall context (lighting); for
 *  v1 we just use 'muted'. Bump this when species + class layering lands. */
export function bodyBaseDescriptor(): SpriteDescriptor<'body-base'> {
  return { slot: 'body-base', material: 'cloth', form: 'humanoid', tone: 'muted' }
}
