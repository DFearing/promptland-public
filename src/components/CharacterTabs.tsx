import { useState } from 'react'
import type { Character } from '../character'
import type { FieldFxEvent } from '../effects'
import type { Effects } from '../themes'
import type { WorldContent } from '../worlds'
import SheetPanel from './SheetPanel'
import InventoryPanel from './InventoryPanel'
import JournalPanel from './JournalPanel'
import LevelingDialog from './LevelingDialog'
import LogPopoverContent, { type Subject } from './LogPopoverContent'
import { resolveSubjectRarity } from './logPopoverRarity'
import Popover from './Popover'
import SpellbookPanel from './SpellbookPanel'

type Tab = 'sheet' | 'spellbook' | 'journal' | 'inventory'

interface Props {
  character: Character
  world?: WorldContent
  fieldEvents: FieldFxEvent[]
  fields: Effects['fields']
  sheetNumbers: boolean
}

export default function CharacterTabs({
  character,
  world,
  fieldEvents,
  fields,
  sheetNumbers,
}: Props) {
  const [tab, setTab] = useState<Tab>('sheet')
  // Level-history dialog state owned here so the Journal tab can open
  // it pre-expanded to a specific level without plumbing state through
  // the journal panel.
  const [levelDialog, setLevelDialog] = useState<{ open: boolean; level?: number }>({ open: false })
  // Popover anchored off buttons inside the leveling-history dialog
  // (best item / baddest enemy) AND journal entries (inline room / mob /
  // item links). SheetPanel owns its own popover for its leveling
  // button; this one covers the tab-level paths.
  const [popover, setPopover] = useState<
    { subject: Subject; anchor: DOMRect } | null
  >(null)
  const openSubjectPopover = (
    subject: Subject,
    e: React.MouseEvent<HTMLButtonElement>,
  ) => {
    setPopover({ subject, anchor: e.currentTarget.getBoundingClientRect() })
  }

  return (
    <div className="chartabs">
      <div className="chartabs__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'sheet'}
          className={'chartabs__tab' + (tab === 'sheet' ? ' chartabs__tab--active' : '')}
          onClick={() => setTab('sheet')}
        >
          Sheet
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'spellbook'}
          className={'chartabs__tab' + (tab === 'spellbook' ? ' chartabs__tab--active' : '')}
          onClick={() => setTab('spellbook')}
        >
          Spellbook
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'journal'}
          className={'chartabs__tab' + (tab === 'journal' ? ' chartabs__tab--active' : '')}
          onClick={() => setTab('journal')}
        >
          Journal
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'inventory'}
          className={'chartabs__tab' + (tab === 'inventory' ? ' chartabs__tab--active' : '')}
          onClick={() => setTab('inventory')}
        >
          Inventory
        </button>
      </div>
      <div className="chartabs__body">
        {tab === 'sheet' && (
          <SheetPanel
            character={character}
            fieldEvents={fieldEvents}
            fields={fields}
            sheetNumbers={sheetNumbers}
          />
        )}
        {tab === 'spellbook' && <SpellbookPanel character={character} world={world} />}
        {tab === 'journal' && (
          <JournalPanel
            character={character}
            world={world}
            onLevelClick={(level) => setLevelDialog({ open: true, level })}
            onSubjectClick={openSubjectPopover}
          />
        )}
        {tab === 'inventory' && <InventoryPanel character={character} world={world} />}
      </div>
      <LevelingDialog
        open={levelDialog.open}
        character={character}
        onClose={() => setLevelDialog({ open: false })}
        initialLevel={levelDialog.level}
        onSubjectClick={openSubjectPopover}
      />
      {(() => {
        const ctx = {
          character,
          areas: world?.areas ?? (world ? [world.startingArea] : undefined),
          mobs: world?.mobs,
          items: world?.items,
        }
        const rarity = popover
          ? resolveSubjectRarity(popover.subject, ctx) ?? undefined
          : undefined
        return (
          <Popover
            open={popover != null}
            anchor={popover?.anchor ?? null}
            onClose={() => setPopover(null)}
            rarity={rarity}
          >
            {popover && <LogPopoverContent subject={popover.subject} ctx={ctx} />}
          </Popover>
        )
      })()}

      <style>{`
        .chartabs { display: flex; flex-direction: column; flex: 1; min-height: 0; }
        .chartabs__tabs { display: flex; background: var(--bg-0); flex-shrink: 0; border-bottom: 1px solid var(--line-2); }
        .chartabs__tab { position: relative; font-family: var(--font-display); font-size: var(--text-md); letter-spacing: 0.08em; text-transform: uppercase; padding: 5px var(--sp-3); color: var(--fg-3); background: transparent; border: 1px solid var(--line-2); border-bottom: 1px solid var(--line-2); margin-right: -1px; margin-bottom: -1px; cursor: pointer; display: inline-flex; align-items: center; gap: var(--sp-1); transition: color var(--dur-fast) var(--ease-crt); }
        .chartabs__tab:hover { color: var(--fg-1); }
        .chartabs__tab--active { color: var(--accent-hot); background: var(--bg-1); border-bottom-color: var(--bg-1); text-shadow: var(--glow-sm); z-index: 1; }
        .chartabs__body { flex: 1; min-height: 0; background: var(--bg-1); border: 1px solid var(--line-2); border-top: none; padding: var(--sp-3); display: flex; flex-direction: column; }
      `}</style>
    </div>
  )
}
