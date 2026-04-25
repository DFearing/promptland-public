import type { WorldContextDefaults } from '../../llm/templates'

// Code-authored LLM prompt context for the cyberpunk world. Empty strings
// render as nothing; fill in the ones that matter. Step (a) of the plan
// populates these with actual authored guidance.
export const CYBERPUNK_CONTEXT: WorldContextDefaults = {
  world: '',
  rarity: {},
  item: {
    junk: { any: '' },
    consumable: { any: '' },
    equipment: { any: '' },
    scroll: { any: '' },
  },
  mob: { any: '' },
  area: {
    settlement: { any: '' },
    wilderness: { any: '' },
    dungeon: { any: '' },
    ruin: { any: '' },
  },
  room: {
    safe: { any: '' },
    corridor: { any: '' },
    chamber: { any: '' },
    crypt: { any: '' },
    storage: { any: '' },
  },
  lore: { any: '' },
}
