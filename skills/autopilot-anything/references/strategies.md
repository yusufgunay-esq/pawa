# Strategy ladder

Go down only when the step above fails, and write down why.

## S1. Reuse enemy or companion AI on the player

Swap the player's controller (or its input source) for the AI controller the game already uses for NPCs or for AI-controlled party members.

- Works well when player and NPC share one base class (shared character/agent/pawn type).
- Watch for: faction and perception (the AI must not treat the player as an enemy), missing animations or abilities on the enemy brain, loadout assumptions, camera ownership, UI that expects a human.
- Check first: does the game already have a companion, mercenary, "AI takes over when you die" or spectator mode? That is S1 half done.

## S2. Debug or developer switches

Many engines ship dormant autoplay, bot or cheat features (bot-control console commands, dev menus, automated test drivers). Search strings and command tables with REA before anything else. Cheap to find, often complete.

## S3. New brain, game's own command path

Write a decision layer (utility AI or GOAP, see `brains.md`) that reads game state through hooks and issues the same internal commands the input system issues (`move`, `attack`, `use ability`, `dodge`).

- Needs a perception adapter (enemies, health, cooldowns, cover, navmesh) and an action adapter.
- Keep the brain engine-agnostic and the two adapters thin, so the brain is reusable between games.

## S4. New brain, synthetic input

Same brain, but actions go out as emulated controller or keyboard input and state is read from memory, logs or an API. Use when the command path is not hookable. Accept lower precision and handle focus loss.

## S5. Outcome skip (Skip Combat)

Do not play the fight. Detect encounter start, then:
1. Optionally play a short cinematic or a fast-forwarded camera (bridge the gap so it feels intentional).
2. Resolve the encounter: remove or down the enemies, or fire the game's own "encounter complete" event.
3. Restore state cleanly (health policy, ammo policy, objective flags, music, AI alert state).

Be careful about quest flags: skipping must trigger the same completion events as winning, or the story soft-locks. Test save, reload, and the next objective.

## Last resort: pixels

Screen capture plus a vision model plus input. Slow and fragile. Only for games with no loader and no readable state. Say so plainly in the report.
