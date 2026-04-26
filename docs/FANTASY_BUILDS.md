# Fantasy — Species × Class Reference

All 25 combinations of the five fantasy species and five fantasy classes, with starting attributes, per-level growth, and class-specific WIS perks.

Source: `src/worlds/manifests.ts` (FANTASY manifest), `src/character/stats.ts`, `src/game/tick.ts` (`levelGainsFor`, `rollAmbush`, sneak-strike multiplier).

---

## Composition rules

- **Six stats** (STR / DEX / CON / INT / WIS / CHA) come **entirely from class**. Species do not modify starting stats.
- **Starting Max HP** = `10 + CON × 2`.
- **Starting Max MP** = `round(class.magicAffinity × castingStatValue)`, where `castingStatValue` is the class's declared `castingStat` if any, else `max(INT, WIS)`. A Mage with affinity 2.5 and INT 14 starts at 35 MP; a WIS-locked Cleric with affinity 1.5 and WIS 14 starts at 21 MP.
- **Per-level HP gain** = `class.hpPerLevel + species.hpPerLevel + conMod`, where `conMod = max(0, floor((CON − 10) / 2))`.
- **Per-level MP gain** = `class.mpPerLevel + species.mpPerLevel + mindMod`, where `mindMod = max(0, floor((castingStatValue − 10) / 2))`.
- **Primary stat bumps** fire every 4 levels (class + species, additive).
- **Secondary stat bump** fires every 8 levels (class only, +1 to the class's `secondaryStat`).

HP/MP per-level numbers in the tables below are evaluated at level-1 stats. They climb upward as stat bumps raise CON / casting stat over time.

---

## Species growth

| Species   | HP/lvl | MP/lvl | +Stat (every 4 lvls) |
|-----------|:------:|:------:|----------------------|
| Human     |  +1    |   0    | +1 CHA               |
| Elf       |   0    |  +1    | +1 INT               |
| Dwarf     |  +2    |   0    | +1 CON               |
| Halfling  |   0    |   0    | +1 DEX               |
| Orc       |  +2    |   0    | +1 STR               |

## Class starting attributes

Every class follows the same shape: 14 / 14 / 12 / 10 / 10 / 6 — two primaries, one secondary, two filler, one dump.

| Class   | Primaries | Secondary | Casts off | STR | DEX | CON | INT | WIS | CHA | Max HP | Max MP | Affinity |
|---------|-----------|-----------|-----------|:---:|:---:|:---:|:---:|:---:|:---:|:------:|:------:|:--------:|
| Warrior | STR · CON | DEX       | max(I,W)  | 14  | 12  | 14  |  6  | 10  | 10  |   38   |   5    |   0.5    |
| Rogue   | DEX · CHA | WIS       | max(I,W)  | 10  | 14  | 10  |  6  | 12  | 14  |   30   |   8    |   0.7    |
| Mage    | INT · WIS | DEX       | max(I,W)  |  6  | 12  | 10  | 14  | 14  | 10  |   30   |  35    |   2.5    |
| Cleric  | WIS · STR | CON       | **WIS**   | 14  | 10  | 12  |  6  | 14  | 10  |   34   |  21    |   1.5    |
| Ranger  | DEX · CON | WIS       | max(I,W)  | 10  | 14  | 14  | 10  | 12  |  6  |   38   |  10    |   0.8    |

## Class growth

| Class   | HP/lvl (base) | MP/lvl (base) | +Stats every 4 lvls | +Stat every 8 lvls (secondary) |
|---------|:-------------:|:-------------:|---------------------|--------------------------------|
| Warrior |      +6       |      +1       | +1 STR, +1 CON      | +1 DEX                         |
| Rogue   |      +4       |      +2       | +1 DEX, +1 CHA      | +1 WIS                         |
| Mage    |      +2       |      +6       | +1 INT, +1 WIS      | +1 DEX                         |
| Cleric  |      +4       |      +4       | +1 WIS, +1 STR      | +1 CON                         |
| Ranger  |      +5       |      +2       | +1 DEX, +1 CON      | +1 WIS                         |

---

## Stealth-class WIS perks (Rogue + Ranger)

WIS gives Rogue and Ranger three layered benefits the moment WIS exceeds 10. Let `wisMod = max(0, floor((WIS − 10) / 2))` — the standard mod; both classes start at WIS 12 (mod 1) and grow it via primary/secondary bumps over time.

1. **Spot the trap.** When a fresh encounter would yield a mob-side ambush, roll `min(50%, wisMod × 10%)` to spot it. On a success the ambush is canceled and the fight starts even-footed.
2. **Reverse ambush.** If the spot fails, roll `min(25%, wisMod × 5%)` to flip the situation — the character becomes the ambusher (`reason: 'reversed'`) with a 2-tick opening, narrated as "*senses the goblin closing in and turns the ambush around!*"
3. **Sharper sneak attacks.** Stealth and reversed openers deal `min(2.0, 1.5 + wisMod × 0.1)×` damage on the first strike. WIS 10 → 1.5×, WIS 14 → 1.7×, WIS 18 → 1.9×, WIS 20+ → cap at 2.0×.

Effective scaling at common WIS values:

| WIS | wisMod | Spot chance | Reverse chance | Sneak/reversal mult |
|:---:|:------:|:-----------:|:--------------:|:-------------------:|
|  6  |   0    |     0%      |       0%       |        1.5×         |
| 10  |   0    |     0%      |       0%       |        1.5×         |
| 12  |   1    |    10%      |       5%       |        1.6×         |
| 14  |   2    |    20%      |      10%       |        1.7×         |
| 16  |   3    |    30%      |      15%       |        1.8×         |
| 18  |   4    |    40%      |      20%       |        1.9×         |
| 20  |   5    |    50%      |      25%       |        2.0×         |

These perks fire only for Rogue and Ranger — Warrior, Mage, and Cleric are unaffected by their WIS score for ambush purposes.

---

## All 25 combinations

Starting six stats and Max HP / Max MP depend only on class — see the class table above. The **HP/lvl** and **MP/lvl** columns include the level-1 `conMod` / `mindMod` from the class's stats. **Every-4-level bumps** combine class + species (additive). **Every-8-level bump** is class-only and uniform across species.

| Species  | Class   | HP/lvl | MP/lvl | Every 4 lvls (class + species) | Every 8 lvls |
|----------|---------|:------:|:------:|--------------------------------|--------------|
| Human    | Warrior |  +9    |  +1    | +1 STR, +1 CON, +1 CHA         | +1 DEX       |
| Human    | Rogue   |  +5    |  +3    | +1 DEX, +2 CHA                 | +1 WIS       |
| Human    | Mage    |  +3    |  +8    | +1 INT, +1 WIS, +1 CHA         | +1 DEX       |
| Human    | Cleric  |  +6    |  +6    | +1 WIS, +1 STR, +1 CHA         | +1 CON       |
| Human    | Ranger  |  +8    |  +3    | +1 DEX, +1 CON, +1 CHA         | +1 WIS       |
| Elf      | Warrior |  +8    |  +2    | +1 STR, +1 CON, +1 INT         | +1 DEX       |
| Elf      | Rogue   |  +4    |  +4    | +1 DEX, +1 INT, +1 CHA         | +1 WIS       |
| Elf      | Mage    |  +2    |  +9    | +2 INT, +1 WIS                 | +1 DEX       |
| Elf      | Cleric  |  +5    |  +7    | +1 WIS, +1 STR, +1 INT         | +1 CON       |
| Elf      | Ranger  |  +7    |  +4    | +1 DEX, +1 CON, +1 INT         | +1 WIS       |
| Dwarf    | Warrior | +10    |  +1    | +1 STR, +2 CON                 | +1 DEX       |
| Dwarf    | Rogue   |  +6    |  +3    | +1 DEX, +1 CON, +1 CHA         | +1 WIS       |
| Dwarf    | Mage    |  +4    |  +8    | +1 CON, +1 INT, +1 WIS         | +1 DEX       |
| Dwarf    | Cleric  |  +7    |  +6    | +1 STR, +1 CON, +1 WIS         | +1 CON       |
| Dwarf    | Ranger  |  +9    |  +3    | +1 DEX, +2 CON                 | +1 WIS       |
| Halfling | Warrior |  +8    |  +1    | +1 STR, +1 CON, +1 DEX         | +1 DEX       |
| Halfling | Rogue   |  +4    |  +3    | +2 DEX, +1 CHA                 | +1 WIS       |
| Halfling | Mage    |  +2    |  +8    | +1 DEX, +1 INT, +1 WIS         | +1 DEX       |
| Halfling | Cleric  |  +5    |  +6    | +1 STR, +1 DEX, +1 WIS         | +1 CON       |
| Halfling | Ranger  |  +7    |  +3    | +2 DEX, +1 CON                 | +1 WIS       |
| Orc      | Warrior | +10    |  +1    | +2 STR, +1 CON                 | +1 DEX       |
| Orc      | Rogue   |  +6    |  +3    | +1 STR, +1 DEX, +1 CHA         | +1 WIS       |
| Orc      | Mage    |  +4    |  +8    | +1 STR, +1 INT, +1 WIS         | +1 DEX       |
| Orc      | Cleric  |  +7    |  +6    | +2 STR, +1 WIS                 | +1 CON       |
| Orc      | Ranger  |  +9    |  +3    | +1 STR, +1 DEX, +1 CON         | +1 WIS       |

---

## Worked example — Halfling Rogue, levels 1 → 16

Starting: STR 10, DEX 14, CON 10, INT 6, WIS 12, CHA 14. Max HP 30, Max MP 8. WIS mod = 1 (10% spot / 5% reverse / 1.6× sneak).

- **Levels 2 / 3:** +4 HP/lvl, +3 MP/lvl. Sneak attacks already chip in 1.6× damage.
- **Level 4 (primary bump):** +2 DEX (class +1 + Halfling +1), +1 CHA → DEX 16, CHA 15.
- **Level 8 (primary + secondary bump):** +2 DEX, +1 CHA, **+1 WIS** (secondary) → DEX 18, CHA 16, WIS 13. WIS still mod 1 — sneak math unchanged.
- **Level 12:** another primary bump round → DEX 20, CHA 17.
- **Level 16:** primary + secondary again → DEX 22, CHA 18, **WIS 14** (mod 2). Spot chance climbs to 20%, reverse to 10%, sneak hits **1.7×**.

By level 16 the Halfling Rogue cracks DEX 22 (cap-near sneak chance) and reaches the first WIS-mod tier where reversals and bigger sneak crits start landing. Mid-game the rogue is essentially a self-reading scout — they spot one in five mob ambushes and flip half of those into devastating openers.

---

## Cyberpunk / Sci-Fi worlds

Both still flagged `comingSoon`. They keep the older flat `startingMaxMagic` model — those classes don't yet declare a `magicAffinity`, so character creation falls back to the fixed pool. When those worlds get their balancing pass, switch them over to `magicAffinity` (and optionally `castingStat`) the same way fantasy did.
