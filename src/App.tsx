import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CharacterViewport from './components/CharacterViewport'
import CharacterTabs from './components/CharacterTabs'
import CombatTargetPanel from './components/CombatTargetPanel'
import DevPanel from './components/DevPanel'
import MapPanel from './components/MapPanel'
import RoomDescPanel from './components/RoomDescPanel'
import LogPanel from './components/LogPanel'
import CharacterCreation from './components/CharacterCreation'
import CharacterRoster, { type RosterEntry } from './components/CharacterRoster'
import type { DevCommand } from './components/DevPanel'
import Settings from './components/Settings'
import Topbar from './components/Topbar'
import TooltipLayer from './components/TooltipLayer'
import { roomKey } from './areas'
import type { Character, DeathRecord, InventoryItem } from './character'
import {
  LAST_AUTHORED_TITLE_INDEX,
  currentTitleIndex,
  levelForTitleIndex,
  migrateCharacter,
  resolveTitle,
} from './character'
import {
  classTitleTemplate,
  createLLMClient,
  generate,
  isLLMConfigured,
  loadLLMConfig,
} from './llm'
import type { Mob } from './mobs'
import { getVerbs } from './combat'
import { applyCondition, clearConditions } from './conditions'
import { defeatLingerMs, rarityValueMult, type Rarity } from './items'
import type { LogEntry } from './log'
import { spawn } from './mobs'
import { uuid } from './util/uuid'
import {
  INITIAL_STATE,
  TICK_MS,
  applyOneLevel,
  maybeAutoConsume,
  runTick,
  seedLog,
  type GameState,
} from './game'
import { IndexedDBStorage, type SaveRecord, type Storage } from './storage'
import type { WorldContent } from './worlds'
import {
  EffectsOverlay,
  deriveElementEvents,
  deriveEvents,
  deriveFieldEvents,
  type EffectEvent,
  type ElementFxEvent,
  type FieldFxEvent,
} from './effects'
import { loadEffects, loadTickSpeed, tickSpeedMult, type Effects, type TickSpeedId } from './themes'
import { loadSoundSettings, saveSoundSettings, soundManager, type SoundSettings } from './sound'
import { getWorldContent, getWorldManifest } from './worlds'
import './App.css'

const EVENT_CAP = 50
const DEV_OPEN_KEY = 'understudy.devPanel.open'

// Baseline linger before rarity scaling. Actual duration per mob comes
// from `defeatLingerMs(mob.rarity)` — see the useEffect that schedules the
// release timer below. Legendary kills sit on screen several times longer.

// Produces one representative log entry for every supported `kind` + meta
// combination the LogPanel can render. Used by the dev tool's "Sample log"
// button to eyeball every style in one pass. Pulls from the current world so
// names / rarities / conditions render against the real content library.
function buildLogSamples(character: Character, world: WorldContent): LogEntry[] {
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
  const conditionDef = world.conditions[0]
  const conditionName = conditionDef?.name ?? 'Poisoned'
  const conditionId = conditionDef?.id ?? 'poisoned'
  const conditionPolarity = conditionDef?.polarity ?? 'debuff'

  const severities = ['grazing', 'light', 'solid', 'heavy', 'severe', 'critical'] as const
  const sampleAmounts: Record<(typeof severities)[number], number> = {
    grazing: 1,
    light: 2,
    solid: 5,
    heavy: 9,
    severe: 14,
    critical: 22,
  }
  // Pull a few real verbs per tier from the world's verb library so the
  // sample log shows the actual variety the player will see in combat,
  // not a single hand-picked specimen per tier. Capped at 4 to keep the
  // sample dump readable.
  const VERBS_PER_TIER = 4
  const sampleVerbsByTier: Record<(typeof severities)[number], string[]> = {
    grazing: [], light: [], solid: [], heavy: [], severe: [], critical: [],
  }
  for (const sev of severities) {
    const all = getVerbs(character.worldId, sev)
    const slice = all.slice(0, VERBS_PER_TIER).map((v) =>
      sev === 'critical' ? `${v}!` : v,
    )
    sampleVerbsByTier[sev] = slice
  }

  const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const

  const base: LogEntry[] = [
    // Chapters / area / narrative / system / dialogue —
    { kind: 'chapter', text: `${charName} stirs.`, meta: { name: charName } },
    { kind: 'area', text: world.startingArea.name },
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

  // Damage entries across every severity, both directions, with several
  // verbs per tier so the same line doesn't repeat back-to-back.
  for (const sev of severities) {
    for (const verb of sampleVerbsByTier[sev]) {
      base.push({
        kind: 'damage',
        text: `${charName} ${verb} the ${mobName}.`,
        amount: sampleAmounts[sev],
        severity: sev,
        meta: { name: charName, mobName, verb, severity: sev },
      })
    }
  }
  for (const sev of severities) {
    for (const verb of sampleVerbsByTier[sev]) {
      base.push({
        kind: 'damage',
        text: `The ${mobName} ${verb} ${charName}.`,
        amount: sampleAmounts[sev],
        severity: sev,
        meta: { name: charName, mobName, verb, severity: sev },
      })
    }
  }

  // Heal / loot (gold + items of each rarity) / consume / equip.
  base.push(
    {
      kind: 'heal',
      text: `${charName} catches their breath.`,
      amount: 5,
      meta: { name: charName },
    },
    {
      kind: 'loot',
      text: `${charName} pockets 12 gold.`,
      meta: { name: charName, goldAmount: 12, goldText: '12 gold' },
    },
  )
  for (const r of rarities) {
    base.push({
      kind: 'loot',
      text: `${charName} gathers ${itemName}.`,
      meta: { name: charName, itemId, itemName, itemRarity: r },
    })
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
  base.push(
    {
      kind: 'equip',
      text: `${charName} wields the ${itemName}.`,
      slot: 'weapon',
      // Sample meta now mirrors what real equip events carry — itemId +
      // itemRarity light up the bracketed [Item] link in the renderer.
      meta: { name: charName, itemId, itemName, itemRarity: 'common' },
    },
    {
      kind: 'equip',
      text: `${charName} dons the ${itemName}.`,
      slot: 'armor',
      meta: { name: charName, itemId, itemName, itemRarity: 'common' },
    },
  )

  // Death losses.
  base.push(
    {
      kind: 'death-loss',
      text: `${charName} loses 42 XP.`,
      meta: { name: charName, xpText: '42 XP' },
    },
    {
      kind: 'death-loss',
      text: `${charName} drops the ${itemName}.`,
      meta: { name: charName, itemId, itemName, itemRarity: 'common' },
    },
  )

  // Condition lifecycle.
  base.push(
    {
      kind: 'condition-gain',
      text: `${charName} is ${conditionName.toLowerCase()}.`,
      conditionId,
      polarity: conditionPolarity,
      meta: { name: charName, conditionName },
    },
    {
      kind: 'condition-tick',
      text: `${charName} suffers from ${conditionName}.`,
      amount: 2,
      conditionId,
      meta: { name: charName, conditionName },
    },
    {
      kind: 'condition-end',
      text: `${charName} shakes off ${conditionName}.`,
      conditionId,
      meta: { name: charName, conditionName },
    },
  )

  // Level-up chapter — fires the levelTo hook so effect derivation would
  // trigger the fullscreen level-up card if this were a live tick.
  base.push({
    kind: 'chapter',
    text: `🎉✨⭐ ${charName} rises to level 2! ⭐✨🎉`,
    meta: { name: charName, levelTo: 2 },
  })

  return base
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

type Phase =
  | { kind: 'loading' }
  | { kind: 'roster' }
  | { kind: 'creating' }
  | { kind: 'playing'; character: Character; log: LogEntry[]; state: GameState; paused: boolean }
  | { kind: 'settings'; returnTo: Exclude<Phase, { kind: 'settings' | 'loading' }> }

export default function App() {
  const storage = useMemo<Storage>(() => new IndexedDBStorage(), [])
  const [entries, setEntries] = useState<RosterEntry[]>([])
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [effects, setEffects] = useState<Effects>(() => loadEffects())
  const [tickSpeed, setTickSpeed] = useState<TickSpeedId>(() => loadTickSpeed())
  const [sound, setSound] = useState<SoundSettings>(() => loadSoundSettings())
  const [events, setEvents] = useState<EffectEvent[]>([])
  const [fieldEvents, setFieldEvents] = useState<FieldFxEvent[]>([])
  const [elementEvents, setElementEvents] = useState<ElementFxEvent[]>([])
  const [devOpen, setDevOpen] = useState<boolean>(() => loadDevOpen())
  const lastSnapRef = useRef<{
    characterId: string
    logLength: number
    stateKind: GameState['kind']
    character: Character
  } | null>(null)
  // When set, the next phase-derive pass swallows whatever happened without
  // firing fullscreen overlays, field floaters, element overlays, or SFX.
  // Used by the dev "Sample log" command so dumping ~50 entries at once
  // doesn't slam the player with confetti/screen-flashes/sound stings.
  const suppressFxOnceRef = useRef(false)
  const [selectedRoomKey, setSelectedRoomKey] = useState<string | null>(null)
  // Post-defeat snapshot of the last mob we fought, rendered over the sprite
  // for DEFEAT_LINGER_MS so the defeat animation has something to shake.
  const [defeatedMob, setDefeatedMob] = useState<Mob | null>(null)
  const lastMobRef = useRef<Mob | null>(null)
  const playingState = phase.kind === 'playing' ? phase.state : null
  useEffect(() => {
    if (playingState?.kind === 'fighting') {
      lastMobRef.current = playingState.mob
      setDefeatedMob((prev) => (prev ? null : prev))
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
    return () => window.clearTimeout(id)
  }, [playingState])

  const handleSelectRoomFromLog = useCallback((areaId: string, key: string) => {
    setSelectedRoomKey((current) => {
      // Only respond if the referenced room is in the current area (future-proof).
      void areaId
      return current === key ? null : key
    })
  }, [])

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
      const loaded = await reload()
      if (cancelled) return
      setPhase(loaded.length === 0 ? { kind: 'creating' } : { kind: 'roster' })
    })()
    return () => {
      cancelled = true
    }
  }, [reload])

  // Initialize the sound manager and install a one-shot user-gesture listener
  // so the browser will let the AudioContext start. `unlock()` is idempotent,
  // so we can safely remove the listeners after the first event fires.
  useEffect(() => {
    soundManager.configure(sound)
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
      setPhase((p) => {
        if (p.kind !== 'playing' || p.paused) return p
        const world = getWorldContent(p.character.worldId)
        if (!world) return p
        const next = runTick(
          { character: p.character, log: p.log, state: p.state },
          world,
        )
        return { kind: 'playing', ...next, paused: p.paused }
      })
    }, cadence)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.kind, stateKind, activeTickSpeed])

  const handleDevCommand = useCallback((cmd: DevCommand) => {
    // Effect-trigger commands don't touch phase; they push fake events into
    // the same queues that gameplay would, so the overlay pipeline renders
    // them identically to a real trigger.
    if (cmd.kind === 'fx-fullscreen') {
      const id = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      setPhase((p) => {
        if (p.kind !== 'playing') return p
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
            synthesized = { id, kind: 'death' }
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
        return p
      })
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
          const result = applyOneLevel(p.character, { logPrefix: '[dev] ' })
          return {
            ...p,
            character: { ...result.character, xp: 0 },
            log: [...p.log, ...result.logEntries].slice(-200),
          }
        }

        case 'spawn-fight': {
          if (world.mobs.length === 0) return p
          const template = world.mobs[Math.floor(Math.random() * world.mobs.length)]
          const mob = spawn(template)
          return {
            ...p,
            state: { kind: 'fighting', mob },
            log: appendLog({
              kind: 'narrative',
              text: `[dev] A ${mob.name} appears. ${mob.description}`,
              meta: { mobName: mob.name },
            }),
          }
        }

        case 'spawn-fight-at': {
          const template = world.mobs.find((m) => m.id === cmd.mobId)
          if (!template) return p
          const mob = spawn(template, cmd.rarity)
          return {
            ...p,
            state: { kind: 'fighting', mob },
            log: appendLog({
              kind: 'narrative',
              text: `[dev] A ${mob.name} appears. ${mob.description}`,
              meta: { mobName: mob.name },
            }),
          }
        }

        case 'give-item': {
          const def = world.items.find((i) => i.id === cmd.itemId)
          if (!def) return p
          const stackable = !!def.stackable
          const rarity: Rarity = cmd.rarity
          // Dev gifts use the character's level so they're useful immediately
          // without needing a level slider on the panel — match-the-character
          // is the most common dev intent.
          const itemLevel =
            def.kind === 'equipment' || def.kind === 'scroll'
              ? Math.max(1, p.character.level)
              : 1
          const inventory = (() => {
            if (stackable) {
              const idx = p.character.inventory.findIndex(
                (i) =>
                  i.archetypeId === def.id &&
                  (i.rarity ?? 'common') === rarity &&
                  (i.level ?? 1) === itemLevel,
              )
              if (idx >= 0) {
                return p.character.inventory.map((v, i) =>
                  i === idx ? { ...v, quantity: (v.quantity ?? 1) + 1 } : v,
                )
              }
            }
            const item: InventoryItem = {
              id: uuid(),
              archetypeId: def.id,
              name: def.name,
              description: def.description,
              quantity: 1,
              rarity,
              level: itemLevel,
              acquired: { at: Date.now(), source: 'dev' },
            }
            return [...p.character.inventory, item]
          })()
          const scaledValue = Math.round((def.value ?? 0) * rarityValueMult(rarity))
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
          void scaledValue
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
                while (character.level < target) {
                  const result = applyOneLevel(character, {
                    logPrefix: '[dev] ',
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
              },
            }),
          }
        }

        case 'heal-full':
          return {
            ...p,
            character: { ...p.character, hp: p.character.maxHp },
          }

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

  useEffect(() => {
    if (!playingCharacter) return
    void storage.saves.save({
      id: playingCharacter.id,
      name: playingCharacter.name,
      createdAt: playingCharacter.createdAt,
      updatedAt: Date.now(),
      data: playingCharacter,
    })
  }, [playingCharacter, storage])

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
        logLength: phase.log.length,
        stateKind: phase.state.kind,
        character: phase.character,
      }
      return
    }
    const prev = lastSnapRef.current
    const sameRun = prev && prev.characterId === phase.character.id
    if (sameRun) {
      const fresh = deriveEvents({
        prevLogLength: prev.logLength,
        prevStateKind: prev.stateKind,
        nextLog: phase.log,
        nextStateKind: phase.state.kind,
        characterName: phase.character.name,
        character: phase.character,
      })
      if (fresh.length > 0) {
        setEvents((es) => [...es, ...fresh].slice(-EVENT_CAP))
        for (const ev of fresh) soundManager.play(ev)
      }
      const freshFields = deriveFieldEvents(prev.character, phase.character)
      if (freshFields.length > 0) {
        setFieldEvents((fs) => [...fs, ...freshFields].slice(-EVENT_CAP))
      }
      const freshElements = deriveElementEvents(prev.logLength, phase.log)
      if (freshElements.length > 0) {
        setElementEvents((es) => [...es, ...freshElements].slice(-EVENT_CAP))
      }
    }
    lastSnapRef.current = {
      characterId: phase.character.id,
      logLength: phase.log.length,
      stateKind: phase.state.kind,
      character: phase.character,
    }
  }, [phase])

  const handleCreated = async (character: Character) => {
    const now = Date.now()
    await storage.saves.save({
      id: character.id,
      name: character.name,
      createdAt: now,
      updatedAt: now,
      data: character,
    })
    await reload()
    setPhase({ kind: 'playing', character, log: seedLog(character, getWorldContent(character.worldId)!, { discovery: true }), state: INITIAL_STATE, paused: false })
  }

  const handleCancelCreate = () => setPhase({ kind: 'roster' })
  const handleNew = () => setPhase({ kind: 'creating' })

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
    setSound((prev) => {
      const next: SoundSettings = {
        ...prev,
        volume: Math.max(0, Math.min(1, volume)),
      }
      soundManager.configure(next)
      saveSoundSettings(next)
      // Slider drag counts as a user gesture — perfect spot to make sure
      // the AudioContext is unlocked before the next event fires.
      soundManager.unlock()
      return next
    })
  }, [])

  // Mute toggle — flips sound.enabled. Same persistence path as the volume
  // slider so the choice survives reloads and stays in sync with Settings.
  const handleToggleMute = useCallback(() => {
    setSound((prev) => {
      const next: SoundSettings = { ...prev, enabled: !prev.enabled }
      soundManager.configure(next)
      saveSoundSettings(next)
      soundManager.unlock()
      return next
    })
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

  if (phase.kind === 'loading') return <div className="boot" />

  return (
    <div className="shell">
      <Topbar
        onExit={phase.kind === 'playing' ? handleExit : undefined}
        onSettings={phase.kind !== 'settings' ? openSettings : undefined}
        onBack={phase.kind === 'settings' ? closeSettings : undefined}
        ticks={phase.kind === 'playing' ? phase.character.ticks ?? 0 : undefined}
        paused={phase.kind === 'playing' ? phase.paused : undefined}
        onTogglePause={phase.kind === 'playing' ? handleTogglePause : undefined}
        tickSpeed={phase.kind === 'playing' ? activeTickSpeed : undefined}
        onPickTickSpeed={phase.kind === 'playing' ? handlePickTickSpeed : undefined}
        volume={phase.kind === 'playing' ? sound.volume : undefined}
        onSetVolume={phase.kind === 'playing' ? handleSetVolume : undefined}
        muted={phase.kind === 'playing' ? !sound.enabled : undefined}
        onToggleMute={phase.kind === 'playing' ? handleToggleMute : undefined}
      />
      <div className="shell__body">
        {phase.kind === 'settings' && (
          <Settings
            onResetCharacters={handleResetAll}
            onLlmConnected={() =>
              setEvents((es) => [...es, { id: uuid(), kind: 'llm-connected' }].slice(-EVENT_CAP))
            }
            characterCount={entries.length}
            storage={storage}
          />
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
                />
              </div>
            </div>
            <div className="game__col game__col--right">
              <div className="game__map-row">
                <div className="game__roomdesc">
                  <RoomDescPanel
                    character={phase.character}
                    selectedKey={selectedRoomKey}
                  />
                </div>
                <div className="game__map">
                  <MapPanel
                    character={phase.character}
                    selectedKey={selectedRoomKey}
                    onSelect={setSelectedRoomKey}
                  />
                </div>
              </div>
              <div className="game__log">
                <LogPanel
                  character={phase.character}
                  entries={phase.log}
                  state={phase.state}
                  paused={phase.paused}
                  onSelectRoom={handleSelectRoomFromLog}
                />
              </div>
            </div>
          </div>
        )}
      </div>
      <EffectsOverlay events={events} effects={effects} />
      <TooltipLayer />
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
