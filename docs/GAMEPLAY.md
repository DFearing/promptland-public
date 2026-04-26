# Promptland — Gameplay

What happens when you click "play." The character walks around, fights monsters, picks up loot, levels up, and dies. You watch.

---

## Tick loop

The game runs on a discrete tick. Each tick, one thing happens — a step, a swing, a sip of water, a room description. The cadence depends on state; fighting is fast, resting is slow.

| State | Base tick | What it does |
|---|---|---|
| `exploring` | 2400 ms | Pick a neighbor and move, satisfy a drive, roll an encounter, trigger an area generation at an exit. |
| `fighting` | 1400 ms | One round: attacker rolls to hit, damage resolves, conditions tick, self-heal may fire. |
| `resting` | 1800 ms | Restore HP. Ambush-check each tick. Six ticks then return to exploring. |
| `meditating` | 1800 ms | Restore MP. Same ambush + cooldown shape as resting. |
| `using-room` | 1800 ms | Apply the room's effect (drive satisfaction, shop sell, portal traverse). |
| `generating-area` | 2000 ms | Countdown while the LLM is working on a new area. |

Speeds are user-adjustable in the topbar (0.5×, 1×, 2×). New characters start at 0.5× and auto-ramp to 1× as the character grows, unless the player picks a speed manually — in which case the ramp stops fighting their choice. See `src/game/state.ts` and `src/themes/types.ts`.

The game pauses cleanly at any point. Speed buttons also resume from pause in one click.

> ⚠️ **Merged states.** The original design doc listed six states including `Shopping` and `Interacting`. These are currently merged into `using-room` with a `UsingAction` union (`satisfy` / `traverse-portal` / `sell`). Shape is deliberately open so standalone shop/interact states can slot in later without reshaping the state machine.

---

## Character sheet

Every character carries:

- **6 stats** — STR, DEX, CON, INT, WIS, CHA (`src/character/types.ts:7`).
- **HP / MP / XP** — both HP and MP pool sizes are derived from species + class bases plus CON/MIND stat mods; XP is per-level.
- **11 equipment slots** — weapon, offhand, armor (torso), head, arms, hands, legs, feet, cape, amulet, ring1, ring2. One-handed weapons can dual-wield into the offhand; two-handers occupy both hands.
- **Inventory** — flat array. Items carry archetype id, name, rarity, level, and acquisition metadata (source, mob, area, room). Stackable items (junk, scrolls, consumables) merge when archetype + rarity + level all match. Some equipment carries passive buffs: `hungerSlow` reduces hunger accrual; rest-boost items improve HP recovery per resting tick.
- **Drives** — 6-element vector (hunger, fatigue, greed, curiosity, weight, piety). The top drive above threshold picks the current goal.
- **Death record** — every death is logged with cause, area, room, killer, timestamp. Becomes LLM fodder for later flavor.
- **Title** — hand-authored ladder per class up to level 100 (`src/worlds/manifests.ts`). Beyond 100, titles are LLM-generated per character and cached.
- **Journal** — chronological milestone log (area-discovered, mob-first-defeat, boss-defeat, item-first-loot, level-up, death, death-save, favor-tier-up). Grouped by area in the Journal tab on the character sheet.
- **Favor & blessings** — favor (0–1000) accumulates from sacrifices at shrine rooms. Crosses tier thresholds (Unseen → Touched → Witnessed → Beloved → Anointed) that gate shrine effects. A shrine visit at tier ≥ 1 grants an `ActiveBlessing` that ticks down over the run. At Anointed, one death-save is allowed: the lethal blow is converted to a 50% HP wound, conditions clear, the character respawns at `lastSafePosition`, and favor resets to 0. Saves are tracked separately from deaths in `character.saved` (`SavedRecord[]`).

Level-up: every level grants a flat HP + MP bump (species + class base + CON/MIND mod). Stat bumps fire at class-defined intervals — some classes bump STR every 4 levels, others every 3. See `applyOneLevel` in `src/game/tick.ts`.

---

## Combat

Stat-driven, turn-based, MUD-style. Each tick during `fighting` is one round. There are no tactics — it's a watch-game.

- **To-hit:** d4 + STR mod + equipment attack bonus vs. mob defense. Miss → "glances off" line in the log; hit → severity is computed from the excess (grazing → critical).
- **Damage:** base weapon damage × rarity mult × level scale, scaled by level delta — a character 3 levels above the mob hits for +30%; 3 below hits for -30%. Mirrored for incoming damage.
- **Ambush:** at level delta ≥ 5, the higher-level side auto-ambushes (skips the other's opening turn). Below that, 15% chance of either side getting the drop.
- **Mob self-heal:** mobs with `healCharges > 0` heal when HP < 35%. One charge per use, capped by the template's `healAmount`.
- **Conditions:** `poisoned`, `bleeding`, `burning`, `slowed`, `stunned`, `blessed`, and per-world customs. Three kinds: `dot` (damage each tick, clamped so DOTs can't kill), `skip` (skip next action), `stat-mod` (temporary attack/defense/stat changes).
- **Elements:** conditions carry an optional element tag (`fire`, `ice`, `electric`, `earth`, `hack`). Drives themed visual effects and some status interactions.
- **Spells:** magic-capable classes cast damage, heal, buff/debuff, and teleport-to-safe spells from the world's spell library. Scroll items carry single-use versions of spells. Additional spells are acquired as the character levels up, following class-specific acquisition rules.
- **Auto-consume:** when HP drops below 50%, healing potions fire automatically. Mana potions fire below 50% MP. See `maybeAutoConsume` in `src/game/consume.ts`.
- **Stealth:** rogue and ranger classes open combat with a stealth first-strike — a free damage hit before the mob gets its first action. The log marks the opener with its own style.

Combat ends when HP hits zero for either side. On defeat, `resolveMobDefeat` awards XP, rolls loot, satisfies greed, auto-equips upgrades, and returns to exploring.

---

## Drives & goals

Drives accumulate over time while exploring and drop when satisfied. The top drive above `DRIVE_THRESHOLD` (35) becomes the current goal; goals bias movement via `nearestRoomSatisfying` + BFS.

| Drive | Grows from | Satisfied by |
|---|---|---|
| `hunger` | Exploring | Rooms that `satisfies: ['hunger']` — inns, water, safe rooms |
| `fatigue` | Exploring | Resting in a safe room for 6 ticks; inns satisfy hunger + fatigue simultaneously |
| `greed` | Exploring | Defeating mobs (gold/loot drops) |
| `curiosity` | Exploring | Entering a previously unvisited room |
| `weight` | Computed from inventory | Selling at a shop — not yet an auto-trigger, but drives the "heading to a shop" goal via the same BFS |
| `piety` | Computed from favor tier | A shrine visit that picks up a blessing; piety stays low while a blessing is active and rises again as it expires |

`weight` and `piety` are computed each tick rather than incremented — `weight` from inventory total vs. STR capacity (`src/game/weight.ts`), `piety` from the favor tier and current blessing state (`src/game/favor.ts`). Higher tiers feel a stronger shrine pull; Anointed effectively always wants the shrine when no blessing is running.

---

## Worlds

Three worlds ship with the game (`src/worlds/contents.ts`). Each world is a self-contained content pack: manifest (species/classes/currency/title ladder), mob pool, item pool, spell library, conditions, encounter tables, starting area chain, and context defaults for the LLM.

### Fantasy (`src/worlds/fantasy/`)
Classic sword-and-sorcery. Starting village (Millhaven) → Mill Stream → Thornwood Clearing → Barrowdown Cave (mini-boss on floor 2). Western branch: Barrow Approach → Barrow of the Fallen King. Currency: gold. Species: human, elf, dwarf, halfling, orc. Classes: warrior, rogue, mage, cleric.

### Cyberpunk (`src/worlds/cyberpunk/`)
Neon dystopia. Districts, data caches, malfunctioning drones, street vendors. Currency: credits. Species: human, replicant, clone, synth. Classes: netrunner, street samurai, fixer, medic.

### Sci-Fi (`src/worlds/scifi/`)
Star-Trek-adjacent. Station habs, disputed outposts, anomalies. Currency: credits (different meta-flavor from cyberpunk). Species: human, vulcan-analog, android, uplifted-colonist. Classes: engineer, science officer, marine, diplomat.

All three use identical mechanics — the only per-world difference is content, flavor, and the manifest's `allowedConcepts` / `forbiddenConcepts` that constrain LLM generation.

---

## Death

Not permadeath. The character dies, respawns, and the story continues.

- **Respawn location:** the last safe room the character rested in (typically an inn or shrine). Falls back to the area's start if no safe rest has been recorded.
- **Death record:** every death gets logged (`src/character/types.ts:70`). Cause, area, room, killer name, timestamp. Permanent part of the character's backstory and great fodder for LLM flavor text.
- **Penalties:** `applyDeathPenalty` in `src/game/death.ts`:
  - **25% XP loss** (floored at zero on the current level).
  - **10–25% gold loss** (random within range).
  - **Per-equipped-item: 100% loss roll** — every currently-equipped item is rolled independently; failures drop the item.

> ⚠️ **Hardcoded penalties.** The design doc (`docs/MEMORY.md`) promised "all penalty parameters are configurable — users can tune harshness, disable penalties, or enable stricter modes." **Not yet implemented.** The config-file format for local deployments is also still undesigned; both are tracked in the STATUS doc.

### Deferred (advanced)
Dead characters' corpses could become discoverable entities in the shared-world cache (another player could find "Fenra the Warrior's body" in a forest clearing). This is in the design doc but intentionally deferred until the Track A shared-cache backend ships.

---

## Economy & shops

- **Currency per world** — fantasy = gold, cyberpunk = credits, sci-fi = credits (different vibes, same mechanic).
- **Shop inventory** — hand-authored per world in `WorldContent.shopInventory`. Each entry has `itemId`, `price`, and `maxStock`.
- **Auto-buy (wired):** when the character is in a shop with `gold >= price`, `tryShopPurchase` in `src/game/tick.ts` buys healing potions when HP < 50% and mana potions when magic < 50%. Capped at 3 per consumable already in inventory.
- **Auto-sell (wired):** when `weight` drive crosses threshold at a shop, `pickItemsToSell` in `src/game/sell.ts` picks items to offload. Class-aware — always keeps consumables and scrolls, sells junk, filters equipment by whether it matches class bonuses.
- **Sacrifice (wired):** `pickItemsToSacrifice` in `src/game/sacrifice.ts` offloads overflow low-rarity items for 1 gold each at shrine rooms. Triggered automatically when the weight drive is high and no shop is reachable. Also callable manually from the Dev Panel.

> ⚠️ **No player-initiated shop UI.** Shopping is entirely automatic. A player can't browse a shop's inventory and pick something to buy. The shop's presence is only visible in the room's description.

> ⚠️ **Weight-driven forced-sell missing.** The weight drive exists and contributes to the goal-seeker, but there's no inventory-cap enforcement that forces the character to drop or sell items when over-encumbered.

---

## Needs / drives goal-seeking

The BFS-based goal-seeker in `src/game/tick.ts` picks the next cell based on:

1. **Curated destination:** if a curated encounter or a specific goal (quest-giver, landmark) is set, move toward it.
2. **Top drive:** above threshold, move toward a room that `satisfies` the drive (rest at an inn, shop for greed/weight, etc.).
3. **Curiosity fallback:** no other goal → move toward an unvisited adjacent cell.
4. **Wandering:** no unvisited neighbors → random step.

Rooms flag what they satisfy via `RoomArchetype.satisfies?: Drive[]`. Most authored rooms are annotated; LLM-generated rooms inherit satisfaction from their shape's room type (inn → `['hunger', 'fatigue']`, shrine → `['fatigue']`, etc.).

---

## Map & navigation

- **10-direction movement:** 8 horizontal (N, NE, E, SE, S, SW, W, NW) + U / D for stairs, ladders, elevators.
- **Grid-bounded areas.** Each area is its own bounded grid. Moving between areas is explicit — either through a `portal` room (two-way teleporter-style link) or an `exit` room (edge-of-area transition to a generated or pre-authored area).
- **Fog of war.** Unvisited rooms are not shown at all — not even as "unexplored" cells. The map renders only what the character has walked through.
- **Floor selector.** Vertical connections (up/down stairs) show an indicator; the map viewer defaults to the character's current floor and can switch via arrows or a dropdown.
- **Click-to-read.** Any visited room is clickable — opens a popover with its description. Read-only.
- **Non-adjacent links.** Portals and exits render as special icons (not adjacent-cell connectors), so long staircases and teleporters are clearly non-grid links.
- **Area rarity color.** Each area carries an optional `rarity` that colors its name in the map header — a rare area reads as a bigger deal than a common one.

---

## Effects / feedback

Fullscreen and ambient visual cues, keyed off the log stream (not on direct engine callbacks — the effects layer is a pure derivation from log events + character state).

- **Rim flashes:** damage taken (red), heal self (green).
- **Level-up banner:** fullscreen card with HP/MP/stat gains, best item during the segment, baddest enemy, new title.
- **Death banner:** fullscreen card with the killer and respawn location.
- **New area / rare area:** fullscreen card, rarity-colored variant for rare+.
- **LLM connected / generating area:** status banners when the LLM pipeline changes state.
- **New mob / new item:** fires on first encounter (rare+ only for mobs, to avoid log spam).
- **Effects queue.** Fullscreen cards serialize through a FIFO queue — at most one on screen. Rim flashes bypass the queue.

Full configuration is in `src/effects/` and user-toggleable in Settings.
