import { useEffect, useMemo, useState } from 'react'
import type { Character, InventoryItem, ItemAcquisition } from '../character'
import {
  potionEffectAmount,
  potionFraction,
  potionSizeLabel,
  rarityColor,
  rarityLabel,
  rarityValueMult,
  scaledRequirements,
  scrollLevelLabel,
  type EquipBonuses,
  type EquipRequirements,
  type EquipSlot,
  type ItemKind,
  type PotionSize,
  type Rarity,
  type ScrollLevel,
  type WeaponHands,
} from '../items'
import { equipBonusesFor } from '../game/equip'
import { formatRelative } from '../util/time'
import type { WorldContent } from '../worlds'
import Popover from './Popover'

interface Props {
  character: Character
  world?: WorldContent
}

interface DisplayItem {
  id: string
  name: string
  description?: string
  quantity?: number
  bonuses?: EquipBonuses
  slot?: EquipSlot
  hands?: WeaponHands
  rarity: Rarity
  level: number
  weight?: number
  acquired?: ItemAcquisition
  /** Rarity-scaled requirements, if any. */
  requirements?: EquipRequirements
  /** Per-unit sell value, rarity-scaled. Undefined for items with no archetype value. */
  unitValue?: number
  /** Kind of item — drives the filter dropdown. Unknown/un-archetyped items
   *  fall into 'junk' so the filter still has somewhere to put them. */
  kind: ItemKind
  /** Potion size — present on consumables, drives the displayed amount and
   *  the "Lesser / Greater / …" badge in the popover. */
  potionSize?: PotionSize
  /** Resolved heal/restore amount for a sized consumable. */
  potionAmount?: number
  /** Scroll power level (I-V) — present on scrolls. */
  scrollLevel?: ScrollLevel
}

const BONUS_KEYS = [
  'attack',
  'defense',
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
] as const

// Archetyped items resolve live from world.items so future LLM-generated flavor
// updates the UI without mutating stored inventory. Un-archetyped items (starting
// inventory) use their frozen character-creation flavor.
function displayOf(
  item: InventoryItem,
  world: WorldContent | undefined,
  character: Character,
): DisplayItem {
  const rarity: Rarity = item.rarity ?? 'common'
  const level = item.level ?? 1
  if (item.archetypeId && world) {
    const def = world.items.find((i) => i.id === item.archetypeId)
    if (def) {
      // Sale value scales with rarity ONLY for items that actually roll
      // rarity (equipment). Scrolls and consumables have no rarity axis,
      // so the archetype's printed `value` is the final sale price.
      const valueMult = def.kind === 'equipment' ? rarityValueMult(rarity) : 1
      const base: DisplayItem = {
        id: item.id,
        name: def.name,
        description: def.description,
        quantity: item.quantity,
        rarity,
        level,
        weight: def.weight,
        acquired: item.acquired,
        unitValue: def.value != null ? def.value * valueMult : undefined,
        kind: def.kind,
      }
      if (def.kind === 'equipment') {
        base.slot = def.slot
        // equipBonusesFor centralizes the level + rarity formula so the
        // inventory UI shows exactly what combat will see when the item is
        // worn. Avoids drift between the two surfaces.
        base.bonuses = equipBonusesFor(item, world)
        if (def.slot === 'weapon') base.hands = def.hands === 2 ? 2 : 1
        base.requirements = scaledRequirements(def.requirements, rarity)
      } else if (def.kind === 'consumable') {
        // Resolve the size against the CURRENT character's max so the
        // popover preview matches what consume.ts will actually deliver
        // when this character drinks it. A second character with a
        // different maxHp will see a different number for the same item.
        base.potionSize = def.size
        const max = def.effect.kind === 'heal' ? character.maxHp : character.maxMagic
        base.potionAmount = potionEffectAmount(def.size, max)
      } else if (def.kind === 'scroll') {
        base.scrollLevel = def.level
      }
      return base
    }
  }
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    quantity: item.quantity,
    rarity,
    level,
    acquired: item.acquired,
    kind: 'junk',
  }
}

function stackValue(d: DisplayItem): number {
  const unit = d.unitValue ?? 0
  const qty = d.quantity && d.quantity > 1 ? d.quantity : 1
  return unit * qty
}

const BONUS_LABELS: Record<(typeof BONUS_KEYS)[number], string> = {
  attack: 'ATK',
  defense: 'DEF',
  strength: 'STR',
  dexterity: 'DEX',
  constitution: 'CON',
  intelligence: 'INT',
  wisdom: 'WIS',
  charisma: 'CHA',
}

function bonusText(b: EquipBonuses): string {
  const parts: string[] = []
  for (const key of BONUS_KEYS) {
    const v = b[key]
    if (v) parts.push(`+${v} ${BONUS_LABELS[key]}`)
  }
  return parts.join(' ')
}

const SLOT_TIPS = {
  weapon:
    'Weapon — main-hand. Its attack bonus adds to every strike. Two-handed weapons occupy both hands and disable the off-hand slot.',
  offhand:
    'Off-hand — a second one-handed weapon. Attack bonuses stack with the main-hand weapon.',
  armor: 'Torso armor — worn defense. Its bonus reduces incoming damage every hit.',
  head: 'Head — helmets, hats, circlets. Bonuses stack with torso armor.',
  arms: 'Arms — bracers, vambraces, sleeves.',
  hands: 'Hands — gauntlets, gloves, wraps.',
  legs: 'Legs — greaves, leggings.',
  feet: 'Feet — boots, sabatons.',
  cape: 'Cape — cloaks, mantles. Often carries utility bonuses.',
  amulet: 'Amulet — neck-worn. Often stat-flavored.',
  ring1: 'Ring — first of two ring slots. Often stat- or resistance-flavored.',
  ring2: 'Ring — second of two ring slots.',
} as const

// Items with their own progression axis (consumables → size, scrolls →
// level) opt out of the rarity color so the name doesn't get painted with
// a tier the item never actually rolled. Equipment / junk keep the
// rarity tint as before. Returning `undefined` lets the React inline-style
// fall back to the neutral text color from the surrounding panel.
function nameColorFor(d: DisplayItem): string | undefined {
  if (d.kind === 'consumable' || d.kind === 'scroll') return undefined
  return rarityColor(d.rarity)
}

// Trailing meta after the item name in inventory rows. Equipment shows
// its level (rarity is in the color). Consumables show their size.
// Scrolls show their level as a Roman numeral. Keeping this in one helper
// so the carried-list and equipped-slot rows render the same way.
function nameSuffixFor(d: DisplayItem): string {
  if (d.kind === 'consumable' && d.potionSize) {
    return ` · ${potionSizeLabel(d.potionSize)}`
  }
  if (d.kind === 'scroll' && d.scrollLevel) {
    return ` · ${scrollLevelLabel(d.scrollLevel)}`
  }
  return ` · Lv ${d.level}`
}

function SlotRow({
  slotLabel,
  slotTip,
  item,
  onOpen,
}: {
  slotLabel: string
  slotTip: string
  item: DisplayItem | null
  onOpen?: (item: DisplayItem, anchor: DOMRect) => void
}) {
  if (!item) {
    return (
      <li className="inv__eq-empty" data-tip={slotTip}>
        <span className="inv__eq-label">{slotLabel}</span>
        <span className="inv__eq-none">—</span>
      </li>
    )
  }
  const stats = item.bonuses ? bonusText(item.bonuses) : ''
  return (
    <li>
      <button
        type="button"
        className="inv__row inv__row--eq"
        onClick={(e) => onOpen?.(item, e.currentTarget.getBoundingClientRect())}
      >
        <span className="inv__eq-label">{slotLabel}</span>
        <span className="inv__eq-body">
          <span className="inv__name" style={{ color: nameColorFor(item) }}>
            {item.name}
            <span className="inv__lv">{nameSuffixFor(item)}</span>
          </span>
          {stats && <span className="inv__eq-stats">{stats}</span>}
        </span>
      </button>
    </li>
  )
}

const REQ_LABELS: Record<keyof EquipRequirements, string> = {
  level: 'Lv',
  strength: 'STR',
  dexterity: 'DEX',
  intelligence: 'INT',
  wisdom: 'WIS',
}

function RequirementsLine({
  reqs,
  character,
}: {
  reqs: EquipRequirements
  character: Character
}) {
  const charStats = {
    level: character.level,
    strength: character.stats.strength,
    dexterity: character.stats.dexterity,
    intelligence: character.stats.intelligence,
    wisdom: character.stats.wisdom,
  }
  const parts: Array<{ label: string; value: number; met: boolean }> = []
  for (const key of ['level', 'strength', 'dexterity', 'intelligence', 'wisdom'] as const) {
    const v = reqs[key]
    if (v == null) continue
    parts.push({ label: REQ_LABELS[key], value: v, met: charStats[key] >= v })
  }
  if (parts.length === 0) return null
  return (
    <p className="popover__meta popover__meta--reqs">
      Requires:{' '}
      {parts.map((p, i) => (
        <span key={p.label}>
          {i > 0 && ' '}
          <span style={p.met ? undefined : { color: 'var(--bad)' }}>
            {p.label} {p.value}
          </span>
        </span>
      ))}
    </p>
  )
}

// Sort mode + filter mode for the carried-items list. Persisted to
// localStorage so the player's choice survives a reload. Filter targets
// the coarse item families the player usually wants to triage by;
// 'armor' buckets every non-weapon equipment slot together so the
// dropdown stays four options wide instead of eleven.
type SortMode = 'rarity' | 'type' | 'name' | 'value'
type FilterMode = 'all' | 'weapon' | 'armor' | 'consumable' | 'junk'

const SORT_STORAGE_KEY = 'promptland.inventory.sort'
const FILTER_STORAGE_KEY = 'promptland.inventory.filter'

const RARITY_RANK: Record<Rarity, number> = {
  legendary: 0,
  epic: 1,
  rare: 2,
  uncommon: 3,
  common: 4,
}

// Integer order so the "type" sort groups items predictably — equipment
// first (weapon, armor/etc), then consumables, scrolls, and junk at the
// bottom. Within the same kind we fall back to rarity, then name.
function typeRank(d: DisplayItem): number {
  if (d.kind === 'equipment') {
    return d.slot === 'weapon' ? 0 : 1
  }
  if (d.kind === 'consumable') return 2
  if (d.kind === 'scroll') return 3
  return 4
}

function matchesFilter(d: DisplayItem, filter: FilterMode): boolean {
  if (filter === 'all') return true
  if (filter === 'weapon') {
    return d.kind === 'equipment' && d.slot === 'weapon'
  }
  if (filter === 'armor') {
    // Every equipment slot other than the weapon itself — helmets, rings,
    // amulets, etc. all roll up here so the filter stays simple.
    return d.kind === 'equipment' && d.slot !== 'weapon'
  }
  if (filter === 'consumable') {
    return d.kind === 'consumable' || d.kind === 'scroll'
  }
  if (filter === 'junk') return d.kind === 'junk'
  return true
}

function comparator(mode: SortMode): (a: DisplayItem, b: DisplayItem) => number {
  switch (mode) {
    case 'rarity':
      return (a, b) =>
        RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity] ||
        b.level - a.level ||
        a.name.localeCompare(b.name)
    case 'type':
      return (a, b) =>
        typeRank(a) - typeRank(b) ||
        RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity] ||
        a.name.localeCompare(b.name)
    case 'name':
      return (a, b) => a.name.localeCompare(b.name)
    case 'value':
    default:
      return (a, b) => stackValue(b) - stackValue(a) || a.name.localeCompare(b.name)
  }
}

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (raw && (allowed as readonly string[]).includes(raw)) return raw as T
  } catch {
    // localStorage access can throw in private-browsing / sandboxed modes —
    // treat it as "no stored preference" rather than crashing the panel.
  }
  return fallback
}

const SORT_MODES: readonly SortMode[] = ['rarity', 'type', 'name', 'value']
const FILTER_MODES: readonly FilterMode[] = [
  'all',
  'weapon',
  'armor',
  'consumable',
  'junk',
]

const SORT_LABELS: Record<SortMode, string> = {
  rarity: 'Rarity',
  type: 'Type',
  name: 'Name',
  value: 'Value',
}

const FILTER_LABELS: Record<FilterMode, string> = {
  all: 'All',
  weapon: 'Weapons',
  armor: 'Armor',
  consumable: 'Consumables',
  junk: 'Junk',
}

export default function InventoryPanel({ character, world }: Props) {
  const [sortMode, setSortMode] = useState<SortMode>(() =>
    readStored<SortMode>(SORT_STORAGE_KEY, SORT_MODES, 'value'),
  )
  const [filterMode, setFilterMode] = useState<FilterMode>(() =>
    readStored<FilterMode>(FILTER_STORAGE_KEY, FILTER_MODES, 'all'),
  )
  // Persist separately so switching one doesn't clobber the other.
  useEffect(() => {
    try {
      window.localStorage.setItem(SORT_STORAGE_KEY, sortMode)
    } catch {
      // ignore
    }
  }, [sortMode])
  useEffect(() => {
    try {
      window.localStorage.setItem(FILTER_STORAGE_KEY, filterMode)
    } catch {
      // ignore
    }
  }, [filterMode])

  // `character.inventory` is a stable reference from the game-state reducer
  // between ticks, so memoizing directly on it keeps the display/sort work
  // off the render hot path. Reading it inside useMemo (instead of into a
  // local `rawItems` const) avoids the react-hooks/exhaustive-deps warning
  // about logical-expression deps changing every render.
  const displayed = useMemo(
    () => (character.inventory ?? []).map((i) => displayOf(i, world, character)),
    [world, character],
  )
  const items = useMemo(() => {
    const filtered = displayed.filter((d) => matchesFilter(d, filterMode))
    filtered.sort(comparator(sortMode))
    return filtered
  }, [displayed, filterMode, sortMode])
  const hiddenByFilter = displayed.length - items.length
  const equipped = character.equipped ?? {}
  const disp = (it?: InventoryItem) => (it ? displayOf(it, world, character) : null)
  const weapon = disp(equipped.weapon)
  const offhand = disp(equipped.offhand)
  const armor = disp(equipped.armor)
  const head = disp(equipped.head)
  const arms = disp(equipped.arms)
  const hands = disp(equipped.hands)
  const legs = disp(equipped.legs)
  const feet = disp(equipped.feet)
  const cape = disp(equipped.cape)
  const amulet = disp(equipped.amulet)
  const ring1 = disp(equipped.ring1)
  const ring2 = disp(equipped.ring2)

  // Main hand is two-handed iff the equipped weapon is flagged as 2h. In that
  // case we don't render a separate Off Hand row — the single "Weapon" row
  // covers both hands.
  const isTwoHanded = weapon?.hands === 2

  const [popover, setPopover] = useState<{ item: DisplayItem; anchor: DOMRect } | null>(null)

  const openPopover = (item: DisplayItem, anchor: DOMRect) => {
    setPopover({ item, anchor })
  }

  const chest = character.lockedChest
  const chestItemCount = chest?.items.reduce((sum, it) => sum + (it.quantity ?? 1), 0) ?? 0

  const hasAnything =
    !!weapon ||
    !!offhand ||
    !!armor ||
    !!head ||
    !!arms ||
    !!hands ||
    !!legs ||
    !!feet ||
    !!cape ||
    !!amulet ||
    !!ring1 ||
    !!ring2 ||
    displayed.length > 0 ||
    !!chest

  if (!hasAnything) {
    return (
      <div className="inv inv--empty">
        <p>{character.name}&rsquo;s pockets are empty.</p>
        <style>{`
          .inv--empty { display: flex; align-items: center; justify-content: center; flex: 1; font-family: var(--font-body); color: var(--fg-3); font-style: italic; font-size: var(--text-sm); }
        `}</style>
      </div>
    )
  }

  const weaponLabel = isTwoHanded ? 'Weapon (two-handed)' : 'Weapon'

  return (
    <div className="inv">
      <ul className="inv__list">
        {chest && (
          <>
            <li
              className="inv__group inv__group--chest"
              data-tip="Loot won in combat sits in a strange chest until it unlatches. Items can't be used or equipped until then."
            >
              Locked Spoils
            </li>
            <li className="inv__chest">
              <span className="inv__chest-icon" aria-hidden="true">▣</span>
              <span className="inv__chest-body">
                <span className="inv__chest-summary">
                  {chestItemCount > 0
                    ? `${chestItemCount} item${chestItemCount !== 1 ? 's' : ''}`
                    : 'empty'}
                  {chest.gold > 0 ? ` · ${chest.gold} gold` : ''}
                </span>
                <span className="inv__chest-status">
                  {chest.ticksLeft > 1
                    ? `Unlatches in ${chest.ticksLeft} ticks`
                    : 'About to open…'}
                </span>
              </span>
            </li>
          </>
        )}
        <li className="inv__group" data-tip="Currently worn and wielded. Auto-equipped as better gear drops.">
          Equipped
        </li>
        <SlotRow
          slotLabel={weaponLabel}
          slotTip={SLOT_TIPS.weapon}
          item={weapon}
          onOpen={openPopover}
        />
        {!isTwoHanded && (
          <SlotRow
            slotLabel="Off Hand"
            slotTip={SLOT_TIPS.offhand}
            item={offhand}
            onOpen={openPopover}
          />
        )}
        <SlotRow slotLabel="Head" slotTip={SLOT_TIPS.head} item={head} onOpen={openPopover} />
        <SlotRow slotLabel="Amulet" slotTip={SLOT_TIPS.amulet} item={amulet} onOpen={openPopover} />
        <SlotRow slotLabel="Cape" slotTip={SLOT_TIPS.cape} item={cape} onOpen={openPopover} />
        <SlotRow slotLabel="Torso" slotTip={SLOT_TIPS.armor} item={armor} onOpen={openPopover} />
        <SlotRow slotLabel="Arms" slotTip={SLOT_TIPS.arms} item={arms} onOpen={openPopover} />
        <SlotRow slotLabel="Hands" slotTip={SLOT_TIPS.hands} item={hands} onOpen={openPopover} />
        <SlotRow slotLabel="Legs" slotTip={SLOT_TIPS.legs} item={legs} onOpen={openPopover} />
        <SlotRow slotLabel="Feet" slotTip={SLOT_TIPS.feet} item={feet} onOpen={openPopover} />
        <SlotRow slotLabel="Ring I" slotTip={SLOT_TIPS.ring1} item={ring1} onOpen={openPopover} />
        <SlotRow slotLabel="Ring II" slotTip={SLOT_TIPS.ring2} item={ring2} onOpen={openPopover} />
        {displayed.length > 0 && (
          <li className="inv__group inv__group--carried" data-tip="Stashed items. Click any for full details.">
            <span>Carried</span>
            <span className="inv__controls">
              <label className="inv__control">
                <span className="inv__control-label">Sort</span>
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  aria-label="Sort carried items"
                >
                  {SORT_MODES.map((m) => (
                    <option key={m} value={m}>
                      {SORT_LABELS[m]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="inv__control">
                <span className="inv__control-label">Filter</span>
                <select
                  value={filterMode}
                  onChange={(e) => setFilterMode(e.target.value as FilterMode)}
                  aria-label="Filter carried items"
                >
                  {FILTER_MODES.map((m) => (
                    <option key={m} value={m}>
                      {FILTER_LABELS[m]}
                    </option>
                  ))}
                </select>
              </label>
            </span>
          </li>
        )}
        {displayed.length > 0 && items.length === 0 && (
          <li className="inv__empty-filter">
            No carried items match this filter.
            {hiddenByFilter > 0 && ` (${hiddenByFilter} hidden)`}
          </li>
        )}
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="inv__row inv__row--carried"
              onClick={(e) =>
                openPopover(item, e.currentTarget.getBoundingClientRect())
              }
            >
              <span
                className="inv__name"
                style={{ color: nameColorFor(item) }}
              >
                {item.name}
                {item.quantity && item.quantity > 1 ? ` (x${item.quantity})` : ''}
                <span className="inv__lv">{nameSuffixFor(item)}</span>
              </span>
              <span className="inv__qty">
                {item.weight != null && (
                  <span className="inv__wt">
                    {item.weight * (item.quantity && item.quantity > 1 ? item.quantity : 1)} wt
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <Popover
        // Key on the displayed item so switching between items (click
        // legendary → click common) unmounts + remounts the Popover
        // rather than reusing its DOM node. Inline style reconciliation
        // was leaving the previous rarity's background / border tint in
        // place on some renders; a fresh instance per item guarantees a
        // clean DOM with no stale inline styles.
        key={popover ? `item:${popover.item.id}` : 'closed'}
        open={popover != null}
        anchor={popover?.anchor ?? null}
        onClose={() => setPopover(null)}
        // Don't tint the popover for items without a rarity axis
        // (consumables / scrolls) — their visual identity is size / level,
        // not tier.
        rarity={
          popover && (popover.item.kind === 'consumable' || popover.item.kind === 'scroll')
            ? undefined
            : popover?.item.rarity
        }
      >
        {popover && (
          <>
            <h3
              className="popover__title"
              style={{ color: nameColorFor(popover.item) }}
            >
              {popover.item.name}
            </h3>
            <p className="popover__meta">
              {popover.item.kind === 'consumable' && popover.item.potionSize ? (
                <>
                  {potionSizeLabel(popover.item.potionSize)} potion ·{' '}
                  {Math.round(potionFraction(popover.item.potionSize) * 100)}%
                  {popover.item.potionAmount != null
                    ? ` (≈${popover.item.potionAmount})`
                    : ''}
                </>
              ) : popover.item.kind === 'scroll' && popover.item.scrollLevel ? (
                <>Level {scrollLevelLabel(popover.item.scrollLevel)} scroll</>
              ) : (
                <>
                  Lv {popover.item.level}
                  {' · '}
                  {rarityLabel(popover.item.rarity)}
                </>
              )}
              {popover.item.hands === 2 ? ' · Two-handed' : ''}
              {popover.item.weight != null ? ` · ${popover.item.weight} wt` : ''}
            </p>
            {popover.item.bonuses && (
              <p className="popover__meta popover__meta--bonuses">
                {bonusText(popover.item.bonuses)}
              </p>
            )}
            {popover.item.requirements && (
              <RequirementsLine reqs={popover.item.requirements} character={character} />
            )}
            {popover.item.description ? (
              <p className="popover__body">{popover.item.description}</p>
            ) : (
              <p className="popover__body popover__body--muted">No further record.</p>
            )}
            {popover.item.acquired && (
              <p className="popover__meta popover__meta--acquired">
                {(() => {
                  const a = popover.item.acquired!
                  const when = formatRelative(a.at)
                  switch (a.source) {
                    case 'mob':
                      return a.mobName
                        ? a.roomName
                          ? `Won from ${a.mobName} in the ${a.roomName} · ${when}`
                          : `Won from ${a.mobName} · ${when}`
                        : `Won in battle · ${when}`
                    case 'starting':
                      return `Carried from the start · ${when}`
                    case 'shop':
                      return `Purchased · ${when}`
                    case 'dev':
                      return `Conjured · ${when}`
                    default:
                      return when
                  }
                })()}
              </p>
            )}
          </>
        )}
      </Popover>

      <style>{`
        .inv { display: flex; flex-direction: column; flex: 1; min-height: 0; }
        .inv__list { list-style: none; margin: 0; padding: 0; flex: 1; min-height: 0; overflow-y: auto; font-family: var(--font-mono); font-size: var(--text-sm); }
        .inv__group { font-family: var(--font-display); font-size: var(--text-xs); letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-3); padding: var(--sp-2) var(--sp-3) 2px; border-bottom: 1px solid var(--line-2); }
        .inv__group:first-child { padding-top: 0; }
        /* Carried header doubles as the sort/filter control strip. Flex row
           so the section label sits on the left and the dropdowns collapse
           to the right edge, matching the panel's padding. */
        .inv__group--carried {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--sp-2);
          padding-top: var(--sp-2);
        }
        .inv__controls {
          display: inline-flex;
          align-items: center;
          gap: var(--sp-2);
        }
        .inv__control {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--fg-3);
        }
        .inv__control-label { color: var(--fg-3); }
        .inv__control select {
          background: var(--bg-1);
          color: var(--fg-1);
          border: 1px solid var(--line-2);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          letter-spacing: 0.04em;
          padding: 2px 4px;
          cursor: pointer;
          text-transform: none;
        }
        .inv__control select:hover,
        .inv__control select:focus-visible {
          border-color: var(--line-3);
          outline: none;
        }
        .inv__empty-filter {
          padding: var(--sp-2) var(--sp-3);
          color: var(--fg-3);
          font-family: var(--font-body);
          font-size: var(--text-xs);
          font-style: italic;
        }
        .inv__row { width: 100%; align-items: center; gap: var(--sp-2); padding: 4px var(--sp-3); background: transparent; border: none; border-bottom: 1px solid var(--line-1); cursor: pointer; color: var(--fg-1); font: inherit; text-align: left; }
        .inv__row:hover, .inv__row:focus-visible { background: var(--bg-2); outline: none; }
        .inv__row:focus-visible { box-shadow: inset 0 0 0 1px var(--line-3); }
        /* Equipped rows are now two-line: slot label on the left, then a
           stacked body (item name on top, bonus stats below in smaller text)
           so long bonus strings don't get truncated by a narrow fixed-width
           column. align-items: center keeps the slot label aligned to the
           vertical midpoint of the stacked body. */
        .inv__row--eq {
          display: grid;
          grid-template-columns: 120px 1fr;
          align-items: center;
          background: var(--bg-inset);
        }
        .inv__row--eq:hover { background: var(--bg-2); }
        .inv__row--carried { display: grid; grid-template-columns: 1fr auto; }
        .inv__eq-body {
          display: flex;
          flex-direction: column;
          gap: 1px;
          min-width: 0;
        }
        .inv__eq-stats {
          color: var(--fg-3);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          font-variant-numeric: tabular-nums;
          letter-spacing: 0.02em;
          white-space: normal;
        }
        .inv__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .inv__lv {
          color: var(--fg-3);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          letter-spacing: 0.04em;
        }
        .inv__qty { color: var(--fg-3); font-variant-numeric: tabular-nums; text-align: right; font-size: var(--text-xs); }
        .inv__eq-label { color: var(--fg-3); font-family: var(--font-body); font-size: var(--text-xs); letter-spacing: 0.1em; text-transform: uppercase; white-space: nowrap; }
        .inv__eq-empty { display: grid; grid-template-columns: 120px 1fr; align-items: center; gap: var(--sp-2); padding: 4px var(--sp-3); border-bottom: 1px solid var(--line-1); color: var(--fg-3); font-family: var(--font-mono); font-size: var(--text-sm); }
        .inv__eq-none { color: var(--fg-3); font-style: italic; }
        /* Locked-chest section. Sits above Equipped so the player notices
           the pending reveal. Names of the items inside stay hidden by
           design — the unlock is the satisfying-curiosity beat (issue #75). */
        .inv__group--chest { color: var(--accent, var(--fg-2)); }
        .inv__chest {
          display: flex;
          align-items: center;
          gap: var(--sp-2);
          padding: var(--sp-2) var(--sp-3);
          background: var(--bg-inset);
          border-bottom: 1px solid var(--line-1);
          font-family: var(--font-mono);
          font-size: var(--text-sm);
        }
        .inv__chest-icon {
          font-size: var(--text-lg);
          color: var(--accent, var(--fg-2));
          /* Slow pulse so the chest reads as "active" / "waiting" without
             being distracting. */
          animation: inv-chest-pulse 1.6s ease-in-out infinite;
        }
        @keyframes inv-chest-pulse {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
        }
        .inv__chest-body {
          display: flex;
          flex-direction: column;
          gap: 1px;
          min-width: 0;
        }
        .inv__chest-summary { color: var(--fg-1); }
        .inv__chest-status {
          color: var(--fg-3);
          font-size: var(--text-xs);
          letter-spacing: 0.04em;
          font-variant-numeric: tabular-nums;
        }
      `}</style>
    </div>
  )
}
