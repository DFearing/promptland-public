import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CharacterViewport from './components/CharacterViewport'
import CharacterTabs from './components/CharacterTabs'
import CombatTargetPanel from './components/CombatTargetPanel'
import DevPanel from './components/DevPanel'
import FindingPathOverlay from './components/FindingPathOverlay'
import FirstTimeDialog from './components/FirstTimeDialog'
import MapPanel from './components/MapPanel'
import NoLLMDialog from './components/NoLLMDialog'
import PortalSelectDialog from './components/PortalSelectDialog'
import RoomDescPanel from './components/RoomDescPanel'
import LogPanel from './components/LogPanel'
import CharacterCreation from './components/CharacterCreation'
import CharacterRoster, { type RosterEntry } from './components/CharacterRoster'
import type { DevCommand } from './components/DevPanel'
import Landing from './components/Landing'
import Settings from './components/Settings'
import Topbar from './components/Topbar'
import TooltipLayer from './components/TooltipLayer'
import { generateShape, roomKey, visitedKey, type AreaKind } from './areas'
import type { PortalDestination } from './areas/types'
import type { Character, DeathRecord } from './character'
import {
  LAST_AUTHORED_TITLE_INDEX,
  currentTitleIndex,
  formatActorName,
  levelForTitleIndex,
  migrateCharacter,
  resolveTitle,
} from './character'
import {
  AREA_LEVEL_OFFSET_MIN,
  AREA_LEVEL_OFFSET_RANGE,
  areaGenTemplate,
  classTitleTemplate,
  countGeneratedAreas,
  createLLMClient,
  generate,
  installBespokeMobsFromPayload,
  isLLMConfigured,
  loadLLMConfig,
  MAX_GENERATED_AREAS,
  payloadToArea,
  rehydrateBespokeItems,
  rehydrateBespokeMobs,
  rehydrateGeneratedAreas,
  requestCuratedItemFlavor,
  saveGeneratedAreaGraph,
  storeGeneratedArea,
} from './llm'
import type { Mob } from './mobs'
import { Rng } from './rng'
import { damageVerb, formatAttackLog } from './combat'
import { applyCondition, clearConditions, tickConditions } from './conditions'
import { defeatLingerMs, mobDisplayName, type Rarity } from './items'
import type { LogEntry } from './log'
import { spawnGatewayGuardian } from './game/gatewayGuardian'
import { spawn } from './mobs'
import { uuid } from './util/uuid'
import {
  AREA_GEN_TIMEOUT_TICKS,
  INITIAL_STATE,
  TICK_MS,
  addItemToInventory,
  applyDeathPenalty,
  applyOneLevel,
  beginFight,
  equipLogEntry,
  formatGoldPickupLog,
  formatItemPickupLog,
  formatMeditateSummaryLog,
  formatMobDefeatLog,
  formatMobSelfHealLog,
  formatRestSummaryLog,
  maybeAutoConsume,
  runTick,
  seedLog,
  type GameState,
} from './game'
import { castSpell, getSpellList } from './spells'
import { IndexedDBStorage, type SaveRecord, type Storage } from './storage'
import type { WorldContent } from './worlds'
import {
  EffectsOverlay,
  deathDurationMs,
  deriveElementEvents,
  deriveEvents,
  deriveFieldEvents,
  levelUpDurationMs,
  type EffectEvent,
  type ElementFxEvent,
  type FieldFxEvent,
} from './effects'
import { loadEffects, loadTickSpeed, tickSpeedMult, type Effects, type TickSpeedId } from './themes'
import { loadSoundSettings, saveSoundSettings, soundManager, type SoundSettings } from './sound'
import { pickItemsToSell } from './game/sell'
import { pickItemsToSacrifice } from './game/sacrifice'
import { getWorldContent, getWorldManifest, WORLD_CONTENTS } from './worlds'
import './App.css'

const EVENT_CAP = 50
const DEV_OPEN_KEY = 'promptland.devPanel.open'
// One-shot landing-page dismissal flag. When the user clicks "Enter
// Promptland" we write '1' here so future boots skip the landing and
// go straight to the roster. Settings → About exposes a "Show landing
// again" link that clears this key + jumps back to the landing phase
// so users can revisit the pitch deliberately.
const LANDING_SEEN_KEY = 'promptland.landing.seen'

// Baseline linger before rarity scaling. Actual duration per mob comes
// from `defeatLingerMs(mob.rarity)` — see the useEffect that schedules the
// release timer below. Legendary kills sit on screen several times longer.

// Produces one representative log entry for every supported `kind` + meta
// combination the LogPanel can render. Used by the dev tool's "Sample log"
// button to eyeball every style in one pass. Pulls from the current world so
// names / rarities / conditions render against the real content library.
function buildLogSamples(character: Character, world: WorldContent): LogEntry[] {
  const rng = Rng.random()
  const charName = character.name
  const mobTemplate = world.mobs[0]
  const mobName = mobTemplate?.name ?? 'Cave Rat'
  const areaId = world.startingArea.id
  const firstRoomKey =
    Object.keys(world.startingArea.rooms)[0] ?? ''
  const room = world.startingArea.rooms[firstRoomKey]
  const roomName = room?.name ?? 'Starting Room'
  const roomDesc = room?.description ?? 'A plain hall.'
  const item = world.items[0]
  const itemName = item?.name ?? 'Rat Tail'
  const itemId = item?.id ?? 'rat_tail'

  const severities = ['grazing', 'light', 'solid', 'heavy', 'severe', 'critical'] as const
  // Hand-picked damage amounts chosen so each severity tier lands
  // deterministically — each amount is well inside that tier's band so
  // the damageVerb call below reliably classifies the sample into the
  // intended tier. Tuned against a 30-HP target so mobName→mob-HP math
  // is stable across worlds.
  const SAMPLE_TARGET_MAX_HP = 30
  const sampleAmounts: Record<(typeof severities)[number], number> = {
    grazing: 1,
    light: 2,
    solid: 5,
    heavy: 9,
    severe: 14,
    critical: 22,
  }
  const sampleAtk: Record<(typeof severities)[number], number> = {
    grazing: 3, light: 5, solid: 8, heavy: 12, severe: 18, critical: 26,
  }
  const sampleDef = 3

  const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const

  const base: LogEntry[] = [
    // Chapters / area / narrative / system / dialogue —
    { kind: 'chapter', text: `${charName} stirs.`, meta: { name: charName } },
    { kind: 'area', text: world.startingArea.name, areaId: world.startingArea.id },
    {
      kind: 'narrative',
      text: `${charName} stands in the ${roomName}. ${roomDesc}`,
      meta: { name: charName, areaId, roomKey: firstRoomKey, roomName },
    },
    {
      kind: 'narrative',
      text: `${charName} explores north to the ${roomName}. ${roomDesc}`,
      meta: {
        name: charName,
        direction: 'north',
        areaId,
        roomKey: firstRoomKey,
        roomName,
      },
    },
    {
      kind: 'narrative',
      text: `${charName} heads east to the ${roomName}.`,
      meta: {
        name: charName,
        direction: 'east',
        areaId,
        roomKey: firstRoomKey,
        roomName,
      },
    },
    { kind: 'system', text: 'Something unseen shifts in the dark.' },
    { kind: 'dialogue', text: 'Keep your wits about you.', speaker: 'Innkeeper' },
    { kind: 'dialogue', text: '...the dice are already thrown.' },
  ]

  // Ambush / stealth first-strike previews. Match the wording used in the
  // live explore() branch in tick.ts — NPC-greeting actor form for the
  // character so the sample reflects whatever tier the character is at.
  {
    const greetingName = formatActorName(character, 'npc-greeting')
    base.push({
      kind: 'narrative',
      text: `The ${mobName} catches ${greetingName} off guard! (Ambush — 2× damage)`,
      meta: { name: greetingName, mobName },
    })
    base.push({
      kind: 'narrative',
      text: `${greetingName} catches the ${mobName} off guard! (Ambush — 2× damage)`,
      meta: { name: greetingName, mobName },
    })
    base.push({
      kind: 'narrative',
      text: `${greetingName} slips from shadow and strikes the ${mobName} first! (Stealth — 3× damage)`,
      meta: { name: greetingName, mobName, stealth: true },
    })
  }

  // One damage entry per severity per direction. Severity + verb are
  // resolved via the real `damageVerb` selector, then the LogEntry is
  // built through the shared `formatAttackLog` helper that the live
  // combat loop uses — so the sample's wording and meta shape can't
  // drift from real damage entries.
  for (const target of ['mob', 'char'] as const) {
    for (const sev of severities) {
      const amount = sampleAmounts[sev]
      const atk = sampleAtk[sev]
      // Inputs tuned so damageVerb lands in the intended tier. For char→
      // mob we compare against the sampled mob max HP; for mob→char,
      // against the character's maxHp. damageVerb may still pick a
      // different tier if the ratio disagrees — in practice the sample
      // amounts / target max-HPs were chosen so the tiers align.
      const targetMax = target === 'mob' ? SAMPLE_TARGET_MAX_HP : character.maxHp
      const { severity, verb } = damageVerb(amount, targetMax, character.worldId, undefined, rng)
      base.push(
        formatAttackLog({
          direction: target === 'mob' ? 'char-to-mob' : 'mob-to-char',
          characterName: charName,
          mobName,
          verb,
          severity,
          amount,
          attackPower: atk,
          defense: sampleDef,
        }),
      )
      // Avoid unused-var warning on `sev` when the picker disagrees.
      void sev
    }
  }

  // Heal samples — a heal spell cast by the character (real `castSpell`
  // path so "knits flesh …" reflects the actual spell text), plus a
  // hardcoded mob self-heal / rest / meditate beat for the entries the
  // engine emits from tick-state handlers (not worth a full helper
  // extraction right now).
  const healSpell = getSpellList(character.worldId).find(
    (s) => s.effect.kind === 'heal',
  )
  if (healSpell) {
    const mockCaster: Character = {
      ...character,
      hp: 1,
      magic: character.maxMagic,
      spells: [healSpell.id, ...(character.spells ?? [])],
    }
    const cast = castSpell({ character: mockCaster, world, spell: healSpell, rng })
    for (const entry of cast.entries) base.push(entry)
  }
  // Rest summary — real helper, same string the rest handler emits at
  // the end of a rest state.
  base.push(formatRestSummaryLog(charName, 5, character.maxHp))
  // Mob self-heal line — real helper used by both fight-round branches.
  if (mobTemplate) {
    const sampleMob = spawn(mobTemplate)
    base.push(formatMobSelfHealLog(sampleMob.name, 8))
    // Mob-defeat "falls" line — real helper. Meta carries mobId /
    // mobRarity / curated / mobDefeat so the journal derivation path
    // and the renderer's bracketed-mob link stay exercised here too.
    base.push(formatMobDefeatLog({
      mob: sampleMob,
      awardedXp: 12,
      areaId: world.startingArea.id,
      roomName,
      rng,
    }))
  } else {
    base.push({
      kind: 'loot',
      text: `The ${mobName} falls. (+12 XP)`,
      meta: { mobName, xpText: '+12 XP', mobDefeat: true },
    })
  }
  // Meditate end-of-session summary — mix of MP + HP so the sample
  // exercises the "both pools" branch, which is the richest line.
  base.push(formatMeditateSummaryLog(charName, 8, Math.max(character.maxMagic, 20), 2, character.maxHp))
  // Gold pickup — real helper with the manifest's currency name.
  const manifest = getWorldManifest(character.worldId)
  const currency = (manifest?.currencyName ?? 'gold').toLowerCase()
  base.push(formatGoldPickupLog(charName, 12, currency, rng))
  // Item pickups at each rarity — real helper, so consumables still
  // paint in HP / MP tokens and the pickup meta shape matches live drops.
  if (item) {
    for (const r of rarities) {
      base.push(
        formatItemPickupLog({
          characterName: charName,
          def: item,
          rarity: r,
          qty: 1,
          areaId: world.startingArea.id,
        }),
      )
    }
  }
  // Consume samples — drive the real auto-consume logic with mocked-out
  // characters (forced-low stats, single-item inventory) so the sample log
  // matches exactly what the game produces at runtime. Skipped silently
  // if a world has no matching consumable archetype.
  const healDef = world.items.find(
    (i) => i.kind === 'consumable' && i.effect.kind === 'heal',
  )
  if (healDef) {
    const mockHeal: Character = {
      ...character,
      hp: 1,
      inventory: [
        { id: `sample-${healDef.id}`, archetypeId: healDef.id, name: healDef.name, quantity: 1 },
      ],
    }
    const result = maybeAutoConsume(mockHeal, world)
    if (result) base.push(result.entry)
  }
  const manaDef = world.items.find(
    (i) => i.kind === 'consumable' && i.effect.kind === 'restore-magic',
  )
  if (manaDef) {
    const mockMana: Character = {
      ...character,
      hp: character.maxHp,
      maxMagic: Math.max(character.maxMagic, 10),
      magic: 0,
      inventory: [
        { id: `sample-${manaDef.id}`, archetypeId: manaDef.id, name: manaDef.name, quantity: 1 },
      ],
    }
    const result = maybeAutoConsume(mockMana, world)
    if (result) base.push(result.entry)
  }
  // Equip samples — build two real EquipEvents and pass them through
  // `equipLogEntry`, the same function the auto-equip path calls. Any
  // change to equip wording or meta lands in both places.
  base.push(
    equipLogEntry(character, {
      slot: 'weapon',
      itemName,
      itemId,
      itemRarity: 'common',
    }),
    equipLogEntry(character, {
      slot: 'armor',
      itemName,
      itemId,
      itemRarity: 'common',
    }),
  )

  // Death losses — real engine. Feed `applyDeathPenalty` a mocked
  // character with xp / gold / one equipped weapon so all three
  // death-loss branches (equipment destroyed, XP lost, gold scattered)
  // fire and land in the sample log.
  if (item) {
    const mockCorpse: Character = {
      ...character,
      xp: Math.max(character.xp, 168),
      gold: Math.max(character.gold, 40),
      equipped: {
        ...character.equipped,
        weapon: {
          id: `sample-equip-${item.id}`,
          archetypeId: item.id,
          name: item.name,
          quantity: 1,
          rarity: 'common',
          level: 1,
        },
      },
    }
    const penalty = applyDeathPenalty(mockCorpse, rng)
    for (const e of penalty.entries) base.push(e)
  }

  // Condition lifecycle — use the real engine. Pick a DoT condition if
  // the world has one (so tickConditions emits a condition-tick damage
  // line); fall back to whichever condition is available.
  const dotCondition =
    world.conditions.find((c) => c.kind === 'dot') ?? world.conditions[0]
  if (dotCondition) {
    const gain = applyCondition(character, world, dotCondition.id, `the ${mobName}`)
    if (gain.entry) base.push(gain.entry)
    // Force remainingTicks=1 so the single tickConditions call emits both
    // a condition-tick (DoT damage) AND a condition-end on the same pass.
    // Start with plenty of HP so the DoT cap (hp > 1) doesn't swallow the
    // damage line.
    const primed: Character = {
      ...gain.character,
      hp: Math.max(10, character.hp),
      conditions: gain.character.conditions.map((c) =>
        c.id === dotCondition.id ? { ...c, remainingTicks: 1 } : c,
      ),
    }
    const ticked = tickConditions(primed, world, rng)
    for (const e of ticked.entries) base.push(e)
  }
  // Clear-conditions narrative — emitted by Resting in a safe room.
  const cleared = clearConditions({
    ...character,
    conditions: dotCondition
      ? [{ id: dotCondition.id, remainingTicks: 3 }]
      : character.conditions,
  })
  if (cleared.entry) base.push(cleared.entry)

  // System samples — sell, dev commands.
  base.push({
    kind: 'system',
    text: `[Dev] Sold 4 items for 38 gold.`,
  })

  // Level-up + title-earned chapters — sparkler-decorated celebrations.
  // Pair them so the dev preview shows them back-to-back (matches the
  // live ordering: the title-earned line follows immediately after the
  // level-up that crossed its threshold).
  base.push({
    kind: 'chapter',
    text: `🎉✨⭐ ${charName} rises to level 2! ⭐✨🎉`,
    meta: { name: charName, levelTo: 2 },
  })
  base.push({
    kind: 'chapter',
    text: `🎉✨⭐ Now everyone's gotta call ${charName} the Pathfinder. ⭐✨🎉`,
    meta: { name: charName, titleEarned: true, titleText: 'Pathfinder' },
  })

  return base
}

// Weighted picker for LLM-generated area kinds. Wilderness dominates
// because "road connecting zones" is the most common transition; towns
// are rare rest beats. The pick is deterministic on a seed so repeated
// gens from the same exit land on the same kind and hit the cache
// rather than fracturing across kinds.
const AREA_KIND_WEIGHTS: ReadonlyArray<readonly [AreaKind, number]> = [
  ['wilderness', 50],
  ['dungeon', 25],
  ['ruin', 15],
  ['settlement', 10],
]

function pickAreaKind(seed: string): AreaKind {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) | 0
  const total = AREA_KIND_WEIGHTS.reduce((s, [, w]) => s + w, 0)
  let r = Math.abs(h) % total
  for (const [kind, w] of AREA_KIND_WEIGHTS) {
    if (r < w) return kind
    r -= w
  }
  return 'wilderness'
}

function loadDevOpen(): boolean {
  try {
    return localStorage.getItem(DEV_OPEN_KEY) === '1'
  } catch {
    return false
  }
}

function saveDevOpen(open: boolean): void {
  try {
    localStorage.setItem(DEV_OPEN_KEY, open ? '1' : '0')
  } catch {
    // ignore
  }
}

function hasSeenLanding(): boolean {
  try {
    return localStorage.getItem(LANDING_SEEN_KEY) === '1'
  } catch {
    // On first boot under a localStorage-denied context we just
    // skip the landing — no way to record the dismissal, no point
    // showing it every load.
    return true
  }
}

function markLandingSeen(): void {
  try {
    localStorage.setItem(LANDING_SEEN_KEY, '1')
  } catch {
    // ignore
  }
}

function clearLandingSeen(): void {
  try {
    localStorage.removeItem(LANDING_SEEN_KEY)
  } catch {
    // ignore
  }
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'landing' }
  | { kind: 'roster' }
  | { kind: 'creating' }
  | { kind: 'playing'; character: Character; log: LogEntry[]; state: GameState; paused: boolean }
  | { kind: 'settings'; returnTo: Exclude<Phase, { kind: 'settings' | 'loading' }> }

export default function App() {
  const storage = useMemo<Storage>(() => new IndexedDBStorage(), [])
  const [entries, setEntries] = useState<RosterEntry[]>([])
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  // Post-commit mirror of `phase` so callbacks with empty deps (e.g.
  // handleDevCommand) can read the latest phase WITHOUT wrapping the
  // read in a `setPhase((p) => ...)` updater. Putting side effects
  // (setEvents, soundManager.play, ...) inside a setState updater is
  // the StrictMode double-invocation footgun — the updater runs twice
  // in dev, side effects fire twice, banners play twice. Reading
  // from a ref avoids that entirely.
  const phaseRef = useRef<Phase>(phase)
  // Same pattern for `sound` — handleSetVolume / handleToggleMute need
  // the latest sound state to compute the next snapshot, but doing so
  // inside a `setSound((prev) => ...)` updater would invoke the
  // updater twice in StrictMode, calling soundManager.configure +
  // unlock twice. Reading the ref lets us compute outside any updater.
  const soundRef = useRef<SoundSettings | null>(null)
  // doSave is declared later in the render body (it needs state that
  // isn't defined yet here). The dev-command handler up above reaches
  // it via this ref, populated by a mirror effect right after doSave's
  // declaration. Matches the phaseRef / soundRef forward-ref pattern.
  const doSaveRef = useRef<((c: Character) => void) | null>(null)
  const [effects, setEffects] = useState<Effects>(() => loadEffects())
  const [tickSpeed, setTickSpeed] = useState<TickSpeedId>(() => loadTickSpeed())
  const [sound, setSound] = useState<SoundSettings>(() => loadSoundSettings())
  const [events, setEvents] = useState<EffectEvent[]>([])
  const [fieldEvents, setFieldEvents] = useState<FieldFxEvent[]>([])
  const [elementEvents, setElementEvents] = useState<ElementFxEvent[]>([])
  const [devOpen, setDevOpen] = useState<boolean>(() => loadDevOpen())
  // Bumped whenever the player navigates away from the play surface
  // (to roster or Settings). EffectsOverlay watches this and tears down
  // any active/queued fullscreen effect the instant it changes, so a
  // level-up card or rare-area banner doesn't keep animating over the
  // roster grid or the Settings modal. Paired with `soundManager.stopAll()`
  // so audio tails are cut at the same instant as the visual.
  const [fxInterruptCounter, setFxInterruptCounter] = useState(0)
  const lastSnapRef = useRef<{
    characterId: string
    /** Full log array, NOT a length — the log has a 200-entry cap, so
     *  length-based diffs silently miss appends once we hit cap (every new
     *  entry evicts an older one, length stays constant). Set-identity
     *  diff (`nextLog.filter(e => !prevSet.has(e))`) is the robust form;
     *  mirrors the fix already in place for `deriveJournalEntries` inside
     *  runTick. */
    log: LogEntry[]
    stateKind: GameState['kind']
    character: Character
  } | null>(null)
  // When set, the next phase-derive pass swallows whatever happened without
  // firing fullscreen overlays, field floaters, element overlays, or SFX.
  // Used by the dev "Sample log" command so dumping ~50 entries at once
  // doesn't slam the player with confetti/screen-flashes/sound stings.
  const suppressFxOnceRef = useRef(false)
  // Effect-pause: when a fullscreen blocking effect fires we pause ticking
  // for the effect duration + a small buffer (see the pauseMs table).
  const effectPauseUntilRef = useRef(0)
  // Hover-pause: true while the mouse rests on a blocking card. Blocks
  // the tick loop from resuming even if the scripted pauseMs has
  // already elapsed, so hovering keeps the card — and the game —
  // frozen until the user moves off.
  const blockingHoverRef = useRef(false)
  // In-flight area generation keyed by a params signature that matches the
  // cache hash. Prior implementation keyed on exitRoomKey, but worlds with
  // multiple exits that share generation params (e.g. Millhaven's three
  // eastern exits) would produce identical hashes and bypass the guard —
  // firing a duplicate LLM call while the first was still inflight.
  const areaGenInflightRef = useRef<Set<string>>(new Set())
  // AbortController for the current in-flight area generation. Used to
  // cancel the LLM request on timeout or player death. Keyed by the
  // same sig as areaGenInflightRef.
  const areaGenAbortRef = useRef<Map<string, AbortController>>(new Map())
  // Post-defeat snapshot of the last mob we fought, rendered over the sprite
  // for DEFEAT_LINGER_MS so the defeat animation has something to shake.
  const [defeatedMob, setDefeatedMob] = useState<Mob | null>(null)
  const lastMobRef = useRef<Mob | null>(null)
  // Area-transition dialog gate — shown when the player hits an exit tile
  // that needs generation. 'no-llm' = no LLM configured; 'first-time' =
  // first gen attempt this session; 'portal-hub' = portal hub selection
  // dialog. null = no dialog active.
  const [areaGateDialog, setAreaGateDialog] = useState<'no-llm' | 'first-time' | 'portal-hub' | null>(null)
  // Mirror ref so the interval callback can read dialog state without
  // adding it to the effect's dep array (which would restart the timer
  // on every dialog open/close).
  const areaGateDialogRef = useRef<'no-llm' | 'first-time' | 'portal-hub' | null>(null)
  useEffect(() => { areaGateDialogRef.current = areaGateDialog }, [areaGateDialog])
  // Surface the Portal Hub dialog whenever the game enters portal-hub-select,
  // independent of the tick interval. The tick-interval gate at the bottom
  // of the tick callback covers auto-walk entries, but explicit transitions
  // (dev "Travel to portal hub", D-pad onto the hub) need to surface the
  // dialog without waiting for — or being blocked by — a tick. The interval
  // skips entirely while paused, and even unpaused there's a using-room
  // cadence delay (~1.6s); both made the dialog feel broken.
  const isPortalHubSelect =
    phase.kind === 'playing' &&
    phase.state.kind === 'using-room' &&
    phase.state.action.kind === 'portal-hub-select'
  useEffect(() => {
    if (!isPortalHubSelect) return
    if (areaGateDialogRef.current) return
    areaGateDialogRef.current = 'portal-hub'
    setAreaGateDialog('portal-hub')
  }, [isPortalHubSelect])
  // Per-session flag: true after the first-time dialog has been shown or
  // dismissed. Resets on page refresh (module-level would also work, but
  // a ref keeps it co-located with the component state it gates).
  const firstTransitionShownRef = useRef(false)
  // Epoch ms when the finding-path overlay started. Non-null means the
  // player defeated a gateway guardian but LLM gen is still running.
  // Drives the countdown timer in FindingPathOverlay.
  const [findingPathStart, setFindingPathStart] = useState<number | null>(null)
  // Keep the phase ref in sync so callbacks can read the latest value
  // without needing it in their dep list.
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])
  useEffect(() => {
    soundRef.current = sound
  }, [sound])

  // Leaving the play surface (to roster or Settings) must instantly tear
  // down whatever fullscreen effect is mid-animation — a level-up card or
  // rare-area banner keeps rendering over the roster otherwise, which
  // breaks immersion and looks like the game is still running behind the
  // menu. Bumping the counter signals EffectsOverlay to drop `active` +
  // `queue` and re-prime `seenRef` from the current events array, so a
  // return to play doesn't replay the interrupted banner. `stopAll()`
  // cuts any scheduled audio tail at the same instant.
  //
  // Tick pausing is already handled by the main tick effect's early
  // return (`if (phase.kind !== 'playing') return`) — no extra work
  // needed there. We also clear `effectPauseUntilRef` so a stale pause
  // window from before the navigation doesn't stall the first tick when
  // the player returns.
  const prevPhaseKindRef = useRef<Phase['kind']>(phase.kind)
  useEffect(() => {
    const prevKind = prevPhaseKindRef.current
    prevPhaseKindRef.current = phase.kind
    const leftPlay =
      prevKind === 'playing' && (phase.kind === 'roster' || phase.kind === 'settings')
    if (!leftPlay) return
    soundManager.stopAll()
    effectPauseUntilRef.current = 0
    setFxInterruptCounter((n) => n + 1)
  }, [phase.kind])

  const playingState = phase.kind === 'playing' ? phase.state : null
  useEffect(() => {
    if (playingState?.kind === 'fighting') {
      lastMobRef.current = playingState.mob
      return
    }
    const previous = lastMobRef.current
    lastMobRef.current = null
    if (!previous) return
    setDefeatedMob(previous)
    const id = window.setTimeout(
      () => setDefeatedMob(null),
      defeatLingerMs(previous.rarity),
    )
    // Cleanup runs when playingState changes again (e.g. a new fight starts):
    // cancel the pending fade-out and clear the overlay so the new scene
    // doesn't show the prior defeat on top.
    return () => {
      window.clearTimeout(id)
      setDefeatedMob(null)
    }
  }, [playingState])


  // Detect transition into finding-path: the game just entered
  // 'generating-area' but it's not the initial entry (the first-time
  // dialog has been shown and LLM is configured). This means the player
  // won a gateway fight and gen is still running.
  const prevStateKindRef = useRef<GameState['kind'] | null>(null)
  useEffect(() => {
    const prev = prevStateKindRef.current
    prevStateKindRef.current = playingState?.kind ?? null

    if (playingState?.kind === 'generating-area' && prev === 'fighting') {
      setFindingPathStart(Date.now())
    } else if (playingState?.kind !== 'generating-area' && findingPathStart !== null) {
      // Left the generating-area state (gen completed, timeout, or
      // player died). Clear the finding-path overlay.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFindingPathStart(null)
    }
  }, [playingState?.kind, findingPathStart])

  const reload = useCallback(async (): Promise<RosterEntry[]> => {
    const metas = await storage.saves.list()
    const records = await Promise.all(metas.map((m) => storage.saves.load(m.id)))
    const next: RosterEntry[] = records
      .filter((r): r is SaveRecord => r !== null)
      .map((r) => ({ character: migrateCharacter(r.data as Character), updatedAt: r.updatedAt }))
    setEntries(next)
    return next
  }, [storage])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      // Rehydrate any LLM-generated areas from the entity cache before we
      // show characters. Runs for every registered world — the graph is
      // per-world, so characters in any world see their generated areas
      // back in place on reload. Failures are swallowed: a missing cache
      // entry just means that area isn't restored, not that boot fails.
      await Promise.all(
        Object.entries(WORLD_CONTENTS).map(async ([worldId, world]) => {
          // Bespoke mobs + items must rehydrate first — a subsequent
          // curated encounter referencing a bespoke id only resolves if
          // the mob / item is already in world.mobs / world.items by
          // the time gameplay starts. Mobs and items are independent,
          // run them in parallel.
          await Promise.all([
            rehydrateBespokeMobs(world, worldId, storage.entities).catch(() => {}),
            rehydrateBespokeItems(world, worldId, storage.entities).catch(() => {}),
          ])
          await rehydrateGeneratedAreas(world, worldId, storage.entities).catch(() => {})
        }),
      )
      if (cancelled) return
      const loaded = await reload()
      if (cancelled) return
      // First-run gate: show the landing once. On subsequent boots we
      // skip straight to the normal creating / roster split so returning
      // users aren't stopped by a pitch screen they've already read.
      if (!hasSeenLanding()) {
        setPhase({ kind: 'landing' })
        return
      }
      setPhase(loaded.length === 0 ? { kind: 'creating' } : { kind: 'roster' })
    })()
    return () => {
      cancelled = true
    }
  }, [reload, storage])

  // Push sound config into the manager whenever it changes.
  useEffect(() => {
    soundManager.configure(sound)
  }, [sound])

  // Install a one-shot user-gesture listener so the browser lets the
  // AudioContext start. `unlock()` is idempotent, so removing the listeners
  // after the first event fires is safe.
  useEffect(() => {
    const unlock = () => {
      soundManager.unlock()
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      window.removeEventListener('touchstart', unlock)
    }
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    window.addEventListener('touchstart', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      window.removeEventListener('touchstart', unlock)
    }
  }, [])

  const stateKind = phase.kind === 'playing' ? phase.state.kind : null
  // Active speed: per-character override wins, falling back to the legacy
  // global setting for old saves that lack `tickSpeed`.
  const activeTickSpeed: TickSpeedId =
    phase.kind === 'playing' ? phase.character.tickSpeed ?? tickSpeed : tickSpeed

  useEffect(() => {
    if (phase.kind !== 'playing') return
    // Higher multiplier = faster ticks, so we divide the base cadence.
    // Clamp to 100ms just in case someone forces an absurd multiplier.
    const mult = tickSpeedMult(activeTickSpeed)
    const cadence = Math.max(100, Math.round(TICK_MS[phase.state.kind] / mult))
    const id = setInterval(() => {
      // Effect pause — skip ticking while a fullscreen overlay is active.
      if (blockingHoverRef.current) return
      if (Date.now() < effectPauseUntilRef.current) return
      // Area-transition dialog is showing — game is paused until the
      // player makes a choice.
      if (areaGateDialogRef.current) return
      setPhase((p) => {
        if (p.kind !== 'playing' || p.paused) return p
        const world = getWorldContent(p.character.worldId)
        if (!world) return p

        // If we're entering a generating-area state, check pre-conditions
        // before firing LLM generation. Dialog gates (no-LLM, first-time)
        // are checked here because the state updater can read the latest
        // phase snapshot; the dialog is surfaced via a ref-set that a
        // post-commit effect picks up.
        if (p.state.kind === 'generating-area') {
          const exitKey = p.state.exitRoomKey
          const config = loadLLMConfig()

          // Gate: no LLM configured — show the NoLLMDialog and freeze
          // in generating-area until the player picks an option.
          if (!isLLMConfigured(config)) {
            // Schedule the dialog to show. Using a ref write here
            // (inside a setState updater) is safe because it's
            // idempotent and the dialog render reads React state, not
            // this ref. The ref→state sync effect picks it up.
            if (!areaGateDialogRef.current) {
              areaGateDialogRef.current = 'no-llm'
              // Fire the state update outside the updater to avoid
              // StrictMode double-invocation issues.
              queueMicrotask(() => setAreaGateDialog('no-llm'))
            }

            return p
          }

          // Gate: first area transition this session — show tutorial
          // dialog before kicking off generation.
          if (!firstTransitionShownRef.current) {
            if (!areaGateDialogRef.current) {
              areaGateDialogRef.current = 'first-time'
              queueMicrotask(() => setAreaGateDialog('first-time'))
            }

            return p
          }

          if (isLLMConfigured(config)) {
            const graph = world.generatedAreaGraph
            if (countGeneratedAreas(graph) < MAX_GENERATED_AREAS) {
              const manifest = getWorldManifest(p.character.worldId)
              const klass = manifest?.classes.find((c) => c.id === p.character.classId)
              const area = world.areas?.find((a) => exitKey.startsWith(a.id + '::'))
              // Look up the exit room by the coordinates encoded in exitKey
              // so the exit's flavor name can seed the generated area.
              const [, exitCoords] = exitKey.split('::')
              const exitRoom = area && exitCoords ? area.rooms[exitCoords] : undefined
              // Signature matches the fields fed to areaGenTemplate. Includes
              // the exit name so sibling exits from the same area produce
              // distinct signatures (and distinct cache hashes) — otherwise
              // all three eastern Millhaven exits would collapse to one area.
              // Permanent frontiers append a timestamp so each visit
              // produces a unique signature and bypasses the cache.
              const baseSig = manifest && klass && area && exitRoom
                ? `${manifest.id}|${p.character.name}|${p.character.level}|${klass.name}|${area.name}|${exitRoom.name}`
                : null
              const sig = baseSig && exitRoom?.permanentFrontier
                ? `${baseSig}|${Date.now()}`
                : baseSig
              // Fire LLM generation if not already inflight. The inflight
              // guard prevents duplicate calls when the player re-enters
              // the exit (e.g. after dying to a gateway guardian).
              if (manifest && klass && area && exitRoom && sig && !areaGenInflightRef.current.has(sig)) {
                areaGenInflightRef.current.add(sig)
                const abortCtrl = new AbortController()
                areaGenAbortRef.current.set(sig, abortCtrl)
                const client = createLLMClient(config)
                // Pick a kind deterministically from the exit signature so
                // repeated gens from the same exit hit the cache instead
                // of fracturing across kinds. Weighted so wilderness is
                // common, settlements rare — matches the pacing where
                // towns are rest beats between explored zones.
                const areaKind = pickAreaKind(sig)
                // Build the shape first, then hand it to the LLM as a
                // flavor-only pass. Shape is seeded from the same sig so
                // repeated gens reproduce the exact same layout → same
                // cache hash → cache hit.
                const shape = generateShape(areaKind, sig)
                // Roll an aspirational area level 2-3 above the player
                // so generated content is harder and more rewarding than
                // the player's current turf.
                const areaLevel = p.character.level
                  + AREA_LEVEL_OFFSET_MIN
                  + Math.floor(Math.random() * AREA_LEVEL_OFFSET_RANGE)
                void generate(
                  areaGenTemplate,
                  {
                    worldId: manifest.id,
                    characterName: p.character.name,
                    characterLevel: p.character.level,
                    characterClass: klass.name,
                    areaLevel,
                    fromAreaName: area.name,
                    fromAreaDescription: '',
                    fromExitName: exitRoom.name,
                    areaKind,
                    rooms: shape,
                    allowedConcepts: manifest.allowedConcepts,
                    forbiddenConcepts: manifest.forbiddenConcepts,
                    // Pass the world's mob pool so the LLM can cherry-pick
                    // curated per-room encounters. Keep each entry small
                    // (id + name + level) — the prompt doesn't need full
                    // stats, and a compact list keeps the context budget
                    // friendly for worlds that grow their pool over time.
                    mobPool: world.mobs.map((m) => ({
                      id: m.id,
                      name: m.name,
                      level: m.level,
                    })),
                    // And the item pool, for curated-loot drops. Only
                    // id + name + kind are exposed — full stats would
                    // bloat the prompt and aren't needed for the LLM
                    // to pick thematically.
                    itemPool: world.items.map((i) => ({
                      id: i.id,
                      name: i.name,
                      kind: i.kind,
                    })),
                  },
                  world.context,
                  { llm: client, cache: storage.entities },
                  {
                    manifestVersion: manifest.version,
                    signal: abortCtrl.signal,
                    meta: {
                      characterName: p.character.name,
                      characterLevel: p.character.level,
                      worldId: manifest.id,
                      modelId: config.model,
                      generatedAt: Date.now(),
                    },
                  },
                ).then(async (result) => {
                  // Install any bespoke mobs the LLM invented inline
                  // BEFORE converting the payload to an Area. After
                  // this step every encounter is a by-id reference, and
                  // the new mobs are live in `world.mobs` + persisted
                  // to the entity cache so future generations can
                  // reference them (shared library grows per session).
                  const installMeta = {
                    characterName: p.character.name,
                    characterLevel: p.character.level,
                    worldId: manifest.id,
                    modelId: config.model,
                    generatedAt: Date.now(),
                  }
                  const installed = await installBespokeMobsFromPayload(
                    result.payload,
                    world,
                    manifest.id,
                    storage.entities,
                    installMeta,
                  )
                  const newArea = payloadToArea(installed, shape)
                  // Stamp the rolled area level (player + 2..3) so the
                  // dev Area tab and mob spawning scale to the aspirational
                  // difficulty, not the player's current level.
                  newArea.level = areaLevel
                  // Record when we generated this area so the dev panel
                  // can show age. Same epoch as installMeta.generatedAt
                  // so the cache + in-memory area stay consistent.
                  newArea.generatedAt = installMeta.generatedAt
                  // Persist the sampled area kind so the map panel's
                  // header chip knows whether the reader is in a
                  // settlement, wilderness, dungeon, or ruin — same value
                  // the shape generator was seeded with, now carried on
                  // the Area itself.
                  newArea.kind = areaKind
                  // Wire the exit room's destination to the new area's start.
                  const [areaId, roomCoords] = exitKey.split('::')
                  void storeGeneratedArea(storage.entities, newArea, manifest.id, installMeta)
                  setPhase((prev) => {
                    if (prev.kind !== 'playing') return prev
                    const currentWorld = getWorldContent(prev.character.worldId)
                    if (!currentWorld) return prev
                    // Add the new area to the world's areas array.
                    const updatedAreas = [...(currentWorld.areas ?? []), newArea]
                    currentWorld.areas = updatedAreas
                    // Update the exit room's destination — unless it is a
                    // permanent frontier, which must stay un-wired so the
                    // next visit triggers a fresh generation.
                    const srcArea = currentWorld.areas.find((a) => a.id === areaId)
                    if (srcArea && roomCoords) {
                      const exitRoom = srcArea.rooms[roomCoords]
                      if (exitRoom && !exitRoom.permanentFrontier) {
                        exitRoom.destination = {
                          areaId: newArea.id,
                          x: newArea.startX,
                          y: newArea.startY,
                          z: newArea.startZ,
                        }
                        exitRoom.pendingAreaGeneration = false
                      }
                      // Portal Hub — append the new area to the hub's
                      // destination list so the player can revisit it.
                      // Only portal-hub-triggered gens land here because
                      // exitRoomKey matches the hub's coords.
                      if (exitRoom && exitRoom.portalHub) {
                        const entry = {
                          areaId: newArea.id,
                          name: newArea.name,
                          generatedAt: installMeta.generatedAt,
                        }
                        exitRoom.portalDestinations = [
                          ...(exitRoom.portalDestinations ?? []),
                          entry,
                        ]
                      }
                    }
                    // Add a portal back from the new area to the exit room.
                    const startKey = `${newArea.startX},${newArea.startY},${newArea.startZ}`
                    const startRoom = newArea.rooms[startKey]
                    if (startRoom) {
                      startRoom.type = 'portal'
                      const [rx, ry, rz] = (roomCoords ?? '0,0,0').split(',').map(Number)
                      startRoom.destination = { areaId: areaId!, x: rx, y: ry, z: rz }
                    }
                    // Update the graph and persist it so the next session
                    // can rehydrate the cached area on boot.
                    currentWorld.generatedAreaGraph = {
                      ...(currentWorld.generatedAreaGraph ?? {}),
                      [exitKey]: newArea.id,
                    }
                    saveGeneratedAreaGraph(
                      prev.character.worldId,
                      currentWorld.generatedAreaGraph,
                    )
                    // Transition: character enters the new area.
                    const dest = {
                      areaId: newArea.id,
                      x: newArea.startX,
                      y: newArea.startY,
                      z: newArea.startZ,
                    }
                    const vk = `${newArea.id}:${newArea.startX},${newArea.startY},${newArea.startZ}`
                    const visitedRooms = prev.character.visitedRooms.includes(vk)
                      ? prev.character.visitedRooms
                      : [...prev.character.visitedRooms, vk]
                    const entryRoom = newArea.rooms[startKey]
                    let log = prev.log
                    log = [...log, { kind: 'area' as const, text: newArea.name, areaId: newArea.id, rarity: newArea.rarity }]
                    if (entryRoom) {
                      log = [...log, {
                        kind: 'narrative' as const,
                        text: `${prev.character.name} emerges into the ${entryRoom.name}. ${entryRoom.description}`,
                        meta: {
                          name: prev.character.name,
                          areaId: newArea.id,
                          roomKey: startKey,
                          roomName: entryRoom.name,
                        },
                      }]
                    }
                    return {
                      ...prev,
                      character: { ...prev.character, position: dest, visitedRooms },
                      log: log.slice(-200),
                      state: { kind: 'exploring' },
                    }
                  })
                }).catch((err) => {
                  console.warn('[LLM] Area generation failed:', err)
                  setPhase((prev) => {
                    if (prev.kind !== 'playing') return prev
                    return {
                      ...prev,
                      log: [...prev.log, {
                        kind: 'narrative' as const,
                        text: `${prev.character.name} senses the path ahead has not yet taken shape.`,
                        meta: { name: prev.character.name },
                      }].slice(-200),
                      state: { kind: 'exploring' },
                    }
                  })
                }).finally(() => {
                  areaGenInflightRef.current.delete(sig)
                  areaGenAbortRef.current.delete(sig)
                })
              }

              // Spawn a gateway guardian to mask gen latency. Fires
              // whether or not we just kicked off gen (gen may already
              // be inflight from a prior attempt). Only spawns when the
              // sig could be built — otherwise gen can't run and the
              // fight would loop forever with no resolution.
              //
              // The guardian template pick + ambush roll consume draws
              // from the character's RNG so this branch replays
              // identically from a saved seed, same as every other
              // game-logic choice.
              if (sig) {
                const rng = Rng.fromState(p.character.rngState)
                const guardian = spawnGatewayGuardian(rng)
                const fightResult = beginFight(p.character, p.log, guardian, { rng })

                return {
                  kind: 'playing',
                  character: { ...p.character, rngState: rng.save() },
                  log: fightResult.log,
                  state: {
                    ...fightResult.state,
                    gatewayExitKey: exitKey,
                  } as GameState,
                  paused: p.paused,
                }
              }
            }
          }
        }

        const next = runTick(
          { character: p.character, log: p.log, state: p.state },
          world,
        )

        // Portal Hub gate — when the tick transitions to portal-hub-select,
        // surface the selection dialog and freeze ticking until the player
        // picks an option.
        if (
          next.state.kind === 'using-room' &&
          next.state.action.kind === 'portal-hub-select' &&
          !areaGateDialogRef.current
        ) {
          areaGateDialogRef.current = 'portal-hub'
          queueMicrotask(() => setAreaGateDialog('portal-hub'))
        }

        return { kind: 'playing', ...next, paused: p.paused }
      })
    }, cadence)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.kind, stateKind, activeTickSpeed, storage])

  const handleDevCommand = useCallback((cmd: DevCommand) => {
    // Save runs outside the setPhase updater because doSave triggers
    // side effects (storage.save, setSavingFlash, another setPhase) —
    // doing that inside an updater would fire twice under StrictMode.
    if (cmd.kind === 'save') {
      const p = phaseRef.current
      if (p.kind !== 'playing') return
      // doSave is declared further down in render order, so reach it
      // through a ref populated by a mirror effect. Matches the
      // phaseRef / soundRef pattern for other callbacks with empty
      // deps that need late-render values.
      doSaveRef.current?.(p.character)
      return
    }
    // Effect-trigger commands don't touch phase; they push fake events into
    // the same queues that gameplay would, so the overlay pipeline renders
    // them identically to a real trigger.
    if (cmd.kind === 'fx-fullscreen') {
      // Read the current phase via the ref instead of wrapping this in a
      // setPhase((p) => ...) updater. The updater form gets double-
      // invoked under React 18 StrictMode in dev, and the side effects
      // below (setEvents + soundManager.play) would fire twice, making
      // the banner play twice and the SFX stutter.
      const p = phaseRef.current
      if (p.kind !== 'playing') return
      const id = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      let synthesized: EffectEvent | null = null
      switch (cmd.fx) {
        case 'level-up': {
          // Reuse the most recent level-up record so the fullscreen card
          // has real values to render. Falls back to a synthetic one at
          // the character's current level if none exists yet.
          const last = p.character.levelUps[p.character.levelUps.length - 1]
          const record = last ?? {
            at: Date.now(),
            from: Math.max(1, p.character.level - 1),
            to: p.character.level,
            goldAtLevelUp: p.character.gold,
            xpGained: 0,
          }
          synthesized = {
            id,
            kind: 'level-up',
            record,
            previousAt: p.character.createdAt,
            previousGold: 0,
          }
          break
        }
        case 'death':
          // Preview uses the live character's death count so the banner
          // matches what it'd look like on the next real death.
          synthesized = { id, kind: 'death', deathCount: p.character.deaths.length + 1 }
          break
        case 'damage-taken':
          synthesized = {
            id,
            kind: 'damage-taken',
            amount: Math.max(1, Math.round(p.character.maxHp * 0.25)),
            maxHp: p.character.maxHp,
          }
          break
        case 'damage-dealt':
          synthesized = { id, kind: 'damage-dealt', amount: 12 }
          break
        case 'heal-self':
          synthesized = {
            id,
            kind: 'heal-self',
            amount: Math.max(1, Math.round(p.character.maxHp * 0.2)),
            maxHp: p.character.maxHp,
          }
          break
        case 'loot':
          synthesized = { id, kind: 'loot' }
          break
        case 'enter-fight':
          synthesized = { id, kind: 'enter-fight' }
          break
        case 'new-area': {
          const world = getWorldContent(p.character.worldId)
          synthesized = {
            id,
            kind: 'new-area',
            name: world?.startingArea.name ?? 'New Area',
          }
          break
        }
        case 'rare-area': {
          const world = getWorldContent(p.character.worldId)
          synthesized = {
            id,
            kind: 'new-area',
            name: world?.startingArea.name ?? 'Rare Area',
            rarity: 'rare',
          }
          break
        }
        case 'new-mob': {
          const base =
            getWorldContent(p.character.worldId)?.mobs?.[0]?.name ?? 'Mysterious Beast'
          // Decorate with the rare prefix so the banner reads like a
          // real rare encounter and matches how live kills are named.
          synthesized = { id, kind: 'new-mob', name: mobDisplayName(base, 'rare') }
          break
        }
        case 'new-item': {
          const base =
            getWorldContent(p.character.worldId)?.items?.[0]?.name ?? 'Glimmering Relic'
          synthesized = { id, kind: 'new-item', name: base }
          break
        }
      }
      if (synthesized) {
        const ev = synthesized
        setEvents((es) => [...es, ev].slice(-EVENT_CAP))
        // Dev-panel synthesizer also needs to fire the matching SFX — the
        // live tick loop does this at the same spot where it queues the
        // effect event. Without this call, the overlay plays but the
        // speakers stay silent, which made the FX tab look broken.
        soundManager.play(ev)
      }
      return
    }
    if (cmd.kind === 'fx-field') {
      const id = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      setFieldEvents((fs) =>
        [...fs, { id, field: cmd.field, delta: cmd.delta }].slice(-EVENT_CAP),
      )
      return
    }
    if (cmd.kind === 'fx-element') {
      const id = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      setElementEvents((es) =>
        [...es, { id, target: cmd.target, element: cmd.element }].slice(-EVENT_CAP),
      )
      return
    }
    if (cmd.kind === 'play-sound') {
      // Route through soundManager.play with a minimal synthesized event —
      // no log, no overlay. Dev-only probe so the sound tab can audition
      // any catalog entry without firing the visual SFX pipeline. Using
      // the real manager API means a future regression in `play()` shows
      // up here too.
      const id = `dev-sound-${Date.now()}`
      let synth: EffectEvent
      switch (cmd.event) {
        case 'damage-taken':
        case 'heal-self':
          synth = { id, kind: cmd.event, amount: 25, maxHp: 100 }
          break
        case 'damage-dealt':
          synth = { id, kind: 'damage-dealt', amount: 12 }
          break
        case 'level-up':
        case 'death':
        case 'loot':
        case 'enter-fight':
        case 'llm-connected':
        case 'generating-area':
          synth = { id, kind: cmd.event } as EffectEvent
          break
        case 'new-area':
          synth = { id, kind: 'new-area', name: 'Preview' }
          break
        case 'new-mob':
          synth = { id, kind: 'new-mob', name: 'Preview' }
          break
        case 'new-item':
          synth = { id, kind: 'new-item', name: 'Preview' }
          break
        case 'gold-windfall':
          synth = { id, kind: 'gold-windfall', amount: 100 } as EffectEvent
          break
        case 'gold-jackpot':
          synth = { id, kind: 'gold-jackpot', amount: 1000 } as EffectEvent
          break
        default:
          synth = { id, kind: cmd.event } as EffectEvent
      }
      soundManager.unlock()
      // forcePlay bypasses mute / disabled / per-event toggles so the dev
      // panel's Sound tab can preview any SFX even during a muted session.
      soundManager.forcePlay(synth)
      return
    }

    setPhase((p) => {
      if (p.kind !== 'playing') return p
      const world = getWorldContent(p.character.worldId)
      if (!world) return p
      const appendLog = (entry: LogEntry): LogEntry[] =>
        [...p.log, entry].slice(-200)

      switch (cmd.kind) {
        case 'pause':
          return p.paused ? p : { ...p, paused: true }

        case 'resume':
          return p.paused ? { ...p, paused: false } : p


        case 'tick-once': {
          if (!p.paused) return p
          const next = runTick(
            { character: p.character, log: p.log, state: p.state },
            world,
          )
          return { ...p, ...next, paused: true }
        }

        case 'level-up': {
          const result = applyOneLevel(p.character, { logPrefix: '[dev] ', rng: Rng.random() })
          return {
            ...p,
            character: { ...result.character, xp: 0 },
            log: [...p.log, ...result.logEntries].slice(-200),
          }
        }

        case 'spawn-fight': {
          if (world.mobs.length === 0) return p
          const devRng = Rng.random()
          const template = world.mobs[devRng.nextInt(world.mobs.length)]
          const mob = spawn(template)
          // Route through the shared encounter opener so ambush rolls and
          // narrative wording stay identical to a live-tick spawn.
          const started = beginFight(p.character, p.log, mob, {
            logPrefix: '[dev] ',
            rng: devRng,
          })
          return { ...p, state: started.state, log: started.log }
        }

        case 'spawn-fight-at': {
          const template = world.mobs.find((m) => m.id === cmd.mobId)
          if (!template) return p
          const mob = spawn(template, cmd.rarity)
          const started = beginFight(p.character, p.log, mob, {
            logPrefix: '[dev] ',
            rng: Rng.random(),
          })
          return { ...p, state: started.state, log: started.log }
        }

        case 'give-item': {
          const def = world.items.find((i) => i.id === cmd.itemId)
          if (!def) return p
          const rarity: Rarity = cmd.rarity
          // Dev gifts use the character's level so they're useful immediately
          // without needing a level slider on the panel — match-the-character
          // is the most common dev intent.
          const itemLevel =
            def.kind === 'equipment' || def.kind === 'scroll'
              ? Math.max(1, p.character.level)
              : 1
          // Shared stacking helper — identical path to a live loot drop so a
          // future fix to stack semantics (e.g. level/rarity matching) covers
          // both the game and dev panel at once.
          const inventory = addItemToInventory(
            p.character.inventory,
            def,
            1,
            rarity,
            itemLevel,
            { at: Date.now(), source: 'dev' },
          )
          return {
            ...p,
            character: { ...p.character, inventory },
            log: appendLog({
              kind: 'loot',
              text: `[dev] ${p.character.name} conjures ${def.name}.`,
              meta: {
                name: p.character.name,
                itemId: def.id,
                itemName: def.name,
                itemRarity: rarity,
              },
            }),
          }
        }

        case 'set-ticks': {
          // Lifetime tick counter — clamp to non-negative integers. Pure
          // state override: runTick's auto-ramp checks and the save
          // cadence key off character.ticks organically, so we let them
          // notice the change on the next live tick instead of
          // retroactively firing their side effects here. A big forward
          // jump will trip the every-50-ticks save exactly once the next
          // time the save effect runs — that's the desired read (persist
          // the manually-scrubbed state), not a thrash.
          const target = Math.max(0, Math.round(cmd.value))
          return {
            ...p,
            character: { ...p.character, ticks: target },
          }
        }

        case 'set-value': {
          const c = p.character
          let next = c
          switch (cmd.field) {
            case 'hp':
              next = { ...c, hp: Math.max(0, Math.min(c.maxHp, Math.round(cmd.value))) }
              break
            case 'maxHp': {
              const m = Math.max(1, Math.round(cmd.value))
              next = { ...c, maxHp: m, hp: Math.min(c.hp, m) }
              break
            }
            case 'xp':
              next = { ...c, xp: Math.max(0, Math.round(cmd.value)) }
              break
            case 'magic':
              next = {
                ...c,
                magic: Math.max(0, Math.min(c.maxMagic, Math.round(cmd.value))),
              }
              break
            case 'maxMagic': {
              const m = Math.max(0, Math.round(cmd.value))
              next = { ...c, maxMagic: m, magic: Math.min(c.magic, m) }
              break
            }
            case 'gold':
              next = { ...c, gold: Math.max(0, Math.round(cmd.value)) }
              break
            case 'level': {
              const target = Math.max(1, Math.round(cmd.value))
              if (target > c.level) {
                // Apply each intermediate level-up so HP/MP/stat gains land
                // exactly as they would through XP grinding. Jumping down
                // doesn't try to reverse gains — out of scope for a dev knob.
                let character = c
                let log = p.log
                const devRng = Rng.random()
                while (character.level < target) {
                  const result = applyOneLevel(character, {
                    logPrefix: '[dev] ',
                    rng: devRng,
                  })
                  character = result.character
                  log = [...log, ...result.logEntries].slice(-200)
                }
                return { ...p, character, log }
              }
              next = { ...c, level: target }
              break
            }
            case 'hunger':
            case 'fatigue':
            case 'greed':
            case 'curiosity':
            case 'weight':
              next = {
                ...c,
                drives: {
                  ...c.drives,
                  [cmd.field]: Math.max(0, Math.min(100, Math.round(cmd.value))),
                },
              }
              break
          }
          return { ...p, character: next }
        }

        case 'die': {
          const area = world.startingArea
          const respawn = p.character.lastSafePosition ?? {
            areaId: area.id,
            x: area.startX,
            y: area.startY,
            z: area.startZ,
          }
          const respawnRoom = area.rooms[roomKey(respawn.x, respawn.y, respawn.z)]
          const deathRk = roomKey(p.character.position.x, p.character.position.y, p.character.position.z)
          const record: DeathRecord = {
            at: Date.now(),
            cause: 'Dev-killed',
            areaId: area.id,
            roomName: area.rooms[deathRk]?.name,
            roomKey: deathRk,
          }
          return {
            ...p,
            character: {
              ...p.character,
              hp: p.character.maxHp,
              position: respawn,
              deaths: [...p.character.deaths, record],
            },
            state: { kind: 'exploring' },
            log: appendLog({
              kind: 'narrative',
              text: `[dev] ${p.character.name} falls. They wake again in the ${respawnRoom?.name ?? 'starting area'}.`,
              meta: {
                name: p.character.name,
                areaId: area.id,
                roomKey: roomKey(respawn.x, respawn.y, respawn.z),
                roomName: respawnRoom?.name,
                // Flag drives the death EffectEvent — without it the
                // fullscreen banner / SFX stinger / death panel never
                // fire because derive.ts only synthesizes a death
                // event on entries with meta.isDeath set.
                isDeath: true,
              },
            }),
          }
        }

        case 'heal-full':
          return {
            ...p,
            character: { ...p.character, hp: p.character.maxHp },
          }

        case 'force-rest':
          // Transition into the resting state for one duration. Subsequent
          // ticks run the normal rest handler which ticks HP upward.
          return { ...p, state: { kind: 'resting', ticksLeft: 6 } }

        case 'force-meditate':
          return { ...p, state: { kind: 'meditating', ticksLeft: 6 } }

        case 'max-drives':
          return {
            ...p,
            character: {
              ...p.character,
              drives: { hunger: 100, fatigue: 100, greed: 100, curiosity: 100, weight: p.character.drives.weight },
            },
          }

        case 'drain-drives':
          return {
            ...p,
            character: {
              ...p.character,
              drives: { hunger: 0, fatigue: 0, greed: 0, curiosity: 0, weight: p.character.drives.weight },
            },
          }

        case 'add-gold':
          return {
            ...p,
            character: { ...p.character, gold: p.character.gold + cmd.amount },
          }

        case 'apply-condition': {
          const applied = applyCondition(p.character, world, cmd.conditionId, 'dev')
          return {
            ...p,
            character: applied.character,
            log: applied.entry ? appendLog(applied.entry) : p.log,
          }
        }

        case 'clear-conditions': {
          const cleared = clearConditions(p.character)
          return {
            ...p,
            character: cleared.character,
            log: cleared.entry ? appendLog(cleared.entry) : p.log,
          }
        }

        case 'sell-items': {
          const sellResult = pickItemsToSell(p.character, world.items)
          if (sellResult.sold.length === 0) return p
          const mf = getWorldManifest(p.character.worldId)
          const cur = (mf?.currencyName ?? 'gold').toLowerCase()
          const n = sellResult.sold.reduce((s, e) => s + (e.item.quantity ?? 1), 0)
          const updatedChar: Character = {
            ...p.character,
            inventory: sellResult.remainingInventory,
            gold: p.character.gold + sellResult.totalGold,
          }
          const sellLog: LogEntry[] = [
            ...p.log,
            {
              kind: 'system' as const,
              text: `[Dev] Sold ${n} items for ${sellResult.totalGold} ${cur}.`,
            },
          ].slice(-200)
          return { ...p, character: updatedChar, log: sellLog }
        }

        case 'sacrifice-items': {
          const result = pickItemsToSacrifice(p.character, world.items)
          if (result.sacrificed.length === 0) return p
          const mf = getWorldManifest(p.character.worldId)
          const cur = (mf?.currencyName ?? 'gold').toLowerCase()
          const phrase = mf?.sacrificePhrase ?? 'The gods smile and grant'
          const n = result.sacrificed.reduce((s, e) => s + (e.item.quantity ?? 1), 0)
          const updatedChar: Character = {
            ...p.character,
            inventory: result.remainingInventory,
            gold: p.character.gold + result.totalGold,
          }
          const noun = n === 1 ? 'item' : 'items'
          const text = `${p.character.name} sacrifices ${n} ${noun}. ${phrase} ${result.totalGold} ${cur}.`
          const sacLog: LogEntry[] = [
            ...p.log,
            { kind: 'loot' as const, text, meta: { goldAmount: result.totalGold } },
          ].slice(-200)
          return { ...p, character: updatedChar, log: sacLog }
        }

        case 'move-direction': {
          const pos = p.character.position
          const area = world.areas?.find((a) => a.id === pos.areaId) ?? world.startingArea
          const target = { areaId: pos.areaId, x: pos.x + cmd.dx, y: pos.y + cmd.dy, z: pos.z + cmd.dz }
          const targetRoom = area.rooms[roomKey(target.x, target.y, target.z)]
          if (!targetRoom) return p

          const addVisited = (rooms: string[], key: string): string[] =>
            rooms.includes(key) ? rooms : [...rooms, key]

          // Portal Hub — step onto the tile and immediately open the
          // multi-destination selection dialog. Skips the
          // areaFullyExplored gate the tick loop applies to auto-walked
          // gateways because the D-pad is an explicit user choice.
          if (targetRoom.portalHub) {
            const visitedRooms = addVisited(
              p.character.visitedRooms,
              visitedKey(area.id, target.x, target.y, target.z),
            )
            const movedChar = { ...p.character, position: target, visitedRooms }
            const rk = roomKey(target.x, target.y, target.z)

            return {
              ...p,
              character: movedChar,
              state: {
                kind: 'using-room',
                action: { kind: 'portal-hub-select', roomKey: rk },
              },
            }
          }

          // If the target cell is a portal (or a wired exit), traverse it in
          // one step rather than landing on the portal tile. Mirrors the tick
          // loop's traversal so the map + position end up where the player
          // expects instead of sitting on the portal icon.
          const traversable =
            (targetRoom.type === 'portal' || targetRoom.type === 'exit') &&
            targetRoom.destination
          let movedChar: Character
          if (traversable && targetRoom.destination) {
            const dest = targetRoom.destination
            let visitedRooms = addVisited(
              p.character.visitedRooms,
              visitedKey(area.id, target.x, target.y, target.z),
            )
            visitedRooms = addVisited(
              visitedRooms,
              visitedKey(dest.areaId, dest.x, dest.y, dest.z),
            )
            movedChar = { ...p.character, position: dest, visitedRooms }
          } else {
            const visitedRooms = addVisited(
              p.character.visitedRooms,
              visitedKey(area.id, target.x, target.y, target.z),
            )
            movedChar = { ...p.character, position: target, visitedRooms }
          }

          // The D-pad is authoritative: move where the dev clicked and stop.
          // It used to call `runTick` to "feel like a game action," but the
          // tick's own `explore` step would call `moveByGoal` from the new
          // position and immediately walk the character somewhere else,
          // making the D-pad feel like it didn't control movement. Use
          // `tick-once` afterwards if you want drives / cooldowns / encounter
          // rolls to advance with the step.
          return { ...p, character: movedChar }
        }

        case 'purge-generated-areas': {
          // One-shot dev cleanup: wipe every LLM-generated area for the
          // current world, the persisted exit→area graph, and any
          // derived wiring on authored exit rooms. Authored areas stay
          // intact. If the character is standing in an area that's
          // about to disappear, snap them back to the world's start.
          const worldId = p.character.worldId
          const authoredIds = new Set(
            (world.areas ?? [world.startingArea]).map((a) => a.id),
          )
          // Filter to authored-only.
          world.areas = (world.areas ?? []).filter((a) => authoredIds.has(a.id))
          // Reset authored exit rooms to their pre-gen state so stepping
          // into them triggers a fresh gen on the next tick.
          for (const a of world.areas) {
            for (const room of Object.values(a.rooms)) {
              if (room.type === 'exit') {
                room.destination = undefined
                room.pendingAreaGeneration = true
              }
            }
          }
          // Clear the graph (runtime + localStorage).
          world.generatedAreaGraph = {}
          saveGeneratedAreaGraph(worldId, {})
          // Delete every areaGen:* cache entry for this world.
          void storage.entities
            .deleteByTemplateAndWorld('areaGen', worldId)
            .catch(() => {})
          // Snap the character home if their current area was purged.
          const charArea = p.character.position.areaId
          let next = p
          if (!authoredIds.has(charArea)) {
            const start = world.startingArea
            const destPos = {
              areaId: start.id,
              x: start.startX,
              y: start.startY,
              z: start.startZ,
            }
            const vk = visitedKey(destPos.areaId, destPos.x, destPos.y, destPos.z)
            const visitedRooms = p.character.visitedRooms.includes(vk)
              ? p.character.visitedRooms
              : [...p.character.visitedRooms, vk]
            next = {
              ...next,
              character: { ...p.character, position: destPos, visitedRooms },
              state: { kind: 'exploring' },
            }
          }
          return {
            ...next,
            log: appendLog({
              kind: 'system',
              text: '[dev] Purged generated areas and reset the exit graph.',
            }),
          }
        }

        case 'travel-to-area': {
          // Dev-only inter-area teleport. Lands on the target area's
          // authored start cell so we always drop into a valid tile,
          // reveals every room in the area on the map (dev convenience
          // — normal play still requires visiting each cell), and resets
          // to exploring since any combat state wouldn't carry across
          // areas.
          const target = world.areas?.find((a) => a.id === cmd.areaId)
          if (!target) return p
          const destPos = {
            areaId: target.id,
            x: target.startX,
            y: target.startY,
            z: target.startZ,
          }
          const existing = new Set(p.character.visitedRooms)
          for (const room of Object.values(target.rooms)) {
            existing.add(visitedKey(target.id, room.x, room.y, room.z))
          }
          const visitedRooms = Array.from(existing)
          const startRoom = target.rooms[roomKey(destPos.x, destPos.y, destPos.z)]
          const destName = startRoom?.name ?? target.name
          return {
            ...p,
            character: { ...p.character, position: destPos, visitedRooms },
            state: { kind: 'exploring' },
            log: appendLog({
              kind: 'narrative',
              text: `[dev] ${p.character.name} is whisked away to the ${destName} (${target.name}).`,
              meta: { name: p.character.name, areaId: target.id },
            }),
          }
        }

        case 'travel-to-portal-hub': {
          // Dev-only teleport directly to the portal hub tile. Scans every
          // area for the room flagged `portalHub: true` and lands the
          // character on that exact cell (not the area's start). Reveals
          // every room in the host area for dev convenience and drops
          // straight into the portal-hub-select dialog state — without
          // this the player would land on the tile but the tick's
          // `explore()` only checks the *next* room, so the dialog
          // would never fire until they D-padded off and back on.
          for (const area of world.areas ?? []) {
            const hubEntry = Object.entries(area.rooms).find(
              ([, r]) => r.portalHub === true,
            )
            if (!hubEntry) continue
            const [, hubRoom] = hubEntry
            const destPos = {
              areaId: area.id,
              x: hubRoom.x,
              y: hubRoom.y,
              z: hubRoom.z,
            }
            const existing = new Set(p.character.visitedRooms)
            for (const room of Object.values(area.rooms)) {
              existing.add(visitedKey(area.id, room.x, room.y, room.z))
            }
            const visitedRooms = Array.from(existing)
            const destName = hubRoom.name ?? 'the portal hub'
            const rk = roomKey(destPos.x, destPos.y, destPos.z)

            return {
              ...p,
              character: { ...p.character, position: destPos, visitedRooms },
              state: {
                kind: 'using-room',
                action: { kind: 'portal-hub-select', roomKey: rk },
              },
              log: appendLog({
                kind: 'narrative',
                text: `[dev] ${p.character.name} is whisked away to the ${destName} (${area.name}).`,
                meta: { name: p.character.name, areaId: area.id },
              }),
            }
          }

          return p
        }

        case 'reset-location': {
          // Teleport home — world's startingArea + starting (x, y, z).
          // In fantasy that lands the character in The Crow & Cup. Drops
          // any combat state since fighting over there doesn't make
          // sense, and snaps exploring back to idle so the next tick
          // plans from the new spot.
          const start = world.startingArea
          const destPos = {
            areaId: start.id,
            x: start.startX,
            y: start.startY,
            z: start.startZ,
          }
          const visitedRooms = p.character.visitedRooms.includes(
            visitedKey(destPos.areaId, destPos.x, destPos.y, destPos.z),
          )
            ? p.character.visitedRooms
            : [
                ...p.character.visitedRooms,
                visitedKey(destPos.areaId, destPos.x, destPos.y, destPos.z),
              ]
          const startRoom = start.rooms[roomKey(destPos.x, destPos.y, destPos.z)]
          const destName = startRoom?.name ?? start.name
          return {
            ...p,
            character: { ...p.character, position: destPos, visitedRooms },
            state: { kind: 'exploring' },
            log: appendLog({
              kind: 'narrative',
              text: `[dev] ${p.character.name} is whisked back to the ${destName}.`,
              meta: { name: p.character.name },
            }),
          }
        }

        case 'clear-log':
          return { ...p, log: [] }

        case 'log-samples':
          // Mark the next derive pass as one-shot-suppressed so the dump
          // doesn't trigger ~50 fullscreen flashes + sound stingers.
          suppressFxOnceRef.current = true
          return { ...p, log: buildLogSamples(p.character, world).slice(-200) }
      }
    })
  }, [])

  const toggleDev = useCallback(() => {
    setDevOpen((v) => {
      const next = !v
      saveDevOpen(next)
      // Hiding the panel resumes the game — opening auto-pauses, so closing
      // should symmetrically get you back to playing.
      if (!next) handleDevCommand({ kind: 'resume' })
      return next
    })
  }, [handleDevCommand])

  const closeDev = useCallback(() => {
    setDevOpen(false)
    saveDevOpen(false)
    handleDevCommand({ kind: 'resume' })
  }, [handleDevCommand])

  const phaseKind = phase.kind
  useEffect(() => {
    if (phaseKind !== 'playing') return
    const isEditable = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false
      const tag = el.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '!') return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isEditable(e.target)) return
      e.preventDefault()
      toggleDev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phaseKind, toggleDev])

  const playingCharacter = phase.kind === 'playing' ? phase.character : null

  // Save cadence: every 50 ticks + immediately on milestone events
  // (level-up, death, new area visited). Tracking the last successful
  // save lets the boot indicator read "just saved X ticks ago" without
  // thrashing IndexedDB on every frame of a combat round.
  const lastSavedTickRef = useRef<number>(0)
  const lastSavedCountsRef = useRef<{ deaths: number; levelUps: number; areas: number }>({
    deaths: 0,
    levelUps: 0,
    areas: 0,
  })
  // Tracks which character the auto-save baseline has been seeded for.
  // The first effect run for a freshly-created character would otherwise
  // see `areas: 1` (their starting room) against the default-zero
  // baseline, fire a milestone save at tick 0, and drop the ambient
  // "Things seem safer now…" line before the player has even moved.
  // Seeding without saving on the first run per character keeps the
  // first save line aligned with the 50-tick cadence.
  const baselineSeededIdRef = useRef<string | null>(null)
  const [savingFlash, setSavingFlash] = useState(false)
  const savingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Actual save routine — writes the character, pulses the topbar
  // saving indicator, and drops a narrative echo in the log. Called
  // from the auto-save effect (on milestone / cadence) and from the
  // dev "Save" button (always, regardless of cadence).
  const doSave = useCallback((character: Character) => {
    lastSavedTickRef.current = character.ticks ?? 0
    const areaIds = new Set(character.visitedRooms.map((k) => k.split(':')[0]))
    lastSavedCountsRef.current = {
      deaths: character.deaths.length,
      levelUps: character.levelUps.length,
      areas: areaIds.size,
    }
    void storage.saves.save({
      id: character.id,
      name: character.name,
      createdAt: character.createdAt,
      updatedAt: Date.now(),
      data: character,
    })
    // Flash the "saving" indicator for ~1.4s — long enough to read,
    // short enough to feel transient. Clear any pending timeout so
    // back-to-back saves don't shorten the flash.
    setSavingFlash(true)
    if (savingTimerRef.current) clearTimeout(savingTimerRef.current)
    savingTimerRef.current = setTimeout(() => setSavingFlash(false), 1400)
    // Textual echo in the log — system-style italic ambient line so it
    // reads like the "Something unseen shifts in the dark." atmospheric
    // openers rather than a plain narrative beat.
    setPhase((prev) => {
      if (prev.kind !== 'playing') return prev
      return {
        ...prev,
        log: [
          ...prev.log,
          {
            kind: 'system' as const,
            text: 'Things seem safer now, to a point…',
          },
        ].slice(-200),
      }
    })
  }, [storage])

  // Mirror doSave into the forward ref so handleDevCommand (declared
  // up-file) can invoke it from the 'save' dev button.
  useEffect(() => {
    doSaveRef.current = doSave
  }, [doSave])

  useEffect(() => {
    if (!playingCharacter) return
    const ticks = playingCharacter.ticks ?? 0
    const deaths = playingCharacter.deaths.length
    const levelUps = playingCharacter.levelUps.length
    const areaIds = new Set(playingCharacter.visitedRooms.map((k) => k.split(':')[0]))
    const areas = areaIds.size
    // First run for this character — sync the baseline silently so the
    // 50-tick cadence is the first thing that fires a save / log line.
    // Handles fresh creates (where the starting room counts as +1 area)
    // and roster switches (where the on-disk save is already current).
    if (baselineSeededIdRef.current !== playingCharacter.id) {
      baselineSeededIdRef.current = playingCharacter.id
      lastSavedTickRef.current = ticks
      lastSavedCountsRef.current = { deaths, levelUps, areas }
      return
    }
    const last = lastSavedCountsRef.current
    const milestone =
      deaths !== last.deaths ||
      levelUps !== last.levelUps ||
      areas !== last.areas
    const onCadence = ticks - lastSavedTickRef.current >= 50
    if (!milestone && !onCadence) return
    doSave(playingCharacter)
  }, [playingCharacter, doSave])

  // On-demand title generation past level 100. If the playing character is
  // wearing a title index beyond the hand-authored ladder and no LLM result
  // has landed yet, kick off one generation and write the result back to the
  // character so the sheet + leveling dialog can render it. Guarded by an
  // in-flight set keyed by (characterId, index) so the same request isn't
  // fired on every tick re-render.
  const titleGenInflight = useRef<Set<string>>(new Set())
  const playingTitleIndex = playingCharacter
    ? currentTitleIndex(playingCharacter.level)
    : -1
  const playingTitleResolved =
    !playingCharacter ||
    playingTitleIndex <= LAST_AUTHORED_TITLE_INDEX ||
    !!playingCharacter.generatedTitles?.[playingTitleIndex]
  useEffect(() => {
    if (!playingCharacter) return
    const char = playingCharacter
    const index = playingTitleIndex
    if (playingTitleResolved) return

    const config = loadLLMConfig()
    if (!isLLMConfigured(config)) return

    const manifest = getWorldManifest(char.worldId)
    const klass = manifest?.classes.find((c) => c.id === char.classId)
    const content = getWorldContent(char.worldId)
    if (!manifest || !klass || !content) return

    const key = `${char.id}:${index}`
    if (titleGenInflight.current.has(key)) return
    titleGenInflight.current.add(key)

    void (async () => {
      try {
        const client = createLLMClient(config)
        const prior = resolveTitle(char, index - 1).text ?? undefined
        const result = await generate(
          classTitleTemplate,
          {
            worldId: manifest.id,
            className: klass.name,
            classDescription: klass.description,
            level: levelForTitleIndex(index),
            titleIndex: index,
            priorTitle: prior,
            allowedConcepts: manifest.allowedConcepts,
            forbiddenConcepts: manifest.forbiddenConcepts,
          },
          content.context,
          { llm: client, cache: storage.entities },
          { manifestVersion: manifest.version, maxTokens: 60 },
        )
        setPhase((p) => {
          if (p.kind !== 'playing' || p.character.id !== char.id) return p
          const existing = p.character.generatedTitles ?? {}
          if (existing[index]) return p
          return {
            ...p,
            character: {
              ...p.character,
              generatedTitles: { ...existing, [index]: result.payload.text },
            },
          }
        })
      } catch (err) {
        // Non-fatal — title stays empty on the sheet and the game continues.
        console.warn('Title generation failed', err)
      } finally {
        titleGenInflight.current.delete(key)
      }
    })()
  }, [playingCharacter, playingTitleIndex, playingTitleResolved, storage])

  useEffect(() => {
    if (phase.kind !== 'playing') {
      lastSnapRef.current = null
      return
    }
    // The dev "Sample log" command sets this flag immediately before
    // dumping a giant batch of synthetic entries — we re-snapshot
    // lastSnapRef without firing any FX/SFX so the screen doesn't flood
    // with confetti and stingers when the dump lands. One-shot: cleared
    // on the same pass that consumes it.
    if (suppressFxOnceRef.current) {
      suppressFxOnceRef.current = false
      lastSnapRef.current = {
        characterId: phase.character.id,
        log: phase.log,
        stateKind: phase.state.kind,
        character: phase.character,
      }
      return
    }
    const prev = lastSnapRef.current
    const sameRun = prev && prev.characterId === phase.character.id
    if (sameRun) {
      // Set-identity diff instead of a length-based slice. Once the log
      // reaches its 200-entry cap every append evicts an older entry, so
      // `prev.log.length === phase.log.length` even when new entries
      // landed — a length diff silently drops them and the sound/effect
      // pipeline goes silent. This matches the fix already in place for
      // `deriveJournalEntries` inside runTick.
      const prevSet = new Set(prev.log)
      const newLogEntries = phase.log.filter((e) => !prevSet.has(e))
      const fresh = deriveEvents({
        prevStateKind: prev.stateKind,
        newLogEntries,
        nextStateKind: phase.state.kind,
        characterName: phase.character.name,
        character: phase.character,
      })
      if (fresh.length > 0) {
        setEvents((es) => [...es, ...fresh].slice(-EVENT_CAP))
        for (const ev of fresh) {
          soundManager.play(ev)
          // Pause ticking for the duration of every blocking fullscreen
          // effect. Durations buffer a bit past the visual animation so a
          // tight follow-up event doesn't fire under the tail of the
          // card. Level-up pulls from the same per-level ladder used to
          // drive the card's CSS duration so the two stay in sync. A user
          // clicking the Continue button clears this pause early via the
          // onBlockingDismiss callback on EffectsOverlay.
          const pauseMs =
            ev.kind === 'new-area' ? 2700
            : ev.kind === 'new-mob' ? 2000
            : ev.kind === 'new-item' ? 2000
            : ev.kind === 'generating-area' ? 3700
            : ev.kind === 'level-up' ? levelUpDurationMs(ev.record.to) + 400
            : ev.kind === 'death' ? deathDurationMs(ev.deathCount) + 400
            : ev.kind === 'llm-connected' ? 2000
            : 0
          if (pauseMs > 0) {
            effectPauseUntilRef.current = Math.max(
              effectPauseUntilRef.current,
              Date.now() + pauseMs,
            )
          }
          // First-drop hook for curated items: stubbed LLM bespoke-
          // description request. Looks up the item by name in the
          // current world and fires the cache hook only if the item
          // has `curated: true`. No-op today (see curatedItemFlavor.ts
          // TODO) — the schema + cache plumbing is wired so the LLM
          // layer is drop-in when it's ready.
          if (ev.kind === 'new-item') {
            const world = getWorldContent(phase.character.worldId)
            const def = world?.items.find((i) => i.name === ev.name)
            if (def?.curated) {
              requestCuratedItemFlavor(
                storage.entities,
                phase.character.worldId,
                def,
              )
            }
          }
        }
      }
      const freshFields = deriveFieldEvents(prev.character, phase.character)
      if (freshFields.length > 0) {
        setFieldEvents((fs) => [...fs, ...freshFields].slice(-EVENT_CAP))
      }
      const freshElements = deriveElementEvents(newLogEntries)
      if (freshElements.length > 0) {
        setElementEvents((es) => [...es, ...freshElements].slice(-EVENT_CAP))
      }
    }
    lastSnapRef.current = {
      characterId: phase.character.id,
      log: phase.log,
      stateKind: phase.state.kind,
      character: phase.character,
    }
  }, [phase, storage.entities])

  const handleCreated = async (
    character: Character,
    options?: { simulateTicks?: number },
  ) => {
    const world = getWorldContent(character.worldId)!
    let p: { character: Character; log: LogEntry[]; state: GameState } = {
      character,
      log: seedLog(character, world, { discovery: true }),
      state: INITIAL_STATE,
    }

    // Quick Start hands the character forward with `simulateTicks: 100` so
    // the player drops in lived-in — already wandered, maybe scuffled with
    // a rat, drives partway up the gauge — instead of a blank slate. The
    // simulation is fully deterministic from `character.rngState`, so a
    // saved Quick Start replays identically. We bail on `generating-area`
    // because that state waits on an LLM callback that's only wired in the
    // playing phase — running ticks against it would just spin the
    // countdown without ever resolving. Authored starting areas are wired,
    // so the early ticks won't trigger LLM gen unless the simulated
    // character walks all the way to an unwired exit.
    if (options?.simulateTicks && options.simulateTicks > 0) {
      for (let i = 0; i < options.simulateTicks; i++) {
        if (p.state.kind === 'generating-area') break
        p = runTick(p, world)
      }
      // Trim the log so the player isn't dropped into a wall of history
      // they didn't witness. Keep the recent ~30 entries for context.
      p = { ...p, log: p.log.slice(-30) }
    }

    const now = Date.now()
    await storage.saves.save({
      id: p.character.id,
      name: p.character.name,
      createdAt: now,
      updatedAt: now,
      data: p.character,
    })
    await reload()
    setPhase({ kind: 'playing', ...p, paused: false })
  }

  const handleCancelCreate = () => setPhase({ kind: 'roster' })
  const handleNew = () => setPhase({ kind: 'creating' })

  // Landing CTA: record the dismissal so future boots skip past, then
  // route to the same creating / roster split the boot effect would
  // have picked. Reading `entries` here is safe because the boot effect
  // populated `entries` before transitioning to landing.
  const handleEnterLanding = useCallback(() => {
    markLandingSeen()
    setPhase(entries.length === 0 ? { kind: 'creating' } : { kind: 'roster' })
  }, [entries.length])

  const handlePlay = async (character: Character) => {
    const migrated = migrateCharacter(character)
    const existing = await storage.saves.load(migrated.id)
    if (existing) {
      await storage.saves.save({ ...existing, data: migrated, updatedAt: Date.now() })
    }
    setPhase({ kind: 'playing', character: migrated, log: seedLog(migrated, getWorldContent(migrated.worldId)!), state: INITIAL_STATE, paused: false })
  }

  const handleDelete = async (id: string) => {
    await storage.saves.delete(id)
    const remaining = await reload()
    if (remaining.length === 0) setPhase({ kind: 'creating' })
  }

  const handleResetAll = async () => {
    const metas = await storage.saves.list()
    await Promise.all(metas.map((m) => storage.saves.delete(m.id)))
    await reload()
    setPhase({ kind: 'creating' })
  }

  const handleExit = async () => {
    await reload()
    setPhase({ kind: 'roster' })
  }

  const openSettings = () => {
    if (phase.kind === 'loading' || phase.kind === 'settings') return
    setPhase({ kind: 'settings', returnTo: phase })
  }

  // Area-transition dialog handlers — invoked when the player interacts
  // with the NoLLMDialog or FirstTimeDialog.

  /** Flag the target exit room as skipGeneration, dismiss the dialog,
   *  and transition back to exploring (empty reveal). */
  const handleAreaGateContinueWithout = useCallback(() => {
    setAreaGateDialog(null)
    areaGateDialogRef.current = null
    setPhase((p) => {
      if (p.kind !== 'playing' || p.state.kind !== 'generating-area') {
        return p
      }
      const world = getWorldContent(p.character.worldId)
      if (!world) {
        return { ...p, state: { kind: 'exploring' } }
      }
      // Parse the exit key to find the source area + room coords.
      const [srcAreaId, coords] = p.state.exitRoomKey.split('::')
      if (srcAreaId && coords) {
        const srcArea = world.areas?.find((a) => a.id === srcAreaId)
        if (srcArea) {
          const exitRoom = srcArea.rooms[coords]
          if (exitRoom) {
            exitRoom.skipGeneration = true
          }
        }
      }

      return { ...p, state: { kind: 'exploring' } }
    })
  }, [])

  /** Open Settings from the NoLLMDialog — dismiss the dialog first, then
   *  bounce back to exploring so the player can return after configuring. */
  const handleAreaGateOpenSettings = useCallback(() => {
    setAreaGateDialog(null)
    areaGateDialogRef.current = null
    // Bounce back to exploring and open Settings in one phase update so
    // the player doesn't return to a frozen generating-area state.
    setPhase((p) => {
      if (p.kind !== 'playing') {
        return p
      }
      const playing = p.state.kind === 'generating-area'
        ? { ...p, state: { kind: 'exploring' as const } }
        : p

      return { kind: 'settings', returnTo: playing }
    })
  }, [])

  /** First-time dialog "Continue" — dismiss dialog, mark session flag,
   *  and let the next tick cycle proceed with generation. */
  const handleAreaGateFirstTimeContinue = useCallback(() => {
    firstTransitionShownRef.current = true
    setAreaGateDialog(null)
    areaGateDialogRef.current = null
    // Don't change phase — stay in 'generating-area' so the next tick
    // picks up LLM generation.
  }, [])

  /** First-time dialog "Continue without generation" — same as the
   *  NoLLM version but also stamps the session flag. */
  const handleAreaGateFirstTimeWithout = useCallback(() => {
    firstTransitionShownRef.current = true
    handleAreaGateContinueWithout()
  }, [handleAreaGateContinueWithout])

  // ── Portal Hub handlers ──────────────────────────────────────────

  /** "Forge a new path" — dismiss portal dialog and drop into the
   *  standard permanentFrontier generation flow (gateway guardian fight
   *  → LLM gen → reveal). */
  const handlePortalForge = useCallback(() => {
    setAreaGateDialog(null)
    areaGateDialogRef.current = null
    setPhase((p) => {
      if (p.kind !== 'playing') {
        return p
      }
      if (p.state.kind !== 'using-room' || p.state.action.kind !== 'portal-hub-select') {
        return p
      }
      const rk = p.state.action.roomKey
      const exitKey = `${p.character.position.areaId}::${rk}`

      return {
        ...p,
        state: { kind: 'generating-area', exitRoomKey: exitKey, ticksLeft: AREA_GEN_TIMEOUT_TICKS },
      }
    })
  }, [])

  /** "Travel to [name]" — dismiss portal dialog and traverse to the
   *  selected area's start position. No fight, no LLM gen. */
  const handlePortalTravel = useCallback((dest: PortalDestination) => {
    setAreaGateDialog(null)
    areaGateDialogRef.current = null
    setPhase((p) => {
      if (p.kind !== 'playing') {
        return p
      }
      const world = getWorldContent(p.character.worldId)
      if (!world) {
        return p
      }
      const destArea = world.areas?.find((a) => a.id === dest.areaId)
      if (!destArea) {
        return p
      }

      return {
        ...p,
        state: {
          kind: 'using-room',
          action: {
            kind: 'traverse-portal',
            destination: {
              areaId: destArea.id,
              x: destArea.startX,
              y: destArea.startY,
              z: destArea.startZ,
            },
          },
        },
      }
    })
  }, [])

  /** "Step back" — dismiss portal dialog and return to exploring. */
  const handlePortalDismiss = useCallback(() => {
    setAreaGateDialog(null)
    areaGateDialogRef.current = null
    setPhase((p) => {
      if (p.kind !== 'playing') {
        return p
      }

      return { ...p, state: { kind: 'exploring' } }
    })
  }, [])


  /** Finding-path countdown timed out — flag the target room as
   *  skipGeneration, emit a meta log entry, cancel in-flight LLM
   *  request, and reveal as empty. */
  const handleFindingPathTimeout = useCallback(() => {
    setFindingPathStart(null)
    // Abort any in-flight area generation requests.
    for (const ctrl of areaGenAbortRef.current.values()) {
      ctrl.abort()
    }
    setPhase((p) => {
      if (p.kind !== 'playing' || p.state.kind !== 'generating-area') {
        return p
      }
      const world = getWorldContent(p.character.worldId)
      if (!world) {
        return { ...p, state: { kind: 'exploring' } }
      }
      const [srcAreaId, coords] = p.state.exitRoomKey.split('::')
      if (srcAreaId && coords) {
        const srcArea = world.areas?.find((a) => a.id === srcAreaId)
        if (srcArea) {
          const exitRoom = srcArea.rooms[coords]
          if (exitRoom) {
            exitRoom.skipGeneration = true
          }
        }
      }

      return {
        ...p,
        log: [...p.log, {
          kind: 'meta' as const,
          text: 'The path ahead did not take shape. Perhaps another time.',
        }].slice(-200),
        state: { kind: 'exploring' },
      }
    })
  }, [])

  // Topbar speed picker writes to the playing character. Flips
  // tickSpeedAuto off so the next runTick won't bump the value back up
  // through the ramp schedule. Persistence rides on the same save effect
  // that handles other character mutations.
  const handlePickTickSpeed = useCallback((id: TickSpeedId) => {
    setPhase((p) => {
      if (p.kind !== 'playing') return p
      return {
        ...p,
        character: { ...p.character, tickSpeed: id, tickSpeedAuto: false },
      }
    })
  }, [])

  // Topbar volume slider — global setting, mirrors the Sound section in
  // Settings. Configures the manager live (so the next SFX is at the new
  // volume) and persists alongside the rest of the sound settings so the
  // value sticks across reloads.
  const handleSetVolume = useCallback((volume: number) => {
    // Read current sound via ref — doing this in a setSound((prev) =>
    // ...) updater would run the side effects (configure, save, unlock)
    // twice under StrictMode double-invocation. Slider drag counts as a
    // user gesture, so this is a safe spot to unlock the AudioContext.
    // Dragging the volume also auto-unmutes: we want the slider to be a
    // one-gesture way to bring sound back after a mute, matching the
    // "I just didn't realize it was muted" case where the user doesn't
    // think to hunt for a separate mute button.
    const prev = soundRef.current ?? loadSoundSettings()
    const next: SoundSettings = {
      ...prev,
      volume: Math.max(0, Math.min(1, volume)),
      muted: false,
    }
    setSound(next)
    soundManager.configure(next)
    saveSoundSettings(next)
    soundManager.unlock()
    // Trailing-debounced preview so the player hears the new level.
    // 200ms feels instant at the end of a drag but still coalesces
    // mid-drag updates into a single chime.
    soundManager.previewVolume(200)
  }, [])

  // Mute toggle — flips sound.muted (distinct from the Settings-tab
  // `enabled` flag). Volume setting and slider visibility are preserved
  // so the user can silence audio without losing their volume choice.
  const handleToggleMute = useCallback(() => {
    const prev = soundRef.current ?? loadSoundSettings()
    const next: SoundSettings = { ...prev, muted: !prev.muted }
    setSound(next)
    soundManager.configure(next)
    saveSoundSettings(next)
    soundManager.unlock()
  }, [])

  // Pause toggle — only meaningful while playing. Routes a topbar click
  // through the same paused field the dev panel and tick interval already
  // honor.
  const handleTogglePause = useCallback(() => {
    setPhase((p) => {
      if (p.kind !== 'playing') return p
      return { ...p, paused: !p.paused }
    })
  }, [])

  const closeSettings = () => {
    if (phase.kind !== 'settings') return
    setEffects(loadEffects())
    setTickSpeed(loadTickSpeed())
    // Settings owns the per-event toggles; pull the latest sound config
    // back so the topbar slider stays in sync with whatever was set in there.
    setSound(loadSoundSettings())
    setPhase(phase.returnTo)
  }

  // Settings → About exposes this as "Show landing again". Clears the
  // one-shot dismissal flag so a subsequent reload would show the
  // landing on its own, and routes the current session straight there
  // so the user doesn't have to refresh to see it.
  const handleShowLanding = useCallback(() => {
    clearLandingSeen()
    setPhase({ kind: 'landing' })
  }, [])

  if (phase.kind === 'loading') return <div className="boot" />

  return (
    <div className="shell scanlines">
      <Topbar
        onExit={phase.kind === 'playing' ? handleExit : undefined}
        onSettings={phase.kind !== 'settings' ? openSettings : undefined}
        onBack={phase.kind === 'settings' ? closeSettings : undefined}
        ticks={phase.kind === 'playing' ? phase.character.ticks ?? 0 : undefined}
        paused={phase.kind === 'playing' ? phase.paused : undefined}
        onTogglePause={phase.kind === 'playing' ? handleTogglePause : undefined}
        tickSpeed={phase.kind === 'playing' ? activeTickSpeed : undefined}
        onPickTickSpeed={phase.kind === 'playing' ? handlePickTickSpeed : undefined}
        volume={phase.kind === 'playing' && sound.enabled ? sound.volume : undefined}
        onSetVolume={phase.kind === 'playing' && sound.enabled ? handleSetVolume : undefined}
        muted={phase.kind === 'playing' && sound.enabled ? sound.muted : undefined}
        onToggleMute={phase.kind === 'playing' && sound.enabled ? handleToggleMute : undefined}
        saving={phase.kind === 'playing' ? savingFlash : undefined}
      />
      <div className="shell__body">
        {phase.kind === 'settings' && (
          <Settings
            onResetCharacters={handleResetAll}
            onLlmConnected={() =>
              setEvents((es) => [...es, { id: uuid(), kind: 'llm-connected' } as const].slice(-EVENT_CAP))
            }
            characterCount={entries.length}
            storage={storage}
            onShowLanding={handleShowLanding}
          />
        )}
        {phase.kind === 'landing' && (
          <Landing onEnter={handleEnterLanding} />
        )}
        {phase.kind === 'roster' && (
          <CharacterRoster
            entries={entries}
            onPlay={handlePlay}
            onNew={handleNew}
            onDelete={handleDelete}
            onResetAll={handleResetAll}
          />
        )}
        {phase.kind === 'creating' && (
          <CharacterCreation
            onComplete={handleCreated}
            onCancel={entries.length > 0 ? handleCancelCreate : undefined}
          />
        )}
        {phase.kind === 'playing' && (
          <div className="game">
            <div className="game__col game__col--left">
              <div className="game__sprite">
                <CharacterViewport
                  stateKind={phase.state.kind}
                  events={events}
                  elementEvents={elementEvents}
                  viewport={effects.viewport}
                />
                {phase.state.kind === 'fighting' ? (
                  <div className="game__target-overlay">
                    <CombatTargetPanel
                      mob={phase.state.mob}
                      world={getWorldContent(phase.character.worldId)}
                      elementEvents={elementEvents}
                    />
                  </div>
                ) : defeatedMob ? (
                  <div className="game__target-overlay">
                    <CombatTargetPanel
                      mob={defeatedMob}
                      defeated
                      world={getWorldContent(phase.character.worldId)}
                    />
                  </div>
                ) : null}
              </div>
              <div className="game__tabs">
                <CharacterTabs
                  character={phase.character}
                  world={getWorldContent(phase.character.worldId)}
                  fieldEvents={fieldEvents}
                  fields={effects.fields}
                  sheetNumbers={effects.sheetNumbers}
                />
              </div>
            </div>
            <div className="game__col game__col--right">
              <div className="game__map-row">
                <div className="game__roomdesc">
                  <RoomDescPanel
                    character={phase.character}
                  />
                </div>
                <div className="game__map">
                  <MapPanel
                    character={phase.character}
                    state={phase.state}
                  />
                </div>
              </div>
              <div className="game__log">
                <LogPanel
                  character={phase.character}
                  entries={phase.log}
                  state={phase.state}
                  paused={phase.paused}
                  showNumbers={effects.logNumbers}
                />
              </div>
            </div>
          </div>
        )}
      </div>
      <EffectsOverlay
        events={events}
        effects={effects}
        interruptCounter={fxInterruptCounter}
        onBlockingDismiss={() => { effectPauseUntilRef.current = 0 }}
        onBlockingHoverChange={(hovered) => { blockingHoverRef.current = hovered }}
      />
      <TooltipLayer />
      <NoLLMDialog
        open={areaGateDialog === 'no-llm'}
        onContinueWithout={handleAreaGateContinueWithout}
        onOpenSettings={handleAreaGateOpenSettings}
      />
      <FirstTimeDialog
        open={areaGateDialog === 'first-time'}
        onContinue={handleAreaGateFirstTimeContinue}
        onContinueWithout={handleAreaGateFirstTimeWithout}
      />
      {(() => {
        if (areaGateDialog !== 'portal-hub' || phase.kind !== 'playing') {
          return null
        }
        if (phase.state.kind !== 'using-room' || phase.state.action.kind !== 'portal-hub-select') {
          return null
        }
        const world = getWorldContent(phase.character.worldId)
        const area = world?.areas?.find((a) => a.id === phase.character.position.areaId)
        const hubRoom = area?.rooms[phase.state.action.roomKey]
        if (!hubRoom) {
          return null
        }

        return (
          <PortalSelectDialog
            open
            title={hubRoom.name}
            description={hubRoom.description}
            destinations={hubRoom.portalDestinations ?? []}
            onForge={handlePortalForge}
            onTravel={handlePortalTravel}
            onDismiss={handlePortalDismiss}
          />
        )
      })()}
      {findingPathStart !== null && (
        <FindingPathOverlay
          startedAt={findingPathStart}
          onTimeout={handleFindingPathTimeout}
        />
      )}
      {phase.kind === 'playing' && devOpen && (
        <DevPanel
          paused={phase.paused}
          character={phase.character}
          world={getWorldContent(phase.character.worldId)}
          conditions={getWorldContent(phase.character.worldId)?.conditions}
          onCommand={handleDevCommand}
          onClose={closeDev}
        />
      )}
    </div>
  )
}
