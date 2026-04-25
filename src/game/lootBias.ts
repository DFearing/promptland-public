/**
 * Drop-bias layer: class + room-context swaps applied on top of a mob's
 * rolled loot table. Pure functions — given a candidate `ItemDef` and a
 * pool of alternatives from `world.items`, pick a better-fitting swap (or
 * keep the original) based on the player's class and the room the kill
 * happened in.
 *
 * Two separate biases run in sequence:
 *   1. **Class bias** — mages should see scrolls and INT/WIS gear most of
 *      the time; fighters/samurai/security should see physical weapons and
 *      STR/DEX gear. ~70% target fit for magical classes, ~65% for physical
 *      (~25-35% off-class stays as-is for variety).
 *   2. **Room context** — a zombie in a kitchen should drop kitchen gear
 *      (cleaver, rolling pin); a drone in a reactor should drop reactor
 *      gear. Room name keywords pick a context tag; items with matching
 *      id/name keywords become swap candidates.
 *
 * Junk and consumables are left alone — class/room bias would muddle
 * world flavor (a zombie's rat-tail is rat-tail regardless of class), and
 * the point of consumables is that they're universal.
 */

import type { RoomType } from '../areas/types'
import type { ItemDef } from '../items'
import type { Rng } from '../rng'

/** Broad class axis, derived from the character's class id. Keeps the
 *  bias resolution world-agnostic — we don't need to enumerate every
 *  per-world class name here, just its play style. */
export type ClassAxis = 'magical' | 'physical' | 'hybrid' | 'generalist'

/**
 * Maps each world's class ids to a broad combat axis. Kept as a plain
 * record rather than per-world imports because the bias is purely about
 * item *kind* preference (scroll vs weapon, INT vs STR) — the world
 * manifest itself doesn't surface that shape yet. Missing class ids fall
 * through to `'generalist'` (no bias). */
const CLASS_AXIS: Record<string, ClassAxis> = {
  // Fantasy
  mage: 'magical',
  cleric: 'hybrid',
  warrior: 'physical',
  rogue: 'physical',
  ranger: 'physical',
  // Cyberpunk
  netrunner: 'magical',
  techie: 'hybrid',
  samurai: 'physical',
  fixer: 'generalist',
  // Sci-fi
  science: 'magical',
  medic: 'hybrid',
  security: 'physical',
  engineer: 'hybrid',
  captain: 'generalist',
}

export function classAxisFor(classId: string | undefined): ClassAxis {
  if (!classId) return 'generalist'
  return CLASS_AXIS[classId] ?? 'generalist'
}

/** Per-axis target fit probability. Tuned so magical classes get
 *  magical loot ~70% of the time and physical classes get physical
 *  loot ~65% of the time — hybrid splits the difference, generalist
 *  doesn't bias. */
function axisTargetFit(axis: ClassAxis): number {
  switch (axis) {
    case 'magical':
      return 0.7
    case 'physical':
      return 0.65
    case 'hybrid':
      return 0.5
    case 'generalist':
    default:
      return 0
  }
}

/**
 * Scores an item for a class axis. Returns:
 *   - `'fit'` — item matches the axis (scroll for magical; STR/DEX
 *     weapon for physical; etc.).
 *   - `'off'` — item is clearly off-axis (STR weapon for mage, INT
 *     amulet for warrior).
 *   - `'neutral'` — armor and other slots that don't lean either way,
 *     or items with no bonus signals. Treated as-is (no swap pressure).
 *
 * `hybrid` accepts both kinds of fit — paladins / clerics / medics
 * want both the scroll and the mace.
 */
function itemAxisFit(def: ItemDef, axis: ClassAxis): 'fit' | 'off' | 'neutral' {
  if (axis === 'generalist') return 'neutral'
  // Scrolls are the clearest magical signal.
  if (def.kind === 'scroll') {
    return axis === 'magical' || axis === 'hybrid' ? 'fit' : 'off'
  }
  if (def.kind !== 'equipment') return 'neutral'
  const b = def.bonuses ?? {}
  const intVal = (b.intelligence ?? 0) + (b.wisdom ?? 0)
  const strVal = (b.strength ?? 0) + (b.dexterity ?? 0) + (b.attack ?? 0)
  const hasMagicSignal = intVal > 0
  const hasPhysicalSignal = strVal > 0
  // Weapons with damageFamily read physical unless their bonuses say
  // otherwise — a "carved staff" with +INT flags as magical because
  // of the stat bonus, not the family.
  const isWeapon = def.slot === 'weapon'
  if (axis === 'magical') {
    if (hasMagicSignal) return 'fit'
    if (isWeapon && hasPhysicalSignal && !hasMagicSignal) return 'off'
    if (hasPhysicalSignal && !hasMagicSignal) return 'off'
    return 'neutral'
  }
  if (axis === 'physical') {
    if (hasPhysicalSignal) return 'fit'
    if (hasMagicSignal && !hasPhysicalSignal) return 'off'
    return 'neutral'
  }
  // Hybrid — everything either fits or is neutral, nothing is strictly off.
  if (hasMagicSignal || hasPhysicalSignal) return 'fit'
  return 'neutral'
}

/** Keyword-driven context tags for a room. Name keywords trump
 *  `RoomType` because names are the flavor the player sees ("The
 *  Kitchen Hearth" reads kitchen whether it's a `chamber` or `safe`).
 *  `roomType` supplies a fallback crypt tag when the name is too
 *  generic to match but the type is unambiguous. Returned set may be
 *  empty — a generic corridor has no context. */
export function roomContextTags(
  roomName: string | undefined,
  roomType: RoomType | undefined,
): Set<string> {
  const tags = new Set<string>()
  if (!roomName && !roomType) return tags
  const n = (roomName ?? '').toLowerCase()
  // RoomType fallback — crypt rooms are crypt-flavor even when the
  // name is generic ("Chamber Three"). Shop rooms bias toward armory
  // and general gear. Additional name checks below can add more tags.
  if (roomType === 'crypt') tags.add('crypt')
  if (roomType === 'shop') tags.add('armory')
  if (roomType === 'shrine') tags.add('sacred')
  // Kitchen-adjacent
  if (/\b(kitchen|pantry|larder|mess|galley|hearth|oven|scullery)\b/.test(n))
    tags.add('kitchen')
  // Workshop / forge
  if (/\b(forge|smithy|workshop|foundry|anvil|bellows|chop[- ]?shop|machine[- ]?shop)\b/.test(n))
    tags.add('forge')
  // Library / study / archive
  if (/\b(library|study|archive|scriptorium|reading|scroll|writing|codex)\b/.test(n))
    tags.add('library')
  // Chapel / shrine
  if (/\b(chapel|shrine|sanctum|sanctuary|altar|temple|reliquary)\b/.test(n))
    tags.add('sacred')
  // Armory
  if (/\b(armor(y|ies)|arming|barracks|guard[- ]?post|watch)\b/.test(n))
    tags.add('armory')
  // Crypt / tomb / ossuary
  if (/\b(crypt|tomb|ossuary|barrow|catacomb|bone|grave|burial)\b/.test(n))
    tags.add('crypt')
  // Laboratory / reactor / tech
  if (/\b(lab|reactor|console|server|control|terminal|mainframe|drive[- ]?core|engine[- ]?room)\b/.test(n))
    tags.add('tech')
  // Medbay / medical
  if (/\b(med[- ]?bay|infirmary|clinic|ward|surgery|operating)\b/.test(n))
    tags.add('medical')
  // Alley / street / gutter (cyberpunk flavor)
  if (/\b(alley|street|gutter|backstreet|slum)\b/.test(n))
    tags.add('street')
  // Wilderness
  if (/\b(forest|wood|river|stream|bog|marsh|glade|path|trail|grove)\b/.test(n))
    tags.add('wilderness')
  return tags
}

/**
 * Item-side context tags. Derived from `id` + `name` keywords so we don't
 * have to back-fill a `tags` field on every item archetype. If a world
 * wants precise control later, an explicit `tags` field on `ItemDef` can
 * short-circuit this. Returns a set; empty for items with no keywords.
 */
function itemContextTags(def: ItemDef): Set<string> {
  const tags = new Set<string>()
  const s = `${def.id} ${def.name}`.toLowerCase()
  if (/\b(cleaver|rolling[- ]?pin|paring|knife|skillet|pot|ladle|kettle|bread|salt|pepper|apron)\b/.test(s))
    tags.add('kitchen')
  if (/\b(hammer|tongs|anvil|bellows|smith|wrench|solder|torch|wrench|tool|toolkit|forge)\b/.test(s))
    tags.add('forge')
  if (/\b(scroll|tome|codex|grimoire|book|journal|rune|sigil|datapad|databook)\b/.test(s))
    tags.add('library')
  if (/\b(amulet|shrine|prayer|rosary|ankh|relic|holy|blessed|censer|censor|chalice)\b/.test(s))
    tags.add('sacred')
  if (/\b(bone|skull|crypt|grave|ossuary|shroud|tomb)\b/.test(s))
    tags.add('crypt')
  if (/\b(med[- ]?foam|medfoam|medkit|medical|bandage|poultice|stim|stim[- ]?patch|hypospray|neural)\b/.test(s))
    tags.add('medical')
  if (/\b(laser|plasma|phaser|rifle|cutter|power[- ]?cell|coil|capacitor|circuit|data|chrome|drone|hull|mag[- ]?plate)\b/.test(s))
    tags.add('tech')
  if (/\b(armor|helm|vest|plate|cuirass|bracer|greaves|jerkin|shield|chain)\b/.test(s))
    tags.add('armory')
  if (/\b(sword|axe|mace|dagger|blade|spear|bow|pike|hammer)\b/.test(s))
    tags.add('armory')
  if (/\b(pelt|fur|hide|boot|cloak|feather|hunter|woodsman|trail|ranger|bow)\b/.test(s))
    tags.add('wilderness')
  if (/\b(baton|jacket|wire|scrap|ration|punk|riot|phone)\b/.test(s))
    tags.add('street')
  return tags
}

/** Check whether an item's tags overlap any of the target tags. */
function itemMatchesContext(def: ItemDef, targetTags: Set<string>): boolean {
  if (targetTags.size === 0) return false
  const itemTags = itemContextTags(def)
  for (const t of itemTags) if (targetTags.has(t)) return true
  return false
}

export interface BiasContext {
  classId?: string
  roomName?: string
  roomType?: RoomType
  /** World's item pool for swap candidates. Passed explicitly rather
   *  than pulled from a registry because loot rolls are called with a
   *  specific `WorldContent` in hand. */
  worldItems: ItemDef[]
  /** Probability a class-inappropriate equipment/scroll drop gets
   *  rerolled to a class-appropriate alternative. Absent ⇒ derived
   *  from the class axis. */
  classBias?: number
  /** Probability an equipment drop gets rerolled to a room-context
   *  match when tags are available. Absent ⇒ 0.5 when room tags exist,
   *  0 otherwise. */
  contextBias?: number
}

/**
 * Returns a potentially-swapped item id for a single equipment/scroll
 * drop. Junk/consumable drops pass through unchanged — flavor is more
 * important there than class/context fit.
 *
 * Bias pipeline:
 *   1. **Class bias** — if the item is off-axis for the player's class,
 *      roll `classBias` to swap for an axis-fitting alternative of the
 *      same `kind` (and, for equipment, the same `slot` when possible).
 *   2. **Room-context bias** — if the room has context tags and the
 *      item doesn't match, roll `contextBias` to swap for a tag-matching
 *      alternative of the same kind.
 *
 * Falls back to the original id if no suitable swap candidate exists or
 * the roll doesn't fire. Curated drops (explicit rarity/level) are not
 * routed through this function — those are authored intent.
 */
export function biasEquipmentDrop(
  itemId: string,
  ctx: BiasContext,
  rng: Rng,
): string {
  const def = ctx.worldItems.find((i) => i.id === itemId)
  if (!def) return itemId
  // Only equipment and scrolls route through the bias — junk and
  // consumables stay as rolled. Consumables in particular read as
  // "universal" (stim patches, healing draughts), and forcing a class
  // / context bias on them would muddle flavor.
  if (def.kind !== 'equipment' && def.kind !== 'scroll') return itemId

  const axis = classAxisFor(ctx.classId)

  // ── 1. Class bias ──────────────────────────────────────────────────
  const fit = itemAxisFit(def, axis)
  const classBias = ctx.classBias ?? axisTargetFit(axis)
  const classBiasRoll = rng.chance(classBias)
  if (fit === 'off' && classBias > 0 && classBiasRoll) {
    // Look for an axis-fitting replacement: same kind, same slot for
    // equipment (so armor stays armor, weapon stays weapon), different
    // id.
    const candidates = ctx.worldItems.filter((i) => {
      if (i.id === def.id) return false
      if (i.kind !== def.kind) return false
      if (i.kind === 'equipment' && def.kind === 'equipment') {
        // Hold slot constant on weapons (a mage-leaning swap for a
        // sword still wants a weapon, not an amulet). For armor slots,
        // preserving slot also keeps the auto-equip logic happy.
        if (i.slot !== def.slot) return false
      }
      return itemAxisFit(i, axis) === 'fit'
    })
    if (candidates.length > 0) {
      const picked = rng.pick(candidates)
      return runContextBias(picked, ctx, rng)
    }
  }

  return runContextBias(def, ctx, rng)
}

/** Second-pass room-context swap — runs after the class bias so the
 *  final drop is both class-appropriate and room-appropriate when
 *  possible. A kitchen-appropriate weapon for a mage is still a
 *  weapon, so we only swap if the context match doesn't overturn the
 *  class axis. */
function runContextBias(def: ItemDef, ctx: BiasContext, rng: Rng): string {
  const tags = roomContextTags(ctx.roomName, ctx.roomType)
  if (tags.size === 0) return def.id
  if (itemMatchesContext(def, tags)) return def.id
  const axis = classAxisFor(ctx.classId)
  const contextBias = ctx.contextBias ?? 0.5
  const contextRoll = rng.chance(contextBias)
  if (contextBias <= 0 || !contextRoll) return def.id
  const candidates = ctx.worldItems.filter((i) => {
    if (i.id === def.id) return false
    if (i.kind !== def.kind) return false
    if (i.kind === 'equipment' && def.kind === 'equipment') {
      if (i.slot !== def.slot) return false
    }
    if (!itemMatchesContext(i, tags)) return false
    // Don't let the room context drag us back off-axis — if the item
    // we're swapping *from* was class-fit, keep the replacement fit
    // too. "Off" vs "neutral" both pass here; only dropping from
    // `fit` to `off` is forbidden.
    if (itemAxisFit(def, axis) === 'fit' && itemAxisFit(i, axis) === 'off')
      return false
    return true
  })
  if (candidates.length === 0) return def.id
  const picked = rng.pick(candidates)
  return picked.id
}
