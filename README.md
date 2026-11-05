# Autopilot Anything

Let an AI play your game.

Many games already contain a fighting AI on the enemy side. Autopilot Anything reuses it, adapts it, or writes a new one, so that **one hotkey** hands your character to an AI. Press it again and you are back in control.

It is a skill for AI coding agents (Claude, Antigravity, Codex). Like REA (Reverse Engineer Anything), you do not run it yourself: you give it to your agent and name a game.

> "Add autopilot to Assassin's Creed Odyssey. When I enter a fight, my character should fight on its own."

## Two modes

| Mode | What the player experiences |
|---|---|
| Takeover | Press a key; the AI moves, fights and uses abilities as you. Press again to resume. |
| Skip Combat | Press a key at the start of a fight; a short cinematic plays and the encounter resolves in your favour. For people who want the story, not the shootout. |

## How it works

The agent follows a fixed workflow: fingerprint the game with REA, find the seams (player controller, input, enemy AI, combat state, encounter events), pick the cheapest strategy, build the mod in the engine's own loader, then prove it by running the game through a checklist (toggle mid-fight, loading screens, death, cutscenes, save and reload).

Strategy ladder, cheapest first:

1. Reuse enemy or companion AI on the player
2. Find dormant developer or bot switches
3. New brain through the game's own command path
4. New brain through synthetic input
5. Outcome skip (Skip Combat)

Details: [skills/autopilot-anything/SKILL.md](skills/autopilot-anything/SKILL.md), [strategies](skills/autopilot-anything/references/strategies.md), [engines](skills/autopilot-anything/references/engines.md), [brains](skills/autopilot-anything/references/brains.md).

## Per-game recipes

Every game that gets done leaves a report in `targets/<game>/REPORT.md` (start from `targets/_template`). The more recipes, the faster the next game.

| Game | Mode | Status |
|---|---|---|
| (none yet) | | |

## Limits

- Single-player and offline only. Games with online competitive play or kernel anti-cheat are out of scope and no bypass is attempted.
- No game files or assets in this repo. Only mod code, patches and notes.

## License

Mozilla Public License 2.0. See [LICENSE](LICENSE). Changes to files from this repo stay open; your own separate code can remain closed.

