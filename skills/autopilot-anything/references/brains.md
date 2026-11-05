# Writing a brain that is not stupid

Typical failure of existing "bot me" features: attack nearest, never dodge, never heal, ignore the build. Fixes:

- **Utility scoring, not a fixed priority list.** Each option (attack, block, dodge, heal, retreat, use ability X, reposition) gets a score from curves over inputs (own health ratio, enemy count in range, stamina, cooldown, distance, incoming attack flag). Pick the top score with a little hysteresis so it does not flicker.
- **Know the build.** Read equipped weapon type, ability list and consumables at toggle time and on every change. Generate the option list from that, not from a hardcoded list.
- **Threat model.** Track who is attacking, who is ranged, who is about to hit. Dodge or block on the enemy's wind-up, not after the hit.
- **Movement.** Use the game's navmesh or pathing. Stuck detection: no progress for N seconds, then try a side step or re-path.
- **Resource policy.** Do not burn rare consumables on trash fights. Make the policy a small config, defaults conservative.
- **Reaction time.** Add a small human-like delay and imperfection. Perfect play looks broken and can desync animations.
- **Exploration mode.** In the open world: follow the objective marker or stay put. Decide this per game and write it down.
- **Stability.** Auto-off on death, loading, menus, cutscenes, vehicles, dialogue. Never act on stale references.

For GOAP, blackboard and steering building blocks use the `game-ai` skill if available.
