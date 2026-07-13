# Frank — Betfury Dice Bot

## Current Script — V20 (recommended)

- [`uriel-mode-v20.user.js`](./uriel-mode-v20.user.js)

V20 merges all V19 hardening with a cleaner preset structure, per-preset loss streak limits, and a live stats HUD.

### V20 Preset Values

| Preset | Bet Ratio | Chance | Loss Increase | Dir Switch | Seed Refresh | Max Loss Streak |
|---|---:|---:|---:|---:|---:|---:|
| SAFE | `0.00008` | `40.0%` | `1.35x` | every `4` losses | every `3` wins | `12` |
| BALANCED | `0.000125` | `32.67%` | `1.5x` | every `3` losses | every `2` wins | `18` |
| AGGRESSIVE | `0.0002` | `28.0%` | `1.65x` | every `2` losses | every `2` wins | `8` |

### V20 Features

- Max bet clamp (`3%` of current balance)
- Per-preset hard stop on loss streak
- Direction toggle (under ↔ over) on loss threshold
- Auto seed refresh + page reload cycle with auto-resume
- Run lock prevents duplicate instances
- Persistent HUD re-injection if SPA wipes the DOM
- Live stats: wins, losses, streak, seeds changed, balance

## Install

1. Install Tampermonkey (or Violentmonkey) in your browser.
2. Create a new userscript.
3. Paste contents of `uriel-mode-v20.user.js`.
4. Save and open Betfury dice page:
   - `https://betfury.io/casino/games/dice`
5. Wait ~5 seconds for the HUD panels to appear, then press **START BOT**.

## Switching Presets

1. Stop the bot if it is running.
2. Click **SAFE / BALANCED / AGGRO** in the control panel.
3. Start bot again.

The selected preset is saved in browser localStorage and restored after refresh.

## Notes

- Script behavior depends on Betfury DOM and can break after site updates.
- `parachute-strategy.json` is kept as legacy config reference.
- `uriel-mode-v19.user.js` is kept for reference.
