import { useState } from 'react'
import type { Character } from '../character'
import type { FieldFxEvent } from '../effects'
import type { Effects } from '../themes'
import type { WorldContent } from '../worlds'
import SheetPanel from './SheetPanel'
import InventoryPanel from './InventoryPanel'

type Tab = 'sheet' | 'inventory'

interface Props {
  character: Character
  world?: WorldContent
  fieldEvents: FieldFxEvent[]
  fields: Effects['fields']
}

export default function CharacterTabs({
  character,
  world,
  fieldEvents,
  fields,
}: Props) {
  const [tab, setTab] = useState<Tab>('sheet')

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
          />
        )}
        {tab === 'inventory' && <InventoryPanel character={character} world={world} />}
      </div>

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
