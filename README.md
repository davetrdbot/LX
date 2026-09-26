# LX — Battle Royale

A Free Fire–style battle royale that runs in the browser (desktop and mobile). No install, no build step.

**Made by INYANG DAVID.**

## Play locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Any static file server works. The page loads Three.js from jsDelivr, so you need an internet connection.

## Features

- **30-player matches**: you plus 29 AI bots that loot, fight each other, use skills and grenades, and move with the zone.
- **Plane drop and parachute** over a 660 m island with 9 named towns, hills, forests, beaches, roads, containers and cars.
- **Six guns**: G18, MP40, M1887, M4A1, AK and AWM (scoped). They have recoil, spread, headshots and reloads.
- **Gear and items**: vests and helmets (levels 1–3), medkits, EP mushrooms, gloo walls and frag grenades.
- **Three characters**, each with an active skill:
  - KAI: Dash
  - NIA: Healing Pulse
  - REX: Barrier Dome
- **Match events**: a shrinking safe zone (6 phases), an airdrop with top-tier loot, and death crates.
- **Progression** saved in your browser: account level and XP, and ranked points from Bronze to Grandmaster.
- **Interface**: HUD, minimap and full map (M), kill feed, damage numbers, and gunshot pings.
- **Graphics presets** (Low, Medium, High) for weaker phones.

## Controls

| Action | Desktop | Mobile |
|---|---|---|
| Move / look | WASD / mouse | left stick / drag right side |
| Fire / scope | LMB / RMB | FIRE / SCOPE |
| Sprint / jump | Shift / Space | RUN / JUMP |
| Pick up, reload, switch | E, R, 1/2 (Q) | PICK, R, SWAP |
| Medkit, gloo wall, grenade, skill | H, G, T, X | MED, GLOO, NADE, SKILL |
| Jump from plane / map | F / M | JUMP |

## Tech

The game uses Three.js r160 as ES modules, with no bundler. Characters are the CC0 Quaternius Universal Animation Library mannequin (`assets/characters`); an outfit shader dresses each one, and a two-layer animation setup lets them aim while running. All other visuals are procedural, including the textures, buildings, terrain and sounds.

Add `?speed=4` to run the simulation faster for testing, and `?q=low|med|high` to force a graphics preset.
