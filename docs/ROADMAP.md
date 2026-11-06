# AUTOMA Roadmap

## Principle
The core is a **normal, user-configurable game AI**. The user decides what it does; AUTOMA never imposes a protagonist or a fixed playstyle.

## Phase 1 (core)
1. **User-fed profile** (`schemas/profile.schema.json`): free-form label plus numbers, from the user's own words or file.
2. **Composable behaviors** (design below): several features active at once, chosen by the user's command.
3. Live tactical combat on the game's native camera. Camera, music and fast-resolve stay optional extensions.

## Composable behaviors (replaces the single-choice `AutonomyMode`)
Today `AutonomyMode` is one exclusive value (cycle with F7). Target design: a **flag set** `Behaviors`, any combination.

| Flag | Meaning |
|---|---|
| `COMBAT` | Fights: attacks, dodges, parries, abilities. |
| `ASSIST` | Human input passes through; AUTOMA only intercepts lethal wind-ups and low health. |
| `CRUISE` | With no hostiles: follow waypoint, loot nodes and corpses. |
| `DEFENSIVE` | Zero offense: only space, weave and parry. |
| `COMMAND` | Obeys user doctrine orders ("focus ranged", "hold ground"). |

Examples: `CRUISE+COMBAT` (chores plus fights ambushes), `ASSIST+CRUISE` (I fight, it loots), `DEFENSIVE+COMMAND`.

Conflict rules (fixed, so all four SDKs agree):
- `DEFENSIVE` always wins over offense in `COMBAT`.
- `COMBAT` owns movement, so `ASSIST` is inert while `COMBAT` is on and hostiles exist.
- `CRUISE` only acts when no hostiles are present.
- Natural-language command ("loot and fight but don't touch my camera") is mapped by the agent to a flag set plus profile; the old five modes become named presets, so existing conformance fixtures stay valid.

Work remaining: replace the enum with flags in `automa-brain-ts/cs/cpp/lua`, add combination scenarios to `packages/conformance`, regenerate fixtures, run `npm test`.

## Phase 2 (next step)
**Protagonist Fidelity:** REA derives the story protagonist's real fighting style into the same profile schema, for a narrative-consistent takeover.
