import {
  manhattan,
  neighborsOf,
  randomStep,
  roomKey,
  stepTowards,
  visitedKey,
  type Area,
  type Position,
} from '../areas'
import type { Character, DeathRecord, LevelUpRecord } from '../character'
import { xpToNextLevel } from '../character'
import { applyCondition, clearConditions, tickConditions } from '../conditions'
import type { LogEntry } from '../log'
import { spawn, type Mob } from '../mobs'
import { getWorldManifest, type WorldContent } from '../worlds'
import {
  DRIVE_THRESHOLD,
  grow,
  satisfy,
  topDrive,
  type Drive,
  type Drives,
} from './drives'
import { maybeAutoConsume } from './consume'
import { applyDeathPenalty } from './death'
import { applyAutoEquip, combatBonuses, equipLogEntry } from './equip'
import { applyDrops, rollLoot, type Drops } from './loot'
import type { GameState } from './state'

const LOG_CAP = 200
const REST_CHANCE = 0.12
const REST_DURATION = 6
const REST_HEAL = 2
const REST_FATIGUE_RELIEF = 15
const ENCOUNTER_CHANCE = 0.18

const EXPLORE_GROWTH: Partial<Drives> = {
  hunger: 3,
  fatigue: 3,
  greed: 2,
  curiosity: 4,
}

const REST_GROWTH: Partial<Drives> = {
  hunger: 2,
  greed: 1,
  curiosity: 1,
}

export interface Playing {
  character: Character
  log: LogEntry[]
  state: GameState
}

function append(log: LogEntry[], entry: LogEntry): LogEntry[] {
  return [...log, entry].slice(-LOG_CAP)
}

function rand(max: number): number {
  return Math.floor(Math.random() * max)
}
function roll(sides: number): number {
  return 1 + rand(sides)
}
function mod(stat: number): number {
  return Math.floor((stat - 10) / 2)
}

function rollEncounterFor(world: WorldContent, type: string): Mob | null {
  const ids = world.encounters[type as keyof WorldContent['encounters']]
  if (!ids || ids.length === 0) return null
  const id = ids[rand(ids.length)]
  const template = world.mobs.find((m) => m.id === id)
  return template ? spawn(template) : null
}

function appendDropLogs(
  log: LogEntry[],
  character: Character,
  world: WorldContent,
  drops: Drops,
): LogEntry[] {
  let out = log
  if (drops.gold > 0) {
    const manifest = getWorldManifest(character.worldId)
    const currency = (manifest?.currencyName ?? 'gold').toLowerCase()
    out = append(out, {
      kind: 'loot',
      text: `${character.name} pockets ${drops.gold} ${currency}.`,
      meta: { name: character.name },
    })
  }
  for (const drop of drops.items) {
    const def = world.items.find((i) => i.id === drop.itemId)
    if (!def) continue
    const qtySuffix = drop.qty > 1 ? ` ×${drop.qty}` : ''
    out = append(out, {
      kind: 'loot',
      text: `${character.name} gathers ${def.name}${qtySuffix}.`,
      meta: { name: character.name },
    })
  }
  return out
}

function directionName(dx: number, dy: number): string {
  const vx = Math.sign(dx)
  const vy = Math.sign(dy)
  if (vx === 0 && vy < 0) return 'north'
  if (vx > 0 && vy < 0) return 'northeast'
  if (vx > 0 && vy === 0) return 'east'
  if (vx > 0 && vy > 0) return 'southeast'
  if (vx === 0 && vy > 0) return 'south'
  if (vx < 0 && vy > 0) return 'southwest'
  if (vx < 0 && vy === 0) return 'west'
  if (vx < 0 && vy < 0) return 'northwest'
  return 'somewhere'
}

function bfsNearestUnvisited(area: Area, start: Position, visitedRooms: string[]): Position | null {
  const seen = new Set<string>([`${start.x},${start.y},${start.z}`])
  const queue: Position[] = [start]
  while (queue.length > 0) {
    const cur = queue.shift()!
    const vk = visitedKey(cur.areaId, cur.x, cur.y, cur.z)
    if (!visitedRooms.includes(vk)) return cur
    for (const n of neighborsOf(area, cur)) {
      const k = `${n.x},${n.y},${n.z}`
      if (!seen.has(k)) {
        seen.add(k)
        queue.push(n)
      }
    }
  }
  return null
}

function nearestRoomSatisfying(area: Area, from: Position, drive: Drive): Position | null {
  let best: Position | null = null
  let bestDist = Infinity
  for (const key in area.rooms) {
    const r = area.rooms[key]
    if (!r.satisfies?.includes(drive)) continue
    const pos: Position = { areaId: area.id, x: r.x, y: r.y, z: r.z }
    const d = manhattan(from, pos)
    if (d < bestDist) {
      bestDist = d
      best = pos
    }
  }
  return best
}

function moveByGoal(area: Area, character: Character, goal: Drive | null): Position | null {
  const pos = character.position
  if (!goal) return randomStep(area, pos)

  if (goal === 'curiosity') {
    const options = neighborsOf(area, pos)
    const unvisited = options.filter(
      (o) => !character.visitedRooms.includes(visitedKey(o.areaId, o.x, o.y, o.z)),
    )
    if (unvisited.length > 0) return unvisited[rand(unvisited.length)]
    const target = bfsNearestUnvisited(area, pos, character.visitedRooms)
    if (target) return stepTowards(area, pos, target)
    return randomStep(area, pos)
  }

  if (goal === 'greed') {
    const options = neighborsOf(area, pos)
    const dangerous = options.filter((o) => {
      const r = area.rooms[roomKey(o.x, o.y, o.z)]
      return r && r.type !== 'safe'
    })
    if (dangerous.length > 0) return dangerous[rand(dangerous.length)]
    return randomStep(area, pos)
  }

  const target = nearestRoomSatisfying(area, pos, goal)
  if (!target) return randomStep(area, pos)
  if (target.x === pos.x && target.y === pos.y && target.z === pos.z) {
    return randomStep(area, pos)
  }
  return stepTowards(area, pos, target)
}

function explore(p: Playing, world: WorldContent): Playing {
  const cond = tickConditions(p.character, world)
  let log = p.log
  for (const e of cond.entries) log = append(log, e)
  if (cond.skipTurn) {
    log = append(log, {
      kind: 'narrative',
      text: `${cond.character.name} cannot move.`,
      meta: { name: cond.character.name },
    })
    return { character: cond.character, log, state: p.state }
  }

  const c = cond.character
  const consumed = maybeAutoConsume(c, world)
  if (consumed) {
    return {
      character: consumed.character,
      log: append(log, consumed.entry),
      state: p.state,
    }
  }

  const area = world.startingArea
  const wounded = c.hp < c.maxHp
  if (wounded && Math.random() < REST_CHANCE) {
    const currentRoom = area.rooms[roomKey(c.position.x, c.position.y, c.position.z)]
    const text = currentRoom
      ? `${c.name} pauses to catch their breath in the ${currentRoom.name}.`
      : `${c.name} pauses to rest.`
    return {
      character: c,
      log: append(log, {
        kind: 'narrative',
        text,
        meta: {
          name: c.name,
          areaId: area.id,
          roomKey: currentRoom ? roomKey(currentRoom.x, currentRoom.y, currentRoom.z) : undefined,
          roomName: currentRoom?.name,
        },
      }),
      state: { kind: 'resting', ticksLeft: REST_DURATION },
    }
  }

  const grownDrives = grow(c.drives, EXPLORE_GROWTH)
  const goal = topDrive(grownDrives)
  const next = moveByGoal(area, { ...c, drives: grownDrives }, goal)

  if (!next) {
    return {
      character: { ...c, drives: grownDrives },
      log,
      state: p.state,
    }
  }

  const vk = visitedKey(next.areaId, next.x, next.y, next.z)
  const wasVisited = c.visitedRooms.includes(vk)
  const visitedRooms = wasVisited ? c.visitedRooms : [...c.visitedRooms, vk]
  const room = area.rooms[roomKey(next.x, next.y, next.z)]
  const dir = directionName(next.x - c.position.x, next.y - c.position.y)

  const moveText = room
    ? wasVisited
      ? `${c.name} heads ${dir} back to the ${room.name}.`
      : `${c.name} heads ${dir} to the ${room.name}. ${room.description}`
    : null
  const moveMeta = room
    ? {
        name: c.name,
        direction: dir,
        areaId: next.areaId,
        roomKey: roomKey(room.x, room.y, room.z),
        roomName: room.name,
      }
    : undefined
  if (moveText) log = append(log, { kind: 'narrative', text: moveText, meta: moveMeta })

  let drives = grownDrives
  const satisfied: Drive[] = []
  if (!wasVisited) satisfied.push('curiosity')
  if (room?.satisfies) satisfied.push(...room.satisfies)
  if (satisfied.length > 0) {
    for (const d of satisfied) {
      if (grownDrives[d] >= DRIVE_THRESHOLD) {
        const tmpl = room?.satisfyText?.[d]
        if (tmpl) {
          log = append(log, {
            kind: 'narrative',
            text: tmpl.replace('{name}', c.name),
            meta: {
              name: c.name,
              areaId: next.areaId,
              roomKey: room ? roomKey(room.x, room.y, room.z) : undefined,
              roomName: room?.name,
            },
          })
        }
      }
    }
    drives = satisfy(drives, satisfied)
  }

  let lastSafePosition = c.lastSafePosition
  if (room?.type === 'safe') lastSafePosition = next

  const character: Character = {
    ...c,
    position: next,
    visitedRooms,
    drives,
    lastSafePosition,
  }

  if (room && room.type !== 'safe' && Math.random() < ENCOUNTER_CHANCE) {
    const mob = rollEncounterFor(world, room.type)
    if (mob) {
      log = append(log, {
        kind: 'narrative',
        text: `A ${mob.name} bars the way. ${mob.description}`,
        meta: { mobName: mob.name },
      })
      return { character, log, state: { kind: 'fighting', mob } }
    }
  }

  return { character, log, state: p.state }
}

function rest(p: Playing): Playing {
  if (p.state.kind !== 'resting') return p
  const healed = Math.min(p.character.maxHp, p.character.hp + REST_HEAL)
  const actualHeal = healed - p.character.hp
  const ticksLeft = p.state.ticksLeft - 1
  const done = healed >= p.character.maxHp || ticksLeft <= 0

  const grownDrives = grow(p.character.drives, REST_GROWTH)
  const newFatigue = Math.max(0, grownDrives.fatigue - REST_FATIGUE_RELIEF)
  const drives: Drives = { ...grownDrives, fatigue: newFatigue }

  let log = p.log
  if (actualHeal > 0) {
    log = append(log, {
      kind: 'heal',
      text: `${p.character.name} catches their breath.`,
      amount: actualHeal,
      meta: { name: p.character.name },
    })
  }
  if (done) {
    log = append(log, {
      kind: 'narrative',
      text: `${p.character.name} rises, ready to press on.`,
      meta: { name: p.character.name },
    })
    const cleared = clearConditions({ ...p.character, hp: healed, drives })
    if (cleared.entry) log = append(log, cleared.entry)
    return {
      character: cleared.character,
      log,
      state: { kind: 'exploring' },
    }
  }
  return {
    character: { ...p.character, hp: healed, drives },
    log,
    state: { kind: 'resting', ticksLeft },
  }
}

function applyXp(character: Character, gained: number, log: LogEntry[]): { character: Character; log: LogEntry[] } {
  let xp = character.xp + gained
  let level = character.level
  const levelUps: LevelUpRecord[] = [...character.levelUps]
  let updatedLog = log
  while (xp >= xpToNextLevel(level)) {
    const needed = xpToNextLevel(level)
    xp -= needed
    const from = level
    level += 1
    levelUps.push({ at: Date.now(), from, to: level })
    updatedLog = append(updatedLog, {
      kind: 'chapter',
      text: `${character.name} rises to level ${level}.`,
      meta: { name: character.name },
    })
  }
  return { character: { ...character, xp, level, levelUps }, log: updatedLog }
}

function fight(p: Playing, world: WorldContent): Playing {
  if (p.state.kind !== 'fighting') return p
  const condResult = tickConditions(p.character, world)
  let log = p.log
  for (const e of condResult.entries) log = append(log, e)

  const consumed = maybeAutoConsume(condResult.character, world)
  if (consumed) {
    return {
      character: consumed.character,
      log: append(log, consumed.entry),
      state: p.state,
    }
  }

  const area = world.startingArea
  const character = condResult.character
  const mob = p.state.mob
  const skipAttack = condResult.skipTurn

  const bonuses = combatBonuses(character, world)
  const attackBonus = bonuses.attack ?? 0
  const defenseBonus = bonuses.defense ?? 0

  let mobHpAfter = mob.hp
  if (!skipAttack) {
    const charDmg = Math.max(1, roll(4) + mod(character.stats.strength) + attackBonus - mob.defense)
    mobHpAfter = Math.max(0, mob.hp - charDmg)
    log = append(log, {
      kind: 'damage',
      text: `${character.name} strikes the ${mob.name}.`,
      amount: charDmg,
      meta: { name: character.name, mobName: mob.name },
    })
  } else {
    log = append(log, {
      kind: 'narrative',
      text: `${character.name} cannot strike.`,
      meta: { name: character.name, mobName: mob.name },
    })
  }

  if (mobHpAfter === 0) {
    log = append(log, {
      kind: 'loot',
      text: `The ${mob.name} falls. (+${mob.xpReward} XP)`,
      meta: { mobName: mob.name },
    })
    const drops = rollLoot(mob)
    log = appendDropLogs(log, character, world, drops)
    const greedEased = satisfy(character.drives, ['greed'])
    const looted = applyDrops({ ...character, drives: greedEased }, world, drops)
    const equipResult = applyAutoEquip(looted, world)
    for (const ev of equipResult.events) {
      log = append(log, equipLogEntry(equipResult.character, ev))
    }
    const xpResult = applyXp(equipResult.character, mob.xpReward, log)
    return {
      character: xpResult.character,
      log: xpResult.log,
      state: { kind: 'exploring' },
    }
  }

  const mobDmg = Math.max(1, mob.attack + roll(3) - 2 - mod(character.stats.dexterity) - defenseBonus)
  const charHpAfter = Math.max(0, character.hp - mobDmg)

  log = append(log, {
    kind: 'damage',
    text: `The ${mob.name} lashes at ${character.name}.`,
    amount: mobDmg,
    meta: { name: character.name, mobName: mob.name },
  })

  let postHitChar = character
  if (charHpAfter > 0 && mob.applyOnHit && Math.random() < mob.applyOnHit.chance) {
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
    const room = area.rooms[roomKey(character.position.x, character.position.y, character.position.z)]
    const record: DeathRecord = {
      at: Date.now(),
      cause: `Fell to the ${mob.name}`,
      areaId: area.id,
      roomName: room?.name,
    }
    const respawn: Position = character.lastSafePosition ?? {
      areaId: area.id,
      x: area.startX,
      y: area.startY,
      z: area.startZ,
    }
    const respawnRoom = area.rooms[roomKey(respawn.x, respawn.y, respawn.z)]
    const respawnText = respawnRoom
      ? `They wake again in the ${respawnRoom.name}.`
      : "They wake again where it's safe."
    log = append(log, {
      kind: 'chapter',
      text: `${character.name} falls to the ${mob.name}. ${respawnText}`,
      meta: {
        name: character.name,
        mobName: mob.name,
        areaId: area.id,
        roomKey: roomKey(respawn.x, respawn.y, respawn.z),
        roomName: respawnRoom?.name,
      },
    })
    const penalty = applyDeathPenalty(character)
    for (const entry of penalty.entries) log = append(log, entry)
    return {
      character: {
        ...penalty.character,
        hp: penalty.character.maxHp,
        position: respawn,
        deaths: [...penalty.character.deaths, record],
        conditions: [],
      },
      log,
      state: { kind: 'exploring' },
    }
  }

  return {
    character: { ...postHitChar, hp: charHpAfter },
    log,
    state: { kind: 'fighting', mob: { ...mob, hp: mobHpAfter } },
  }
}

export function runTick(p: Playing, world: WorldContent): Playing {
  switch (p.state.kind) {
    case 'exploring':
      return explore(p, world)
    case 'resting':
      return rest(p)
    case 'fighting':
      return fight(p, world)
  }
}

export function seedLog(character: Character, world: WorldContent): LogEntry[] {
  const area = world.startingArea
  const room = area.rooms[roomKey(character.position.x, character.position.y, character.position.z)]
  const entries: LogEntry[] = [
    { kind: 'chapter', text: `${character.name} stirs.`, meta: { name: character.name } },
    { kind: 'area', text: area.name },
  ]
  if (room) {
    entries.push({
      kind: 'narrative',
      text: `${character.name} stands in the ${room.name}. ${room.description}`,
      meta: {
        name: character.name,
        areaId: area.id,
        roomKey: roomKey(room.x, room.y, room.z),
        roomName: room.name,
      },
    })
  }
  return entries
}
