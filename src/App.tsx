import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CharacterViewport from './components/CharacterViewport'
import CharacterTabs from './components/CharacterTabs'
import MapPanel from './components/MapPanel'
import LogPanel from './components/LogPanel'
import CharacterCreation from './components/CharacterCreation'
import CharacterRoster, { type RosterEntry } from './components/CharacterRoster'
import type { DevCommand } from './components/DevPanel'
import Settings from './components/Settings'
import Topbar from './components/Topbar'
import { roomKey } from './areas'
import type { Character, DeathRecord, LevelUpRecord } from './character'
import { migrateCharacter } from './character'
import { applyCondition, clearConditions } from './conditions'
import type { LogEntry } from './log'
import { spawn } from './mobs'
import { INITIAL_STATE, TICK_MS, runTick, seedLog, type GameState } from './game'
import { IndexedDBStorage, type SaveRecord, type Storage } from './storage'
import {
  EffectsOverlay,
  deriveEvents,
  deriveFieldEvents,
  type EffectEvent,
  type FieldFxEvent,
} from './effects'
import { loadEffects, type Effects } from './themes'
import { getWorldContent } from './worlds'
import './App.css'

const EVENT_CAP = 50

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
  const [events, setEvents] = useState<EffectEvent[]>([])
  const [fieldEvents, setFieldEvents] = useState<FieldFxEvent[]>([])
  const lastSnapRef = useRef<{
    characterId: string
    logLength: number
    stateKind: GameState['kind']
    character: Character
  } | null>(null)
  const [selectedRoomKey, setSelectedRoomKey] = useState<string | null>(null)

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

  const stateKind = phase.kind === 'playing' ? phase.state.kind : null

  useEffect(() => {
    if (phase.kind !== 'playing') return
    const cadence = TICK_MS[phase.state.kind]
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
  }, [phase.kind, stateKind])

  const handleDevCommand = useCallback((cmd: DevCommand) => {
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
          const record: LevelUpRecord = {
            at: Date.now(),
            from: p.character.level,
            to: p.character.level + 1,
          }
          return {
            ...p,
            character: {
              ...p.character,
              level: p.character.level + 1,
              xp: 0,
              levelUps: [...p.character.levelUps, record],
            },
            log: appendLog({
              kind: 'chapter',
              text: `[dev] ${p.character.name} rises to level ${record.to}.`,
              meta: { name: p.character.name },
            }),
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

        case 'die': {
          const area = world.startingArea
          const respawn = p.character.lastSafePosition ?? {
            areaId: area.id,
            x: area.startX,
            y: area.startY,
            z: area.startZ,
          }
          const respawnRoom = area.rooms[roomKey(respawn.x, respawn.y, respawn.z)]
          const record: DeathRecord = {
            at: Date.now(),
            cause: 'Dev-killed',
            areaId: area.id,
            roomName: area.rooms[roomKey(p.character.position.x, p.character.position.y, p.character.position.z)]?.name,
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
              kind: 'chapter',
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
              drives: { hunger: 100, fatigue: 100, greed: 100, curiosity: 100 },
            },
          }

        case 'drain-drives':
          return {
            ...p,
            character: {
              ...p.character,
              drives: { hunger: 0, fatigue: 0, greed: 0, curiosity: 0 },
            },
          }

        case 'add-gold':
          return {
            ...p,
            character: { ...p.character, gold: p.character.gold + 10 },
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
      }
    })
  }, [])

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

  useEffect(() => {
    if (phase.kind !== 'playing') {
      lastSnapRef.current = null
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
      })
      if (fresh.length > 0) {
        setEvents((es) => [...es, ...fresh].slice(-EVENT_CAP))
      }
      const freshFields = deriveFieldEvents(prev.character, phase.character)
      if (freshFields.length > 0) {
        setFieldEvents((fs) => [...fs, ...freshFields].slice(-EVENT_CAP))
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
    setPhase({ kind: 'playing', character, log: seedLog(character, getWorldContent(character.worldId)!), state: INITIAL_STATE, paused: false })
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

  const closeSettings = () => {
    if (phase.kind !== 'settings') return
    setEffects(loadEffects())
    setPhase(phase.returnTo)
  }

  if (phase.kind === 'loading') return <div className="boot" />

  return (
    <div className="shell">
      <Topbar
        onExit={phase.kind === 'playing' ? handleExit : undefined}
        onSettings={phase.kind !== 'settings' ? openSettings : undefined}
        onBack={phase.kind === 'settings' ? closeSettings : undefined}
      />
      <div className="shell__body">
        {phase.kind === 'settings' && (
          <Settings
            onResetCharacters={handleResetAll}
            characterCount={entries.length}
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
            <div className="game__sprite">
              <CharacterViewport
                stateKind={phase.state.kind}
                events={events}
                filtersEnabled={effects.viewportFilters}
              />
            </div>
            <div className="game__tabs">
              <CharacterTabs
                character={phase.character}
                world={getWorldContent(phase.character.worldId)}
                paused={phase.paused}
                onDevCommand={handleDevCommand}
                fieldEvents={fieldEvents}
                fieldIndicatorsEnabled={effects.fieldIndicators}
              />
            </div>
            <div className="game__map">
              <MapPanel
                character={phase.character}
                selectedKey={selectedRoomKey}
                onSelect={setSelectedRoomKey}
              />
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
        )}
      </div>
      <EffectsOverlay events={events} effects={effects} />
    </div>
  )
}
