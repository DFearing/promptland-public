# Pacing Simulator

A headless, deterministic simulator that answers:
**"How long does it take a new character to reach level N under current tuning?"**

Used to declare pacing targets, iterate on game constants, and reliably
verify the result matches your intent.

## Quick start

```bash
npm run sim                                 # uses tools/sim/goals.json
npm run sim tools/sim/profiles/mage-midgame.json   # custom profile
```

Output:

```
Level  Target (min)  Reach %  p25  p50  p75  p90  Verdict
─────  ────────────  ───────  ───  ───  ───  ───  ───────
2      1.5 ±0.5      100%     1.0  1.4  2.1  2.7  ✓
3      3.5 ±1        100%     3.1  3.8  4.2  4.6  ✓
4      7 ±1.5        100%     5.2  5.9  6.5  7.6  ✓
```

Exit code is `1` on any failing verdict (usable in CI).

## The config file

Everything is in the JSON config. Edit and re-run — no code changes to
add a new profile.

```json
{
  "startingCharacter": {
    "world": "fantasy",
    "species": "human",
    "class": "warrior",
    "name": "Tester"
  },
  "goals": [
    { "level": 2, "medianMinutes": 1.5, "toleranceMinutes": 0.5 },
    { "level": 3, "medianMinutes": 3.5, "toleranceMinutes": 1.0 },
    { "level": 4, "medianMinutes": 7.0, "toleranceMinutes": 1.5 }
  ],
  "seeds": 50,
  "maxTicks": 3000
}
```

| Field | Meaning |
|---|---|
| `startingCharacter` | Same IDs as character-creation. Any class/species that exists in the world manifest. |
| `goals[].level` | The level-up event being measured (the level the character *reaches*). |
| `goals[].medianMinutes` | Your target for the p50 player. |
| `goals[].toleranceMinutes` | How far off p50 is allowed to drift before ✓ turns to ✗. |
| `seeds` | Independent simulated runs. 50 is a good default; 100+ for tight tolerances. |
| `maxTicks` | Per-run hard cap. If a seed hits this without reaching the top goal, that level shows up in "Reach %" as < 100%. |

## Profiles

Drop additional configs in `tools/sim/profiles/`:

```
tools/sim/profiles/
  warrior-quick.json    — low levels, aggressive pacing
  mage-midgame.json     — mid levels, spell-heavy class
  long-haul.json        — L5–L15, long run budget
```

Run any of them:

```bash
npm run sim tools/sim/profiles/long-haul.json
```

## Verdicts

- `✓` — p50 within `[medianMinutes ± toleranceMinutes]` and ≥ 50% of
  seeds reached the goal level.
- `✗ p50 off` — median is outside the tolerance band. Tune and re-run.
- `✗ < 50% reach` — most seeds didn't reach this level within
  `maxTicks`. Either the goal is too deep for your tick budget, or
  the tuning makes it unreachable (characters stuck dying).
- `~ p90 long tail` — p50 is on-target but p90 is > 1.5× the upper
  band. Median is fine, but unlucky players bleed. Consider whether
  that's acceptable.

## What's being simulated

- A single fresh character, created exactly as `CharacterCreation.tsx`
  produces one.
- Pure `runTick` from `src/game/tick.ts`, called in a loop.
- A mulberry32 seeded PRNG replaces `Math.random` for the duration of
  each seed's run, so output is **bit-exact reproducible**.
- Tick wall duration is `TICK_MS[state.kind] / tickSpeedMult(speed)`,
  matching `App.tsx`'s `setInterval` cadence including the character's
  auto-ramp schedule.

## What's *not* simulated

- **LLM-generated areas.** The sim uses the hand-authored Millhaven +
  Barrow content only. The `generating-area` state still ticks through
  its built-in "path hasn't taken shape" fallback, but no new rooms,
  mobs, or items appear.
- **UI behavior.** Settings changes made by a player mid-session
  (e.g. flipping tick speed manually, toggling shops off) are not
  reflected. If you ship those as defaults, bake them into the config
  rather than relying on the sim.
- **Real wall-clock time.** The "minutes" column is **in-game time**
  (ticks × cadence). At default speeds these are very close to real,
  but drift if the player overrides cadence.

## Tuning levers

Most likely to move the curve:

| Constant | File | What it does |
|---|---|---|
| `xpReward` values | `src/worlds/<world>/mobs.ts` | XP per kill per archetype |
| `ENCOUNTER_CHANCE` | `src/game/tick.ts` | Fights per explore tick |
| `xpScaleByDelta` | `src/game/tick.ts` | Under/over-level XP multiplier |
| `TICK_SPEED_RAMP` | `src/game/tick.ts` | When auto-cadence bumps |
| `startingTickSpeed` | `src/components/CharacterCreation.tsx` | Starting cadence |
| `REST_DURATION` / `REST_CHANCE` | `src/game/tick.ts` | Downtime |

Change one at a time, re-run, inspect the delta. The sim runs in
a few seconds so the loop is fast.
