// Runtime filter resolution — InventoryItem → list of filter specs.
//
// The descriptor cache stores plain silhouette pixels. Everything that
// makes a particular *instance* of an item feel distinct (rarity outline,
// elemental tint, enchant glow, durability wear) is overlaid at render
// time as a PixiJS filter. Keeping these out of the cache key is what
// makes the sprite library finite — see `descriptor.ts` for the
// rationale.
//
// This module is pure: it returns filter *specs* (plain data) and lets
// the React/PixiJS renderer instantiate the actual `Filter` objects.
// Pure spec → Filter splits the lifecycle (PixiJS Filters need to be
// destroyed on unmount) cleanly from the resolution logic (which is
// just config lookups).

import type { InventoryItem } from '../character/types'
import type { Rarity } from '../items/rarity'
import { PORTRAIT_CONFIG, type PortraitConfig } from './config'

export type RuntimeFilterSpec =
  | { kind: 'rarity-outline'; tier: Rarity; color: string; thickness: number }
  | { kind: 'elemental-tint'; element: ElementKey; color: number; intensity: number }
  | { kind: 'enchant-glow'; pulseSpeedMs: number; maxStrength: number }
  | { kind: 'durability-wear'; ratio: number }

export type ElementKey = 'fire' | 'frost' | 'shock' | 'shadow' | 'arcane' | 'holy'

/** Forward-looking type for items that eventually carry elemental flavor.
 *  Today no item has these fields — the resolver still works, just
 *  returns no elemental/enchant filters. When the item schema grows
 *  these fields, callers populate the hints argument and the resolver
 *  picks them up. */
export interface ItemFlavorHints {
  /** Inferred or LLM-tagged element keyword. */
  element?: ElementKey
  /** Whether the item carries an "enchanted" badge — drives the pulse glow. */
  enchanted?: boolean
  /** 0-1 durability ratio. 1 = pristine, 0 = broken. */
  durability?: number
}

/** Resolve the filter list for one equipped item. Order matters: outline
 *  goes first so it sits underneath the tint, glow last so it pulses on
 *  top. */
export function resolveFiltersForItem(
  item: InventoryItem,
  config: PortraitConfig['filters'] = PORTRAIT_CONFIG.filters,
  hints: ItemFlavorHints = {},
): RuntimeFilterSpec[] {
  const out: RuntimeFilterSpec[] = []

  if (config.rarityOutline.enabled) {
    const tier: Rarity = item.rarity ?? 'common'
    out.push({
      kind: 'rarity-outline',
      tier,
      color: config.rarityOutline.colorByTier[tier],
      thickness: config.rarityOutline.thickness,
    })
  }

  if (config.elementalTint.enabled && hints.element) {
    out.push({
      kind: 'elemental-tint',
      element: hints.element,
      color: config.elementalTint.colorByElement[hints.element],
      intensity: config.elementalTint.intensity,
    })
  }

  if (config.enchantGlow.enabled && hints.enchanted) {
    out.push({
      kind: 'enchant-glow',
      pulseSpeedMs: config.enchantGlow.pulseSpeedMs,
      maxStrength: config.enchantGlow.maxStrength,
    })
  }

  if (
    config.durabilityWear.enabled &&
    typeof hints.durability === 'number' &&
    hints.durability < config.durabilityWear.crackThreshold
  ) {
    out.push({ kind: 'durability-wear', ratio: hints.durability })
  }

  return out
}
