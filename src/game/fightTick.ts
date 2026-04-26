import { roomKey, visitedKey, type Position } from '../areas'
import type { Character, DeathRecord } from '../character'
import { formatActorName } from '../character'
import {
  ascendSeverity,
  damageVerb,
  deathClause,
  deathSentence,
  formatAttackLog,
  levelScaleIncoming,
  levelScaleOutgoing,
  pickVerb,
  type DamageFamily,
} from '../combat'
import { applyCondition, applyMobCondition, tickConditions } from '../conditions'
import { type ScrollLevel } from '../items'
import type { DamageSeverity, LogEntry } from '../log'
import { mobResistMultiplier, type Mob } from '../mobs'
import { castSpell, getSpell } from '../spells'
import { Rng } from '../rng'
import { getWorldManifest, type WorldContent } from '../worlds'
import { maybeAutoConsume } from './consume'
import { combatBonuses } from './equip'
import { applyDeathPenalty } from './death'
import { satisfy } from './drives'
import {
  blessingSeverityFloor,
  blessingXpMultiplier,
  canDeathSave,
  deityWord as favorDeityWord,
} from './favor'
import {
  formatCombinedKillLog,
  formatMobDefeatLog,
  formatMobSelfHealLog,
} from './logLines'
import {
  applyDrops,
  combatRewardMult,
  resolveChestDrops,
  rollCuratedLoot,
  rollDropRarity,
  rollLoot,
  type RewardContext,
} from './loot'
import { applyXp } from './leveling'
import { append } from './logCap'
import { stampWeight } from './navigation'
import {
  CHEST_BASE_TICKS,
  CHEST_MAX_TICKS,
  CHEST_PER_ITEM_TICKS,
  appendDropLogs,
  trackBaddest,
} from './encounter'
import { AREA_GEN_TIMEOUT_TICKS, type Playing } from './tick'
import { findArea, getArea, getItem } from './worldLookup'

// ---- shared utility (duplicate; the explore-side trap and combat both
// need a stat-mod helper, so each module carries its own to avoid a
// cross-import for a 3-line function) -----------------------------------
function mod(stat: number): number {
  return Math.floor((stat - 10) / 2)
}

function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Class ids that open combat with a stealth check — rogues and rangers
 *  (and world equivalents) get the first-round advantage if the roll hits.
 *  Keyed by class id so any world whose class shares an id benefits. */
const STEALTH_CLASS_IDS: readonly string[] = ['rogue', 'ranger']

/**
 * Rolls a DEX-based stealth check for rogue/ranger classes. Returns true
 * when the character surprises the mob, which callers fold into a
 * character-side ambush (first round free + bonus damage).
 *
 *   success_chance = 0.25 + (DEX - 10) * 0.05, clamped to [0.1, 0.8]
 *
 * So a mid-game DEX 14 rogue ambushes ~45 % of the time, a DEX 18 endgame
 * rogue creeps up to ~65 %, and a low-DEX character bottoms out at 10 %.
 */
function rollStealthCheck(character: Character, rng: Rng): boolean {
  if (!STEALTH_CLASS_IDS.includes(character.classId)) return false
  const dex = character.stats.dexterity
  const chance = Math.max(0.1, Math.min(0.8, 0.25 + (dex - 10) * 0.05))
  return rng.chance(chance)
}

export type AmbushReason = 'stealth' | 'reversed'
export type AmbushResult = {
  side: 'character' | 'mob'
  ticksLeft: number
  reason?: AmbushReason
}

/**
 * For stealth-classed characters (rogue/ranger) only: when a mob would
 * ambush them, roll WIS to either spot the ambush (cancel it) or reverse
 * it (turn it into a character-side counter-ambush). WIS modifier scales
 * both rolls; non-stealth classes and WIS ≤ 10 skip both checks.
 *
 *   spotChance    = min(0.5,  wisMod × 0.10)
 *   reverseChance = min(0.25, wisMod × 0.05)
 *
 * Returns null when the ambush is spotted (fight starts even-footed),
 * the original ambush when nothing fires, or a flipped character-side
 * ambush tagged `reason: 'reversed'` when WIS turns the tables.
 */
function applyWisAmbushBenefit(
  character: Character,
  ambush: AmbushResult,
  rng: Rng,
): AmbushResult | null {
  if (ambush.side !== 'mob') return ambush
  if (!STEALTH_CLASS_IDS.includes(character.classId)) return ambush
  const wisMod = Math.max(0, Math.floor((character.stats.wisdom - 10) / 2))
  if (wisMod === 0) return ambush
  const spotChance = Math.min(0.5, wisMod * 0.1)
  if (rng.chance(spotChance)) return null
  const reverseChance = Math.min(0.25, wisMod * 0.05)
  if (rng.chance(reverseChance)) {
    return { side: 'character', ticksLeft: ambush.ticksLeft, reason: 'reversed' }
  }
  return ambush
}

/**
 * Determines whether a fresh encounter starts with an ambush.
 * `ticksLeft: 1` budget reflects "one free strike" — after this tick
 * fades, the fight resumes normal turn-taking. Mob-side ambushes
 * targeting rogue/ranger classes are filtered through
 * `applyWisAmbushBenefit`, which can spot the ambush (no ambush) or flip
 * it into a character-side reversal.
 */
export function rollAmbush(
  character: Character,
  mobLevel: number,
  rng: Rng,
): AmbushResult | null {
  const delta = character.level - mobLevel
  if (delta >= 5) return { side: 'character', ticksLeft: 1 }
  if (delta <= -5) {
    return applyWisAmbushBenefit(character, { side: 'mob', ticksLeft: 1 }, rng)
  }
  // Stealth classes get the first-round jump if their DEX roll lands.
  // Checked before the generic 15 % roll so the stealth narrative wins.
  if (rollStealthCheck(character, rng)) {
    return { side: 'character', ticksLeft: 1, reason: 'stealth' }
  }
  const ambushRoll = rng.chance(0.15)
  if (ambushRoll) {
    // Coin flip, weighted toward the higher-level side.
    const charFavor = 0.5 + 0.05 * delta
    const charSide = rng.chance(charFavor)
    const side: 'character' | 'mob' = charSide ? 'character' : 'mob'
    return applyWisAmbushBenefit(character, { side, ticksLeft: 1 }, rng)
  }
  return null
}

/**
 * XP multiplier based on (mob level − character level). A mob at-level pays
 * its base xpReward; a tougher mob pays more, a weaker mob pays less. Caps
 * at +200 % / −90 % so farming green-con mobs is still possible (just slow)
 * and red-con kills feel genuinely rewarding.
 */
function xpScaleByDelta(delta: number): number {
  const clamped = Math.max(-10, Math.min(10, delta))
  if (clamped >= 0) return 1 + clamped * 0.2
  return Math.max(0.1, 1 + clamped * 0.12)
}

interface MobTickResult {
  mob: Mob
  entries: LogEntry[]
  /** Family of the DoT that landed the final tick before hp hit 0 —
   *  used by resolveMobDefeat to pick a flavored "X is reduced to ash"
   *  line instead of the generic "X falls". Undefined when no DoT
   *  killed the mob (either no DoTs fired this tick or none zeroed hp). */
  killFamily?: DamageFamily | 'poison'
}

// Mirrors tickConditions() for characters: applies DoT damage to a mob (capped
// so it can never reduce hp below 0) and decrements per-condition duration.
// stat-mod conditions don't currently alter mob combat stats — future work.
function tickMobConditions(
  mob: Mob,
  world: WorldContent,
  worldId: string,
  rng: Rng,
): MobTickResult {
  if (!mob.conditions || mob.conditions.length === 0) {
    return { mob, entries: [] }
  }
  const defs = new Map(world.conditions.map((d) => [d.id, d]))
  const entries: LogEntry[] = []
  let hp = mob.hp
  let killFamily: DamageFamily | 'poison' | undefined
  const next: typeof mob.conditions = []

  for (const active of mob.conditions) {
    const def = defs.get(active.id)
    if (!def) continue

    if (def.kind === 'dot') {
      // Snapshot override (set at application by a high-INT caster) wins
      // over the condition def's base — same rule as the character-side
      // tickConditions in conditions/engine.ts.
      const baseTickDmg = active.damagePerTickOverride ?? def.params.damagePerTick ?? 0
      // Element resist applies per tick — a fire elemental's resist makes
      // burning ticks fizzle even though the condition snapshot doesn't
      // know about the target. Floor at 1 when the base damage was
      // non-zero so a "barely resisted" tick still pings instead of
      // silently no-op'ing — matches how a fully-blocked physical hit
      // still draws the 1-DMG floor.
      const resistMult = mobResistMultiplier(mob, def.element)
      const scaled = Math.round(baseTickDmg * resistMult)
      const dmg = baseTickDmg > 0 && resistMult > 0 ? Math.max(1, scaled) : scaled
      if (dmg > 0 && hp > 0) {
        const taken = Math.min(dmg, hp)
        hp -= taken
        // Condition element (fire / ice / electric / earth / hack)
        // maps 1:1 to a damage family — a burning condition "scorches",
        // a freezing one "chills". Fall back to the world verb set
        // for conditions without an element (generic poison, bleed).
        const { verb } = damageVerb(taken, mob.maxHp, worldId, def.element, rng)
        const noun = def.noun ?? def.name.toLowerCase()
        const capNoun = noun.charAt(0).toUpperCase() + noun.slice(1)
        entries.push({
          kind: 'condition-tick',
          text: `${capNoun} ${verb} the ${mob.name}.`,
          amount: taken,
          conditionId: def.id,
          meta: {
            mobName: mob.name,
            mobRarity: mob.rarity,
            conditionName: def.name,
            element: def.element,
          },
        })
        // Track the kill family so resolveMobDefeat can flavor the
        // defeat line. "poison" gets its own flavor pool; anything
        // else routes by condition element (fire/ice/electric/…).
        // Poison conditions typically lack an element — use the
        // condition id as a last-resort signal.
        if (hp === 0) {
          if (def.element) {
            killFamily = def.element
          } else if (def.id.includes('poison') || def.id.includes('bleed')) {
            killFamily = 'poison'
          }
        }
      }
    }

    const remaining = active.remainingTicks - 1
    if (remaining > 0) {
      next.push({ ...active, remainingTicks: remaining })
    } else {
      entries.push({
        kind: 'condition-end',
        text: `The ${mob.name} shakes off ${def.name}.`,
        conditionId: def.id,
        meta: { mobName: mob.name, mobRarity: mob.rarity, conditionName: def.name },
      })
    }
  }

  return { mob: { ...mob, hp, conditions: next }, entries, killFamily }
}

type AttackDecision =
  | { kind: 'melee' }
  | { kind: 'spell'; spellId: string }
  | { kind: 'scroll'; inventoryIdx: number; spellId: string }

/** A character is a "magic user" for combat-AI purposes when they know at
 *  least one damage spell. We don't gate on class label because some hybrid
 *  classes (Spellblade, Tech-Mage) carry both spells and good melee — the
 *  spell list itself is the truest signal of intent. */
function knowsAnyDamageSpell(character: Character): boolean {
  for (const id of character.spells ?? []) {
    const s = getSpell(character.worldId, id)
    if (
      s &&
      (s.effect.kind === 'damage' || s.effect.kind === 'damage-over-time')
    ) {
      return true
    }
  }
  return false
}

function chooseCharacterAction(
  character: Character,
  world: WorldContent,
  rng: Rng,
): AttackDecision {
  const hpRatio = character.maxHp > 0 ? character.hp / character.maxHp : 1

  // Desperate: teleport out if available and HP critical.
  if (hpRatio < 0.2) {
    for (const id of character.spells ?? []) {
      const s = getSpell(character.worldId, id)
      if (s && s.effect.kind === 'teleport-safe' && character.magic >= s.magicCost) {
        return { kind: 'spell', spellId: s.id }
      }
    }
    // Or an escape scroll.
    for (let i = 0; i < character.inventory.length; i++) {
      const item = character.inventory[i]
      if (!item.archetypeId) continue
      const def = getItem(world, item.archetypeId)
      if (!def || def.kind !== 'scroll') continue
      const spell = getSpell(character.worldId, def.spellId)
      if (
        spell &&
        spell.effect.kind === 'teleport-safe' &&
        character.stats.intelligence >= spell.scrollIntRequirement
      ) {
        return { kind: 'scroll', inventoryIdx: i, spellId: spell.id }
      }
    }
  }

  // Wounded: heal if we have a heal spell with mana.
  if (hpRatio < 0.5) {
    for (const id of character.spells ?? []) {
      const s = getSpell(character.worldId, id)
      if (s && s.effect.kind === 'heal' && character.magic >= s.magicCost) {
        return { kind: 'spell', spellId: s.id }
      }
    }
    // Or a healing scroll — requires intelligence.
    for (let i = 0; i < character.inventory.length; i++) {
      const item = character.inventory[i]
      if (!item.archetypeId) continue
      const def = getItem(world, item.archetypeId)
      if (!def || def.kind !== 'scroll') continue
      const spell = getSpell(character.worldId, def.spellId)
      if (
        spell &&
        spell.effect.kind === 'heal' &&
        character.stats.intelligence >= spell.scrollIntRequirement
      ) {
        return { kind: 'scroll', inventoryIdx: i, spellId: spell.id }
      }
    }
  }

  // Magic users prefer spells over melee at every opportunity. Only fall
  // through to a swung weapon when out of MP for every damage spell — and
  // even then the explorer-tick consumes an MP potion first when one is
  // available, so reaching melee here means "truly out of options."
  const isMagicUser = knowsAnyDamageSpell(character)
  const damageSpells = (character.spells ?? [])
    .map((id) => getSpell(character.worldId, id))
    .filter((s): s is NonNullable<typeof s> =>
      !!s &&
      (s.effect.kind === 'damage' || s.effect.kind === 'damage-over-time') &&
      character.magic >= s.magicCost,
    )
  // Magic users always cast when castable; non-magic-users keep the old
  // ~40% spell preference to add flavor without making fighters look like
  // wizards.
  const casterPrefers = isMagicUser ? damageSpells.length > 0 : rng.chance(0.4)
  if (casterPrefers && damageSpells.length > 0) {
    const chosen = rng.pick(damageSpells)
    return { kind: 'spell', spellId: chosen.id }
  }

  // Magic user with no MP for any spell: try a damage scroll before resorting
  // to melee. Scrolls cost no MP — perfect last-ditch caster move.
  if (isMagicUser) {
    for (let i = 0; i < character.inventory.length; i++) {
      const item = character.inventory[i]
      if (!item.archetypeId) continue
      const def = getItem(world, item.archetypeId)
      if (!def || def.kind !== 'scroll') continue
      const spell = getSpell(character.worldId, def.spellId)
      if (
        spell &&
        (spell.effect.kind === 'damage' || spell.effect.kind === 'damage-over-time') &&
        character.stats.intelligence >= spell.scrollIntRequirement
      ) {
        return { kind: 'scroll', inventoryIdx: i, spellId: spell.id }
      }
    }
  }

  return { kind: 'melee' }
}

function removeInventoryEntry(
  character: Character,
  inventoryIdx: number,
): Character {
  const item = character.inventory[inventoryIdx]
  if (!item) return character
  const qty = item.quantity ?? 1
  if (qty > 1) {
    return {
      ...character,
      inventory: character.inventory.map((v, i) =>
        i === inventoryIdx ? { ...v, quantity: qty - 1 } : v,
      ),
    }
  }
  return {
    ...character,
    inventory: character.inventory.filter((_, i) => i !== inventoryIdx),
  }
}

// Unified mob-defeat handling: award XP, log the kill, roll loot, satisfy
// greed, auto-equip, re-stamp weight, return to exploring. Called from both
// DoT-kill and melee-kill paths in fight(). The optional `killFamily`
// tunes the defeat flavor — a sword kill reads "is cleaved in two", a
// fireball kill reads "is reduced to ash", etc. — via the shared
// death-phrase rotation. Roughly 50% of the time we still print the
// compact "The X falls." line so the log isn't uniformly florid.
//
// `gatewayExitKey`: when present, this was a gateway-guardian fight
// masking LLM area generation. On defeat, we check whether the target
// exit room now has a destination (gen completed). If so, explore
// normally; if not, transition to 'generating-area' so the finding-path
// countdown can take over.
/** When the killing strike was severe / critical AND came from a real
 *  attack path (melee swing, damage spell), the caller fills in this
 *  context so `resolveMobDefeat` emits a single combined kill line
 *  ("Hiro cleaves the Goblin in half. (+12 XP)") instead of the
 *  standard separate damage + defeat pair. DoT / condition kill paths
 *  leave it undefined and keep the standard "The X falls." line. */
interface CombinedKillOption {
  severity: DamageSeverity
  attackPower?: number
  defense?: number
  scaleMult?: number
  weaponName?: string
}

export function resolveMobDefeat(
  character: Character,
  mob: Mob,
  world: WorldContent,
  log: LogEntry[],
  killFamily: DamageFamily | 'poison' | undefined,
  gatewayExitKey: string | undefined,
  rng: Rng,
  combinedKill?: CombinedKillOption,
): Playing {
  const awardedXp = Math.max(
    1,
    Math.round(
      mob.xpReward *
        xpScaleByDelta(mob.level - character.level) *
        blessingXpMultiplier(character),
    ),
  )
  const area = getArea(world, character.position.areaId)
  const dropRoom =
    area.rooms[
      roomKey(character.position.x, character.position.y, character.position.z)
    ]
  let out = append(
    log,
    combinedKill
      ? formatCombinedKillLog({
          characterName: character.name,
          mob,
          awardedXp,
          // 'poison' isn't a kill-line family — falls back to generic.
          killFamily: killFamily === 'poison' ? 'generic' : killFamily,
          severity: combinedKill.severity,
          attackPower: combinedKill.attackPower,
          defense: combinedKill.defense,
          scaleMult: combinedKill.scaleMult,
          weaponName: combinedKill.weaponName,
          areaId: area.id,
          roomName: dropRoom?.name,
        })
      : formatMobDefeatLog({
          mob,
          awardedXp,
          killFamily,
          areaId: area.id,
          roomName: dropRoom?.name,
          rng,
        }),
  )
  const rewardCtx: RewardContext = {
    mobRarity: mob.rarity,
    mobLevel: mob.level,
    roomType: dropRoom?.type,
    areaRarity: area.rarity,
  }
  // Curated loot override: fires only when the defeated mob was actually
  // spawned from the room's curated encounter (mob.curated === true).
  // A random-pool spawn of the same mob id does NOT trigger the override,
  // so post-firstOnly-defeat pool kills keep using the archetype loot.
  // Reward context threads through so Phase 4 scaling (gold mult, level
  // floor bump, extreme-mult rarity nudge) applies to curated drops too
  // — a rare amulet in a level-7 epic area is meaningfully beefier than
  // the same curated entry in a level-1 area.
  const curatedLoot =
    mob.curated && dropRoom?.encounter?.loot ? dropRoom.encounter.loot : null
  // Drop-bias context — lets `rollLoot` swap ordinary equipment/scroll
  // drops for class- or room-appropriate alternatives. Curated loot is
  // authored intent and bypasses the bias entirely (see rollCuratedLoot).
  const biasCtx = {
    classId: character.classId,
    roomName: dropRoom?.name,
    roomType: dropRoom?.type,
    worldItems: world.items,
  }
  const drops = curatedLoot
    ? rollCuratedLoot(curatedLoot, rewardCtx, rng)
    : rollLoot(mob, rewardCtx, biasCtx, world, rng)
  // Pre-roll the rarity for each non-curated drop so the log line and
  // the inventory stay in lockstep. Curated drops already carry
  // `rarity` on the drop entry. Plain drops are normally rolled inside
  // `applyDrops`, which fires AFTER this log; stamping the value here
  // means the log paints the token with the actual drop tier instead
  // of falling back to mob-rarity-as-proxy (which made rare drops from
  // common mobs render gray).
  const rewardMult = rewardCtx ? combatRewardMult(rewardCtx) : 1
  for (const drop of drops.items) {
    if (drop.rarity != null) continue
    const def = getItem(world, drop.itemId)
    if (!def) continue
    drop.rarity = rollDropRarity(def, mob.rarity, rewardMult, rng)
  }
  // Items go into a locked chest; pure gold drops bypass the chest and
  // credit immediately so a mob that drops only coin stays a clean
  // one-line beat. Auto-equip is deferred to chest-unlock so the player
  // sees new gear get picked up and equipped together at the reveal.
  const greedEased = satisfy(character.drives, ['greed'])
  const trackedForBaddest = trackBaddest(
    { ...character, drives: greedEased },
    mob,
  )
  // Resolve drops to chest-ready entries up-front. When every item is
  // abandoned (encumbrance overflow), `entries` is empty and there's no
  // chest to create — gold from the same kill still credits via the
  // gold-only path below. When the character already has a chest, fresh
  // items merge in and gold rides along into the existing chest.
  const resolved = drops.items.length > 0
    ? resolveChestDrops(
        trackedForBaddest,
        world,
        drops.items,
        mob,
        { areaId: area.id, roomName: dropRoom?.name },
        rewardCtx,
        rng,
      )
    : { entries: [], abandoned: [] }
  if (resolved.abandoned.length > 0) {
    const names = resolved.abandoned.map((d) => d.name)
    const count = names.length
    const listText = names.join(', ')
    out = append(out, {
      kind: 'narrative',
      text: `${formatActorName(trackedForBaddest, 'log')} sacrifices ${count} item${count !== 1 ? 's' : ''} — ${listText} — to the weight of the road.`,
      meta: {
        name: formatActorName(trackedForBaddest, 'log'),
        // No itemId / itemName on the summary — it references
        // multiple items, and the bracketed popover pattern assumes a
        // single subject. Surface only the character name so the
        // journal / log coloring still picks up the actor.
      },
    })
  }
  const existingChest = trackedForBaddest.lockedChest
  let postLoot: Character
  if (resolved.entries.length > 0 || existingChest) {
    // Chest path — either creating a new chest with these entries, or
    // merging into an existing chest (even if the merge is gold-only,
    // because the player should see the running coin tally on the
    // chest UI rather than getting it credited mid-cycle).
    const mergedItems = existingChest
      ? [...existingChest.items, ...resolved.entries]
      : resolved.entries
    const mergedGold = (existingChest?.gold ?? 0) + drops.gold
    const targetTicks = Math.min(
      CHEST_MAX_TICKS,
      CHEST_BASE_TICKS + mergedItems.length * CHEST_PER_ITEM_TICKS,
    )
    // Subsequent kills extend the timer to the new target if it's
    // longer than the remaining countdown — never shortens, so a chest
    // about to open doesn't stall on a fresh kill.
    const ticksLeft = existingChest
      ? Math.max(existingChest.ticksLeft, targetTicks)
      : targetTicks
    // The "stows the spoils" line fires only on the kill that *opens*
    // a fresh chest. Subsequent merges happen quietly — the chest UI
    // surfaces the running count, and a per-kill log line would just
    // be noise during a combat streak.
    if (!existingChest) {
      const charName = formatActorName(trackedForBaddest, 'log')
      out = append(out, {
        kind: 'narrative',
        text: `${charName} stows the spoils in a strange chest. It clicks shut.`,
        meta: { name: charName },
      })
    }
    const withChest: Character = {
      ...trackedForBaddest,
      lockedChest: {
        items: mergedItems,
        gold: mergedGold,
        ticksLeft,
        source: {
          mobName: mob.name,
          areaId: area.id,
          roomName: dropRoom?.name,
        },
      },
    }
    postLoot = {
      ...withChest,
      drives: stampWeight(withChest.drives, withChest, world),
    }
  } else if (drops.gold > 0) {
    // No items locked in (or every drop was abandoned with no existing
    // chest to absorb them), but gold still drops — credit it via the
    // legacy path so the gold pickup line and currency name come from
    // the same helpers that all other gold credits use.
    out = appendDropLogs(out, trackedForBaddest, world, drops, rng)
    const goldOnly = applyDrops(
      trackedForBaddest,
      world,
      drops,
      mob,
      { areaId: area.id, roomName: dropRoom?.name },
      rewardCtx,
      rng,
    )
    postLoot = {
      ...goldOnly.character,
      drives: stampWeight(goldOnly.character.drives, goldOnly.character, world),
    }
  } else {
    // Nothing dropped (or all drops were abandoned and the kill yielded
    // no gold) — re-stamp drives in case greed satisfaction shifted
    // anything, otherwise leave the character unchanged.
    postLoot = {
      ...trackedForBaddest,
      drives: stampWeight(trackedForBaddest.drives, trackedForBaddest, world),
    }
  }
  const xpResult = applyXp(postLoot, awardedXp, out, rng)
  // firstOnly curated encounter defeated? Stamp the room key so the
  // spawn logic on subsequent entries skips the curated encounter and
  // falls back to the random pool. Only fires when the defeat happened
  // in a room with a firstOnly encounter — ambient curated fights and
  // random-pool fights don't populate this list.
  const finalCharacter =
    dropRoom?.encounter?.firstOnly
      ? recordFirstOnlyDefeat(xpResult.character, area.id, dropRoom.x, dropRoom.y, dropRoom.z)
      : xpResult.character

  // Gateway-guardian fight: check whether LLM gen finished during combat.
  // If the exit room now has a destination, gen completed — just explore.
  // Otherwise, transition to 'generating-area' so the finding-path
  // countdown takes over.
  if (gatewayExitKey) {
    const [srcAreaId, coords] = gatewayExitKey.split('::')
    const srcArea = srcAreaId ? findArea(world, srcAreaId) : undefined
    const exitRoom = srcArea && coords ? srcArea.rooms[coords] : undefined
    if (!exitRoom?.destination) {
      return {
        character: finalCharacter,
        log: xpResult.log,
        state: {
          kind: 'generating-area',
          exitRoomKey: gatewayExitKey,
          ticksLeft: AREA_GEN_TIMEOUT_TICKS,
        },
      }
    }
  }

  return { character: finalCharacter, log: xpResult.log, state: { kind: 'exploring' } }
}

function recordFirstOnlyDefeat(
  character: Character,
  areaId: string,
  x: number,
  y: number,
  z: number,
): Character {
  const key = visitedKey(areaId, x, y, z)
  const defeated = character.defeatedRooms ?? []
  if (defeated.includes(key)) return character
  return { ...character, defeatedRooms: [...defeated, key] }
}

// Unified character-death handling: record the death, log it, apply the
// configured death penalty, respawn at the last safe position. Shared by the
// main fight path and the mob-ambush path.
function resolveCharacterDeath(
  character: Character,
  mob: Mob,
  world: WorldContent,
  log: LogEntry[],
  rng: Rng,
  options: { now?: number } = {},
): Playing {
  // Records (DeathRecord, SavedRecord) get a wall-clock stamp. Threading
  // `now` lets deterministic replays/tests pin the timestamps, mirroring
  // the `applyOneLevel` options.now pattern.
  const now = options.now ?? Date.now()
  const area = getArea(world, character.position.areaId)
  const rk = roomKey(character.position.x, character.position.y, character.position.z)
  const room = area.rooms[rk]
  // Rotating death verb — "falls to", "is slain by", "is cut down by",
  // etc. — so a character with a long death log doesn't read like the
  // same tragedy on repeat. When the mob has an `attackFamily` (fire,
  // slash, pierce, …) we pass it through so the rotation can pick a
  // family-flavored framing ("is reduced to ash", "is cleaved in two",
  // "shatters before …") ~60% of the time. The record's `cause`
  // field stores the predicate form ("Cut down by the X") suitable
  // for stamping into the death log display directly.
  const deathFamily = mob.attackFamily
  const causeClause = deathClause(mob.name, deathFamily, rng)
  const respawn: Position = character.lastSafePosition ?? {
    areaId: area.id,
    x: area.startX,
    y: area.startY,
    z: area.startZ,
  }
  const respawnArea = getArea(world, respawn.areaId)
  const respawnRoom = respawnArea.rooms[roomKey(respawn.x, respawn.y, respawn.z)]

  // Death save — when favor is at the Anointed tier the deity intervenes.
  // The blow is converted to a near-fatal wound: HP set to 50% of max,
  // conditions cleared, character teleported to lastSafePosition. Favor
  // resets to 0 (and any active blessing drops with it) — that's the
  // price of the save. A SavedRecord is appended (distinct from
  // DeathRecord) so the journal/level-up summary can show "saved
  // twice this segment" without inflating death counts.
  if (canDeathSave(character)) {
    const manifest = getWorldManifest(character.worldId)
    const dWord = favorDeityWord(manifest)
    // Preface the save with a meta line so a first-time spectator reads
    // the rescue as a consequence of the Anointed tier rather than a
    // mystery. The death-save line follows immediately, so the two read
    // as a beat: "the gods owe a debt — and they pay it now."
    let out = append(log, {
      kind: 'meta',
      text: `Anointed — the ${dWord} owe ${formatActorName(character, 'log-milestone')} a debt.`,
      meta: {
        name: formatActorName(character, 'log-milestone'),
        areaId: area.id,
      },
    })
    const saveText = respawnRoom
      ? `The ${dWord} step in. ${formatActorName(character, 'log-milestone')} should have died — instead, they wake in the ${respawnRoom.name}.`
      : `The ${dWord} step in. ${formatActorName(character, 'log-milestone')} should have died — instead, they wake somewhere safer.`
    out = append(out, {
      kind: 'death-save',
      text: saveText,
      meta: {
        name: formatActorName(character, 'log-milestone'),
        mobName: mob.name,
        mobRarity: mob.rarity,
        areaId: area.id,
        roomKey: roomKey(respawn.x, respawn.y, respawn.z),
        roomName: respawnRoom?.name,
        isSave: true,
      },
    })
    const savedRecord = {
      at: now,
      cause: capitalize(causeClause),
      areaId: area.id,
      roomName: room?.name,
      roomKey: rk,
      mobName: mob.name,
    }
    return {
      character: {
        ...character,
        blessing: undefined,
        hp: Math.max(1, Math.floor(character.maxHp / 2)),
        magic: character.magic,
        position: respawn,
        conditions: [],
        favor: 0,
        saved: [...(character.saved ?? []), savedRecord],
      },
      log: out,
      state: { kind: 'exploring' },
    }
  }

  const narrativeLine = deathSentence(formatActorName(character, 'log-milestone'), mob.name, deathFamily, rng)
  const record: DeathRecord = {
    at: now,
    cause: capitalize(causeClause),
    areaId: area.id,
    roomName: room?.name,
    roomKey: rk,
    mobName: mob.name,
    mobRemainingHp: mob.hp,
    mobMaxHp: mob.maxHp,
  }
  const respawnText = respawnRoom
    ? `They wake again in the ${respawnRoom.name}.`
    : "They wake again where it's safe."
  let out = append(log, {
    kind: 'narrative',
    text: `${narrativeLine}. ${respawnText}`,
    meta: {
      name: formatActorName(character, 'log-milestone'),
      mobName: mob.name,
      mobRarity: mob.rarity,
      areaId: area.id,
      roomKey: roomKey(respawn.x, respawn.y, respawn.z),
      roomName: respawnRoom?.name,
      isDeath: true,
    },
  })
  const penalty = applyDeathPenalty(character, rng)
  for (const entry of penalty.entries) out = append(out, entry)
  // Death zeroes favor — gods don't smile on a corpse. Any active
  // blessing is dropped in the same beat. The reset is part of the
  // standing-with-the-gods loop: a high-roller that died the hard way
  // (no save, sub-Anointed) starts over from Unseen.
  return {
    character: {
      ...penalty.character,
      blessing: undefined,
      hp: penalty.character.maxHp,
      position: respawn,
      deaths: [...penalty.character.deaths, record],
      conditions: [],
      favor: 0,
    },
    log: out,
    state: { kind: 'exploring' },
  }
}

export function fight(p: Playing, world: WorldContent, rng: Rng): Playing {
  if (p.state.kind !== 'fighting') return p
  const ambush = p.state.ambush
  const gatewayExitKey = p.state.gatewayExitKey
  const condResult = tickConditions(p.character, world, rng)
  let log = p.log
  for (const e of condResult.entries) log = append(log, e)

  // Apply any DoTs on the mob (e.g. poison spell last turn).
  let mob = p.state.mob
  const mobCond = tickMobConditions(mob, world, p.character.worldId, rng)
  mob = mobCond.mob
  for (const e of mobCond.entries) log = append(log, e)

  // If DoT finished the mob, award XP and exit. Thread through the
  // killing DoT's element (fire → "is reduced to ash", poison →
  // "chokes and collapses", …) so the defeat flavor matches what
  // actually landed the final tick.
  if (mob.hp === 0) {
    return resolveMobDefeat(condResult.character, mob, world, log, mobCond.killFamily, gatewayExitKey, rng)
  }

  const consumed = maybeAutoConsume(condResult.character, world)
  if (consumed) {
    return {
      character: consumed.character,
      log: append(log, consumed.entry),
      state: { kind: 'fighting', mob, ambush, gatewayExitKey },
    }
  }

  let character = condResult.character
  const skipAttack = condResult.skipTurn

  // Ambush routing: while `ambush.ticksLeft > 0`, only the ambusher acts. If
  // the character is the ambusher we fall through to the normal char-attack
  // path and skip the mob's retaliation. If the mob is the ambusher we
  // short-circuit to a mob-only attack below. Either way, decrement at the
  // end of the tick.
  const charAmbushing = ambush?.side === 'character'
  const mobAmbushing = ambush?.side === 'mob'

  const bonuses = combatBonuses(character, world)
  const attackBonus = bonuses.attack ?? 0
  const defenseBonus = bonuses.defense ?? 0

  // Mob ambushing: skip character attack entirely, run mob attack with no
  // retaliation window. We still check mob-self-heal first because the mob
  // may be damaged enough to heal instead of strike.
  if (mobAmbushing) {
    // Mob ambush: single tick at 2× damage. Pass the multiplier
    // through so runMobAttack picks it up after its own level-delta
    // scaling — same shape as the character-side ambush above.
    const mobAttackResult = runMobAttack(
      character,
      mob,
      world,
      defenseBonus,
      log,
      rng,
      2,
    )
    if (mobAttackResult.kind === 'died') {
      return mobAttackResult.playing
    }
    const nextAmbush = ambush
      ? ambush.ticksLeft > 1
        ? { ...ambush, ticksLeft: ambush.ticksLeft - 1 }
        : undefined
      : undefined
    return {
      character: mobAttackResult.character,
      log: mobAttackResult.log,
      state: { kind: 'fighting', mob: mobAttackResult.mob, ambush: nextAmbush, gatewayExitKey },
    }
  }

  // Decide: melee, cast spell, or read a scroll?
  const decision: AttackDecision = skipAttack ? { kind: 'melee' } : chooseCharacterAction(character, world, rng)

  let mobHpAfter = mob.hp
  // Track the damage family of the strike that lands this tick so that
  // if it zeros the mob, resolveMobDefeat can flavor the defeat line
  // ("The Goblin is reduced to ash." on a fireball kill). Stays
  // undefined on skipped turns — falls through to the generic
  // "X falls." line then.
  let killFamily: DamageFamily | 'poison' | undefined
  // When the killing strike is severe / critical the standard
  // damage-line + defeat-line pair gets replaced by a single combined
  // entry. Filled in by the melee / spell branches below; passed into
  // `resolveMobDefeat` which consumes it instead of the standard
  // defeat line.
  let combinedKill: CombinedKillOption | undefined

  if (skipAttack) {
    log = append(log, {
      kind: 'narrative',
      text: `${formatActorName(character, 'log')} cannot strike.`,
      meta: { name: formatActorName(character, 'log'), mobName: mob.name, mobRarity: mob.rarity },
    })
  } else if (decision.kind === 'spell' || decision.kind === 'scroll') {
    const spell = getSpell(character.worldId, decision.spellId)!
    let workingChar = character
    let scrollLevel: ScrollLevel | undefined
    if (decision.kind === 'scroll') {
      // Capture the scroll's level BEFORE consuming it so castSpell can
      // scale the spell amount. Falls back to Level I when the archetype
      // somehow lacks a level (legacy data); the multiplier becomes 1×
      // and behavior matches the pre-feature baseline.
      const scrollItem = character.inventory[decision.inventoryIdx]
      const scrollDef = scrollItem?.archetypeId
        ? getItem(world, scrollItem.archetypeId)
        : undefined
      if (scrollDef && scrollDef.kind === 'scroll') {
        scrollLevel = scrollDef.level
      }
      workingChar = removeInventoryEntry(character, decision.inventoryIdx)
    }
    const result = castSpell({
      character: workingChar,
      mob,
      world,
      spell,
      free: decision.kind === 'scroll',
      source: decision.kind === 'scroll' ? 'scroll' : 'cast',
      scrollLevel,
      rng,
    })
    for (const e of result.entries) log = append(log, e)
    character = result.character
    if (result.mob) mob = result.mob
    mobHpAfter = mob.hp
    // Spell element is the DamageFamily (fire/ice/electric/…) — used
    // only when THIS spell lands the kill. Cases without an element
    // (heal / buff spells) leave killFamily undefined.
    if (spell.element) killFamily = spell.element
    // Severe / critical kill from a damage spell: castSpell suppressed
    // its standard damage entry and handed back the strike's
    // breakdown so resolveMobDefeat can emit one combined kill line.
    if (result.combinedKillCandidate) {
      combinedKill = result.combinedKillCandidate
    }

    // Teleport escape exits combat.
    if (result.teleported) {
      return { character, log, state: { kind: 'exploring' } }
    }
  } else {
    // Level-delta bias. Tuned so a 5-level gap roughly doubles damage dealt
    // and halves damage taken in the favoured direction, with the effect
    // saturating beyond ±5 so blue- and red-con fights stay decisive but
    // never turn into one-shots at extreme mismatches.
    const levelDelta = character.level - mob.level
    const outgoingMult = levelScaleOutgoing(levelDelta)
    const attackRoll = rng.roll(4) + mod(character.stats.strength) + attackBonus
    const baseCharDmg = attackRoll - mob.defense
    // Pull the weapon's damage family (slash/crush/pierce) up front so
    // it can feed both the log verb and the mob resist lookup. Falls
    // through to the world's generic verb set / no resist when unarmed.
    const weaponArchetype = character.equipped.weapon?.archetypeId
      ? (getItem(world, character.equipped.weapon!.archetypeId) ??
          null)
      : null
    const weaponFamily =
      weaponArchetype && weaponArchetype.kind === 'equipment'
        ? weaponArchetype.damageFamily
        : undefined
    killFamily = weaponFamily
    // Element / family resist applies after the level scale so an iron
    // golem ('crush' resistant) shrugs off a sword swing the same way a
    // fire elemental shrugs off a fireball. No family on a fist-fight
    // → multiplier of 1.
    const resistMult = mobResistMultiplier(mob, weaponFamily)
    // Ambush strike: a single tick where the ambusher's blow lands
    // for 2× damage. Stealth (DEX-driven rogue/ranger opener) and
    // reversed (WIS-driven counter-ambush) stack an extra 1.5×+ on
    // top — 3×+ total — so class-driven ambushes still hit harder than
    // a generic level-delta auto-ambush. The stealth bonus scales with
    // the character's WIS mod for stealth classes (1.5× at WIS ≤ 10,
    // capped at 2.0× at WIS 20+) — alert scouts hit harder when they
    // get the drop.
    const charAmbushHit = ambush?.side === 'character' && ambush.ticksLeft === 1
    const ambushMult = charAmbushHit ? 2 : 1
    const stealthFirstHit =
      charAmbushHit && (ambush.reason === 'stealth' || ambush.reason === 'reversed')
    const wisMod = Math.max(0, Math.floor((character.stats.wisdom - 10) / 2))
    const stealthMult = stealthFirstHit
      ? Math.min(2.0, 1.5 + wisMod * 0.1)
      : 1
    const charDmg = Math.max(
      1,
      Math.round(baseCharDmg * outgoingMult * ambushMult * stealthMult * resistMult),
    )
    mobHpAfter = Math.max(0, mob.hp - charDmg)
    const baseDmg = damageVerb(
      charDmg,
      mob.maxHp,
      character.worldId,
      weaponFamily,
      rng,
    )
    // Anointed (tier 4) blessing nudges every successful character strike
    // up one severity rung — grazing → light, severe → critical, etc. The
    // verb is re-rolled at the bumped tier so the log line matches.
    const floor = blessingSeverityFloor(character)
    const severity = floor > 0 ? ascendSeverity(baseDmg.severity, floor) : baseDmg.severity
    const verb =
      severity === baseDmg.severity
        ? baseDmg.verb
        : pickVerb(character.worldId, severity, weaponFamily, rng)
    const weaponName = character.equipped.weapon?.name
    // Stealth-opener prefix and meta flag are PR-side additions; main's
    // formatAttackLog helper doesn't carry them, so this site stays
    // inline. `scaleMult` is threaded through to keep the swing tag
    // working alongside the stealth flavor.
    const stealthPrefix = stealthFirstHit ? 'From the shadows, ' : ''
    const withSuffix = weaponName
      ? `${stealthPrefix}${formatActorName(character, 'log')} ${verb} the ${mob.name} with ${weaponName}.`
      : `${stealthPrefix}${formatActorName(character, 'log')} ${verb} the ${mob.name}.`
    // Severe / critical kills collapse into a single combined entry
    // emitted by `resolveMobDefeat`. Skip the standard damage line
    // here so the log doesn't read "Hiro slashes the Goblin." then
    // "Hiro cleaves the Goblin in half." back-to-back. Lighter-tier
    // kills keep the original two-line cadence.
    const kills = mobHpAfter === 0
    const isFinisher = kills && (severity === 'severe' || severity === 'critical')
    if (isFinisher) {
      combinedKill = {
        severity,
        attackPower: attackRoll,
        defense: mob.defense,
        scaleMult: outgoingMult,
        weaponName,
      }
    } else {
      log = append(log, {
        kind: 'damage',
        text: withSuffix,
        amount: charDmg,
        severity,
        meta: {
          name: formatActorName(character, 'log'),
          mobName: mob.name,
          verb,
          severity,
          itemName: weaponName,
          attackPower: attackRoll,
          defense: mob.defense,
          scaleMult: outgoingMult,
          mobRarity: mob.rarity,
          stealth: stealthFirstHit ? true : undefined,
        },
      })
    }

    // Rogue signature: stealth-opener hits always coat the blade. Silently
    // no-ops when the world doesn't define a 'poisoned' condition — other
    // worlds can add their own rogue-equivalent DoT under that id.
    if (stealthFirstHit && character.classId === 'rogue' && mobHpAfter > 0) {
      const applied = applyMobCondition(mob, world, 'poisoned', {
        name: character.name,
        weaponName: character.equipped.weapon?.name,
      })
      mob = applied.mob
      if (applied.entry) log = append(log, applied.entry)
    }
  }

  if (mobHpAfter === 0) {
    // Pass through the killing family so the defeat line can flavor
    // by kill type: spell → spell.element, melee → weaponFamily (or
    // unarmed claw). Sits at local scope so both branches fill it
    // before reaching this check. `combinedKill`, when set, swaps the
    // standard "X falls." defeat line for a single combined entry that
    // already encodes the killing strike.
    return resolveMobDefeat(
      character,
      mob,
      world,
      log,
      killFamily,
      gatewayExitKey,
      rng,
      combinedKill,
    )
  }

  // Character-ambush active → mob doesn't retaliate this tick. Decrement and
  // keep the fight going.
  if (charAmbushing) {
    const nextAmbush = ambush && ambush.ticksLeft > 1
      ? { ...ambush, ticksLeft: ambush.ticksLeft - 1 }
      : undefined
    return {
      character,
      log,
      state: {
        kind: 'fighting',
        mob: { ...mob, hp: mobHpAfter },
        ambush: nextAmbush,
        gatewayExitKey,
      },
    }
  }

  // Mob self-heal: instead of attacking, burn a charge if hurt badly enough.
  // Fires ahead of the retaliation so the heal is visible even when the mob
  // would otherwise have been one-shot by the player this round.
  const mobWorking: Mob = { ...mob, hp: mobHpAfter }
  if (
    mobWorking.hp > 0 &&
    mobWorking.hp < mobWorking.maxHp * 0.35 &&
    mobWorking.healChargesLeft > 0
  ) {
    const heal = mobWorking.healAmount ?? Math.max(3, Math.round(mobWorking.maxHp * 0.35))
    const healed = Math.min(mobWorking.maxHp, mobWorking.hp + heal)
    const actual = healed - mobWorking.hp
    log = append(log, formatMobSelfHealLog(mobWorking.name, actual, mobWorking.rarity))
    const healedMob: Mob = {
      ...mobWorking,
      hp: healed,
      healChargesLeft: mobWorking.healChargesLeft - 1,
    }
    return {
      character,
      log,
      state: { kind: 'fighting', mob: healedMob, ambush, gatewayExitKey },
    }
  }

  const levelDelta = character.level - mob.level
  const incomingMult = levelScaleIncoming(levelDelta)
  const mobAttackRoll = mob.attack + rng.roll(3) - 2
  const totalDefense = mod(character.stats.dexterity) + defenseBonus
  const baseMobDmg = mobAttackRoll - totalDefense
  const mobDmg = Math.max(1, Math.round(baseMobDmg * incomingMult))
  const charHpAfter = Math.max(0, character.hp - mobDmg)
  // Mob's natural-weapon family — beasts claw, constructs crush, etc.
  // Default 'claw' reads as a generic animal-style attack.
  const mobAttack = damageVerb(
    mobDmg,
    character.maxHp,
    character.worldId,
    mob.attackFamily ?? 'claw',
    rng,
  )

  log = append(log, formatAttackLog({
    direction: 'mob-to-char',
    characterName: formatActorName(character, 'log'),
    mobName: mob.name,
    verb: mobAttack.verb,
    severity: mobAttack.severity,
    amount: mobDmg,
    attackPower: mobAttackRoll,
    defense: totalDefense,
    scaleMult: incomingMult,
    mobRarity: mob.rarity,
  }))

  let postHitChar = character
  if (charHpAfter > 0 && mob.applyOnHit && rng.chance(mob.applyOnHit.chance)) {
    const applied = applyCondition(
      postHitChar,
      world,
      mob.applyOnHit.conditionId,
      `the ${mob.name}`,
    )
    postHitChar = applied.character
    if (applied.entry) log = append(log, applied.entry)
  }

  if (charHpAfter === 0) {
    return resolveCharacterDeath(character, mob, world, log, rng)
  }

  // Ambush counter was only consumed by the char-only / mob-only branches
  // above; reaching this line means neither fired, so either ambush is
  // already cleared or it wasn't set.
  return {
    character: { ...postHitChar, hp: charHpAfter },
    log,
    state: { kind: 'fighting', mob: { ...mob, hp: mobHpAfter }, ambush, gatewayExitKey },
  }
}

/**
 * Runs a single mob→character attack round (no character action). Used by
 * the mob-ambush path where the character doesn't strike back. Returns the
 * same `died` sentinel shape that the full fight function uses so the caller
 * can propagate a respawn. Mob-heal fires ahead of the strike if applicable.
 */
type MobAttackOutcome =
  | { kind: 'alive'; character: Character; mob: Mob; log: LogEntry[] }
  | { kind: 'died'; playing: Playing }

function runMobAttack(
  character: Character,
  mob: Mob,
  world: WorldContent,
  defenseBonus: number,
  log: LogEntry[],
  rng: Rng,
  damageMult: number = 1,
): MobAttackOutcome {
  // Self-heal first — an ambushing mob that's somehow already hurt still
  // prefers survival over damage.
  if (mob.hp < mob.maxHp * 0.35 && mob.healChargesLeft > 0) {
    const heal = mob.healAmount ?? Math.max(3, Math.round(mob.maxHp * 0.35))
    const healed = Math.min(mob.maxHp, mob.hp + heal)
    log = append(log, formatMobSelfHealLog(mob.name, healed - mob.hp, mob.rarity))
    return {
      kind: 'alive',
      character,
      mob: { ...mob, hp: healed, healChargesLeft: mob.healChargesLeft - 1 },
      log,
    }
  }

  const levelDelta = character.level - mob.level
  const incomingMult = levelScaleIncoming(levelDelta)
  const mobAttackRoll = mob.attack + rng.roll(3) - 2
  const totalDefense = mod(character.stats.dexterity) + defenseBonus
  const base = mobAttackRoll - totalDefense
  const dmg = Math.max(1, Math.round(base * incomingMult * damageMult))
  const hpAfter = Math.max(0, character.hp - dmg)
  const verb = damageVerb(dmg, character.maxHp, character.worldId, mob.attackFamily ?? 'claw', rng)
  log = append(log, formatAttackLog({
    direction: 'mob-to-char',
    characterName: formatActorName(character, 'log'),
    mobName: mob.name,
    verb: verb.verb,
    severity: verb.severity,
    amount: dmg,
    attackPower: mobAttackRoll,
    defense: totalDefense,
    scaleMult: incomingMult,
    mobRarity: mob.rarity,
  }))

  if (hpAfter === 0) {
    return { kind: 'died', playing: resolveCharacterDeath(character, mob, world, log, rng) }
  }

  return { kind: 'alive', character: { ...character, hp: hpAfter }, mob, log }
}
