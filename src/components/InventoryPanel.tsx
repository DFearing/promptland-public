import { useState } from 'react'
import type { Character, InventoryItem } from '../character'
import type { EquipBonuses, EquipSlot } from '../items'
import type { WorldContent } from '../worlds'

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
}

// Archetyped items resolve live from world.items so future LLM-generated flavor
// updates the UI without mutating stored inventory. Un-archetyped items (starting
// inventory) use their frozen character-creation flavor.
function displayOf(item: InventoryItem, world?: WorldContent): DisplayItem {
  if (item.archetypeId && world) {
    const def = world.items.find((i) => i.id === item.archetypeId)
    if (def) {
      const base: DisplayItem = {
        id: item.id,
        name: def.name,
        description: def.description,
        quantity: item.quantity,
      }
      if (def.kind === 'equipment') {
        base.slot = def.slot
        base.bonuses = def.bonuses
      }
      return base
    }
  }
  return { id: item.id, name: item.name, description: item.description, quantity: item.quantity }
}

function bonusText(b: EquipBonuses): string {
  const parts: string[] = []
  if (b.attack) parts.push(`+${b.attack} ATK`)
  if (b.defense) parts.push(`+${b.defense} DEF`)
  return parts.join(' ')
}

function SlotRow({
  slotLabel,
  item,
  isSel,
  onSelect,
}: {
  slotLabel: string
  item: DisplayItem | null
  isSel: boolean
  onSelect?: () => void
}) {
  if (!item) {
    return (
      <li className="inv__eq-empty">
        <span className="inv__eq-label">{slotLabel}</span>
        <span className="inv__eq-none">—</span>
      </li>
    )
  }
  return (
    <li>
      <button
        type="button"
        className={'inv__row inv__row--eq' + (isSel ? ' inv__row--sel' : '')}
        onClick={onSelect}
      >
        <span className="inv__slot">{isSel ? '[x]' : '[ ]'}</span>
        <span className="inv__name">
          <span className="inv__eq-label">{slotLabel}</span> {item.name}
        </span>
        <span className="inv__qty">{item.bonuses ? bonusText(item.bonuses) : ''}</span>
      </button>
    </li>
  )
}

export default function InventoryPanel({ character, world }: Props) {
  const rawItems = character.inventory ?? []
  const items = rawItems.map((i) => displayOf(i, world))
  const equipped = character.equipped ?? {}
  const weapon = equipped.weapon ? displayOf(equipped.weapon, world) : null
  const armor = equipped.armor ? displayOf(equipped.armor, world) : null

  const firstId = weapon?.id ?? armor?.id ?? items[0]?.id ?? null
  const [selectedId, setSelectedId] = useState<string | null>(firstId)

  const all: DisplayItem[] = [
    ...(weapon ? [weapon] : []),
    ...(armor ? [armor] : []),
    ...items,
  ]
  const selected = all.find((i) => i.id === selectedId) ?? all[0] ?? null

  const hasAnything = all.length > 0

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

  return (
    <div className="inv">
      <ul className="inv__list">
        <li className="inv__group">Equipped</li>
        <SlotRow
          slotLabel="WPN"
          item={weapon}
          isSel={weapon ? selected?.id === weapon.id : false}
          onSelect={weapon ? () => setSelectedId(weapon.id) : undefined}
        />
        <SlotRow
          slotLabel="ARM"
          item={armor}
          isSel={armor ? selected?.id === armor.id : false}
          onSelect={armor ? () => setSelectedId(armor.id) : undefined}
        />
        {items.length > 0 && <li className="inv__group">Carried</li>}
        {items.map((item) => {
          const isSel = item.id === selected?.id
          return (
            <li key={item.id}>
              <button
                type="button"
                className={'inv__row' + (isSel ? ' inv__row--sel' : '')}
                onClick={() => setSelectedId(item.id)}
              >
                <span className="inv__slot">{isSel ? '[x]' : '[ ]'}</span>
                <span className="inv__name">{item.name}</span>
                <span className="inv__qty">{item.quantity && item.quantity > 1 ? `×${item.quantity}` : ''}</span>
              </button>
            </li>
          )
        })}
      </ul>

      {selected && (
        <div className="inv__detail">
          <div className="inv__detail-name">
            {selected.name}
            {selected.bonuses ? (
              <span className="inv__detail-bonus"> {bonusText(selected.bonuses)}</span>
            ) : null}
          </div>
          {selected.description ? (
            <p className="inv__detail-desc">{selected.description}</p>
          ) : (
            <p className="inv__detail-desc inv__detail-desc--empty">No further record.</p>
          )}
        </div>
      )}

      <style>{`
        .inv { display: flex; flex-direction: column; flex: 1; min-height: 0; }
        .inv__list { list-style: none; margin: 0; padding: 0; flex: 1; min-height: 0; overflow-y: auto; font-family: var(--font-mono); font-size: var(--text-sm); }
        .inv__group { font-family: var(--font-display); font-size: var(--text-xs); letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-3); padding: var(--sp-2) var(--sp-3) 2px; border-bottom: 1px solid var(--line-2); }
        .inv__group:first-child { padding-top: 0; }
        .inv__row { width: 100%; display: grid; grid-template-columns: 28px 1fr auto; align-items: center; gap: var(--sp-1); padding: 4px var(--sp-3); background: transparent; border: none; border-bottom: 1px solid var(--line-1); cursor: pointer; color: var(--fg-1); font: inherit; text-align: left; }
        .inv__row:hover { background: var(--bg-2); }
        .inv__row--sel { background: var(--bg-3); color: var(--accent-hot); box-shadow: inset 0 0 0 1px var(--line-3); text-shadow: var(--glow-sm); }
        .inv__row--eq { background: var(--bg-inset); }
        .inv__row--eq:hover { background: var(--bg-2); }
        .inv__row--eq.inv__row--sel { background: var(--bg-3); }
        .inv__slot { color: var(--accent); font-variant-numeric: tabular-nums; }
        .inv__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .inv__qty { color: var(--fg-3); font-variant-numeric: tabular-nums; text-align: right; font-size: var(--text-xs); }
        .inv__eq-label { color: var(--speech); font-size: var(--text-xs); letter-spacing: 0.1em; padding-right: var(--sp-1); }
        .inv__eq-empty { display: grid; grid-template-columns: 28px 1fr auto; align-items: center; gap: var(--sp-1); padding: 4px var(--sp-3); border-bottom: 1px solid var(--line-1); color: var(--fg-3); font-family: var(--font-mono); font-size: var(--text-sm); }
        .inv__eq-empty .inv__eq-label { grid-column: 1 / 3; }
        .inv__eq-none { color: var(--fg-3); font-style: italic; }

        .inv__detail { border-top: 1px solid var(--line-2); padding: var(--sp-2) var(--sp-3); background: var(--bg-inset); box-shadow: var(--shadow-inset); font-family: var(--font-body); font-size: var(--text-sm); color: var(--fg-1); line-height: var(--leading-body); }
        .inv__detail-name { font-family: var(--font-display); font-size: var(--text-md); letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent-hot); text-shadow: var(--glow-sm); margin-bottom: 3px; }
        .inv__detail-bonus { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--magic); letter-spacing: 0.04em; text-transform: none; text-shadow: none; }
        .inv__detail-desc { margin: 0; }
        .inv__detail-desc--empty { color: var(--fg-3); font-style: italic; }
      `}</style>
    </div>
  )
}
