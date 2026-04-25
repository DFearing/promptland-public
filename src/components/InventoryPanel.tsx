import { useState } from 'react'
import type { Character, InventoryItem, ItemAcquisition } from '../character'
import {
  rarityColor,
  rarityLabel,
  rarityValueMult,
  scaledRequirements,
  type EquipBonuses,
  type EquipRequirements,
  type EquipSlot,
  type Rarity,
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
function displayOf(item: InventoryItem, world?: WorldContent): DisplayItem {
  const rarity: Rarity = item.rarity ?? 'common'
  const level = item.level ?? 1
  if (item.archetypeId && world) {
    const def = world.items.find((i) => i.id === item.archetypeId)
    if (def) {
      const base: DisplayItem = {
        id: item.id,
        name: def.name,
        description: def.description,
        quantity: item.quantity,
        rarity,
        level,
        weight: def.weight,
        acquired: item.acquired,
        unitValue: def.value != null ? def.value * rarityValueMult(rarity) : undefined,
      }
      if (def.kind === 'equipment') {
        base.slot = def.slot
        // equipBonusesFor centralizes the level + rarity formula so the
        // inventory UI shows exactly what combat will see when the item is
        // worn. Avoids drift between the two surfaces.
        base.bonuses = equipBonusesFor(item, world)
        if (def.slot === 'weapon') base.hands = def.hands === 2 ? 2 : 1
        base.requirements = scaledRequirements(def.requirements, rarity)
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
          <span className="inv__name" style={{ color: rarityColor(item.rarity) }}>
            {item.name}
            <span className="inv__lv"> · Lv {item.level}</span>
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

export default function InventoryPanel({ character, world }: Props) {
  const rawItems = character.inventory ?? []
  const items = rawItems
    .map((i) => displayOf(i, world))
    .sort((a, b) => stackValue(b) - stackValue(a))
  const equipped = character.equipped ?? {}
  const disp = (it?: InventoryItem) => (it ? displayOf(it, world) : null)
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
    items.length > 0

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
        {items.length > 0 && (
          <li className="inv__group" data-tip="Stashed items. Click any for full details.">Carried</li>
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
                style={{ color: rarityColor(item.rarity) }}
              >
                {item.name}
                {item.quantity && item.quantity > 1 ? ` (x${item.quantity})` : ''}
                <span className="inv__lv"> · Lv {item.level}</span>
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
        open={popover != null}
        anchor={popover?.anchor ?? null}
        onClose={() => setPopover(null)}
      >
        {popover && (
          <>
            <h3
              className="popover__title"
              style={{ color: rarityColor(popover.item.rarity) }}
            >
              {popover.item.name}
            </h3>
            <p className="popover__meta">
              Lv {popover.item.level}
              {' · '}
              {rarityLabel(popover.item.rarity)}
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
      `}</style>
    </div>
  )
}
