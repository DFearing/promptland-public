import type { Rarity } from './rarity'

// Maximum number of LLM-generated items of the same archetype kind
// per area per world per rarity tier. Adjust to taste.
export const ITEM_GENERATION_CAP: Partial<Record<Rarity, number>> = {
  common: 25,
  uncommon: 20,
  rare: 15,
  epic: 10,
  legendary: 5,
}

// Helper to check if the cap has been reached for a given category
export function isGenerationCapReached(
  existingCount: number,
  rarity: Rarity,
): boolean {
  const cap = ITEM_GENERATION_CAP[rarity] ?? 25
  return existingCount >= cap
}
