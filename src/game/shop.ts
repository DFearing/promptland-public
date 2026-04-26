import { roomKey } from '../areas'
import type { Character } from '../character'
import { formatActorName } from '../character'
import type { LogEntry } from '../log'
import type { Rng } from '../rng'
import { getWorldManifest, type WorldContent, type WorldManifest } from '../worlds'
import { satisfy } from './drives'
import {
  deityWord as favorDeityWord,
  favorName,
  favorTierName,
  gainFavor,
} from './favor'
import { append } from './logCap'
import { stampWeight } from './navigation'
import { pickItemsToSacrifice } from './sacrifice'
import { pickItemsToSell } from './sell'
import type { Playing } from './tick'
import { getArea } from './worldLookup'

/** Cap on how many of a given consumable the auto-buy will stockpile.
 *  Past this the character is just hoarding; the slot is better spent on
 *  inventory weight. */
const SHOP_CARRY_LIMIT = 3

/** After selling, try to auto-purchase consumables from the shop's
 *  inventory. Only buys healing potions when HP < 50% and mana potions
 *  when magic < 50%. Caps at 3 of any given consumable already in
 *  inventory. Returns null when nothing was bought so the caller can
 *  skip a redundant log allocation. */
export function tryShopPurchase(
  character: Character,
  world: WorldContent,
  manifest: WorldManifest | undefined,
  rng: Rng,
): { character: Character; log: LogEntry[] } | null {
  const stock = world.shopInventory
  if (!stock || stock.length === 0) return null

  const defs = new Map(world.items.map((d) => [d.id, d]))
  const currency = (manifest?.currencyName ?? 'gold').toLowerCase()
  let c = character
  const entries: LogEntry[] = []

  for (const slot of stock) {
    const def = defs.get(slot.itemId)
    if (!def || def.kind !== 'consumable') continue

    // Check if character needs this consumable.
    const effect = def.effect
    if (effect.kind === 'heal' && c.hp >= c.maxHp * 0.5) continue
    if (effect.kind === 'restore-magic') {
      if (c.maxMagic === 0) continue
      if (c.magic >= c.maxMagic * 0.5) continue
    }

    // Count how many of this item the character already carries.
    const owned = c.inventory.reduce((n, inv) => {
      if (inv.archetypeId === slot.itemId) return n + (inv.quantity ?? 1)
      return n
    }, 0)
    if (owned >= SHOP_CARRY_LIMIT) continue

    // Can the character afford it?
    if (c.gold < slot.price) continue

    // Purchase one.
    const newItem = {
      id: `shop-${slot.itemId}-${Date.now()}-${rng.next().toString(36).slice(2, 7)}`,
      archetypeId: slot.itemId,
      name: def.name,
      quantity: 1,
    }
    c = {
      ...c,
      gold: c.gold - slot.price,
      inventory: [...c.inventory, newItem],
    }
    entries.push({
      kind: 'loot',
      text: `${formatActorName(c, 'log')} buys a ${def.name} for ${slot.price} ${currency}.`,
      meta: {
        name: formatActorName(c, 'log'),
        itemId: slot.itemId,
        itemName: def.name,
        // Paint bought potions in their HP/MP color. Non-consumables
        // fall back to the default token styling.
        potionEffect: def.kind === 'consumable' ? def.effect.kind : undefined,
        goldAmount: -slot.price,
        goldText: `${slot.price} ${currency}`,
      },
    })
  }

  if (entries.length === 0) return null
  return { character: c, log: entries }
}

/** Handles the `using-room: { action: 'sell' }` case — picks items
 *  worth offloading, credits gold, fires auto-buy, and returns to
 *  exploring. Early-returns when the picker found nothing so the
 *  caller can fall through to the default state-keep return. */
export function handleSell(p: Playing, world: WorldContent, rng: Rng): Playing | null {
  const c = p.character
  const result = pickItemsToSell(c, world.items)
  if (result.sold.length === 0) return null

  const manifest = getWorldManifest(c.worldId)
  const currency = (manifest?.currencyName ?? 'gold').toLowerCase()
  const area = getArea(world, c.position.areaId)
  const rk = roomKey(c.position.x, c.position.y, c.position.z)
  const room = area.rooms[rk]
  const roomName = room?.name ?? 'the shop'
  const itemCount = result.sold.reduce(
    (n, s) => n + (s.item.quantity ?? 1),
    0,
  )
  let log = p.log
  log = append(log, {
    kind: 'loot',
    text: `${formatActorName(c, 'log')} sells ${itemCount} item${itemCount !== 1 ? 's' : ''} for ${result.totalGold} ${currency}.`,
    meta: {
      name: formatActorName(c, 'log'),
      goldAmount: result.totalGold,
      goldText: `${result.totalGold} ${currency}`,
    },
  })
  log = append(log, {
    kind: 'narrative',
    text: `${formatActorName(c, 'log')} offloads ${itemCount} item${itemCount !== 1 ? 's' : ''} at ${roomName} for ${result.totalGold} ${currency}.`,
    meta: {
      name: formatActorName(c, 'log'),
      areaId: area.id,
      roomKey: rk,
      roomName: room?.name,
    },
  })
  let afterSell: Character = {
    ...c,
    inventory: result.remainingInventory,
    gold: c.gold + result.totalGold,
  }
  // Auto-purchase consumables from shop inventory after selling.
  const purchased = tryShopPurchase(afterSell, world, manifest, rng)
  if (purchased) {
    afterSell = purchased.character
    for (const e of purchased.log) log = append(log, e)
  }
  const drives = stampWeight(satisfy(c.drives, ['weight']), afterSell, world)
  return {
    character: { ...afterSell, drives },
    log,
    state: { kind: 'exploring' },
  }
}

/** Handles the `using-room: { action: 'sacrifice' }` case — picks
 *  items worth offering up, credits gold + favor, layers the shrine
 *  tithe on top when the character is at a shrine, emits a tier-up
 *  log line if favor crossed a tier boundary, and returns to
 *  exploring. Early-returns when nothing was picked. */
export function handleSacrifice(p: Playing, world: WorldContent): Playing | null {
  const c = p.character
  const result = pickItemsToSacrifice(c, world.items)
  if (result.sacrificed.length === 0) return null

  const manifest = getWorldManifest(c.worldId)
  const currency = (manifest?.currencyName ?? 'gold').toLowerCase()
  const phrase = manifest?.sacrificePhrase ?? 'offers up'
  const area = getArea(world, c.position.areaId)
  const rk = roomKey(c.position.x, c.position.y, c.position.z)
  const room = area.rooms[rk]
  const roomName = room?.name ?? 'the shrine'
  const fName = favorName(manifest).toLowerCase()
  const itemCount = result.sacrificed.reduce(
    (n, s) => n + (s.item.quantity ?? 1),
    0,
  )
  // Shrine donation tithe — when sacrificing AT a shrine, pay 5 gold as
  // a tip for 5 extra favor on top of the per-item return. Skipped if
  // the character can't cover the tithe (we never push gold negative).
  const isShrine = room?.type === 'shrine'
  const titheAffordable = isShrine && c.gold + result.totalGold >= 5
  const titheGold = titheAffordable ? 5 : 0
  const titheFavor = titheAffordable ? 5 : 0
  const goldDelta = result.totalGold - titheGold
  const favorDelta = result.totalFavor + titheFavor
  const fav = gainFavor(c.favor, favorDelta)
  const goldText = `${result.totalGold} ${currency}`
  // Leading ✦ glyph distinguishes the favor token from gold at a glance
  // — the two tokens share a sacrifice line and previously read as two
  // shades of yellow with no structural separator.
  const favorText = `✦ +${favorDelta} ${fName}`
  let log = p.log
  log = append(log, {
    kind: 'loot',
    text: `${phrase} ${goldText} and ${favorText}.`,
    meta: {
      name: formatActorName(c, 'log'),
      goldAmount: result.totalGold,
      goldText,
      favorAmount: favorDelta,
      favorText,
    },
  })
  log = append(log, {
    kind: 'narrative',
    text: `${formatActorName(c, 'log')} sacrifices ${itemCount} item${itemCount !== 1 ? 's' : ''} at ${roomName}.`,
    meta: {
      name: formatActorName(c, 'log'),
      areaId: area.id,
      roomKey: rk,
      roomName: room?.name,
    },
  })
  if (titheGold > 0) {
    const dWord = favorDeityWord(manifest)
    log = append(log, {
      kind: 'narrative',
      text: `${formatActorName(c, 'log')} drops ${titheGold} ${currency} on the altar — a donation to the ${dWord}.`,
      meta: {
        name: formatActorName(c, 'log'),
        goldAmount: titheGold,
        goldText: `${titheGold} ${currency}`,
        favorAmount: titheFavor,
      },
    })
  }
  if (fav.tieredUp && fav.toTier > 0) {
    const tName = favorTierName(fav.toTier, manifest)
    const dWord = favorDeityWord(manifest)
    log = append(log, {
      kind: 'favor-tier-up',
      text: `${formatActorName(c, 'log')} is now ${tName} of the ${dWord}.`,
      meta: {
        name: formatActorName(c, 'log'),
        tierName: tName,
        tier: fav.toTier as 1 | 2 | 3 | 4,
      },
    })
  }
  const afterSacrifice: Character = {
    ...c,
    inventory: result.remainingInventory,
    gold: c.gold + goldDelta,
    favor: fav.next,
  }
  const drives = stampWeight(satisfy(c.drives, ['weight']), afterSacrifice, world)
  return {
    character: { ...afterSacrifice, drives },
    log,
    state: { kind: 'exploring' },
  }
}
