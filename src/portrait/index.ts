// Portrait layer system — issue #75.
//
// Public surface for callers (CharacterViewport, dev panels, future
// portrait Settings tab). Tweakable knobs all live in `config.ts`'s
// `PORTRAIT_CONFIG` — change there, not at the call site.
//
// Decisions still open (see issue #75):
//   - #3: cache scope (IndexedDB-only vs. shared server cache)

export type {
  PortraitSlot,
  Tone,
  Material,
  SpriteDescriptor,
  SlotForm,
  RuntimeFilter,
} from './descriptor'

export {
  PORTRAIT_SLOTS,
  TONES,
  MATERIALS,
  SLOT_MATERIALS,
  SLOT_FORMS,
  descriptorKey,
} from './descriptor'

export type { SlotBBox } from './rig'
export { RIG_VERSION, CANVAS_PX, DISPLAY_PX, ANCHOR_PX, Z_ORDER, SLOT_BBOX } from './rig'

export type { PortraitConfig } from './config'
export { PORTRAIT_CONFIG } from './config'

export { compileSpritePrompt } from './prompt'
export { resolveDescriptor, bodyBaseDescriptor } from './resolve'

export type { ItemFlavorHints, RuntimeFilterSpec, ElementKey } from './filters'
export { resolveFiltersForItem } from './filters'

export type { PortraitCacheDeps } from './cache'
export { createPortraitCache, getOrGenerate, lookupCached, ImageGenError } from './cache'

export { default as PortraitLayers } from './PortraitLayers'
