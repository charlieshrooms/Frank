# Frank — Betfury Dice Bot

## Current Scripts

### V21 — Martingale Shield

- [`uriel-mode-v21.user.js`](./uriel-mode-v21.user.js)

V21 is a brand new low-start martingale build tuned around a `30%` win chance and `40%` increase on loss, with extra anti-tilt protections pulled from the older scripts.

#### V21 Values

| Setting | Value |
|---|---:|
| Base Bet Ratio | `0.00004` |
| Base Chance | `30.0%` |
| Base Loss Increase | `1.4x` |
| Direction Switch | every `4` losses |
| Seed Refresh | every `3` wins |
| Recovery Trigger | after `4` losses |
| Recovery Chance | `68.0%` |
| Recovery Loss Increase | `1.18x` |
| Recovery Exit | after `2` wins |
| Max Loss Streak | `14` |

#### V21 Features

- Martingale reset back to base bet on every win
- Super-low starting bet ratio
- Recovery mode on deeper losing streaks
- Direction toggle during losing streaks
- Max bet clamp (`2%` of current balance)
- Hard stop on extended loss streaks
- Auto seed refresh + page reload cycle with auto-resume
- Run lock prevents duplicate instances
- Persistent HUD re-injection if SPA wipes the DOM
- Live stats: wins, losses, streak, mode, seeds changed, balance

### V20 (recommended stable preset build)

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
3. Paste contents of the script you want to run (`uriel-mode-v21.user.js` or `uriel-mode-v20.user.js`).
4. Save and open Betfury dice page:
   - `https://betfury.io/casino/games/dice`
5. Wait ~5 seconds for the HUD panels to appear, then press **START BOT**.

## Switching Presets (V20 only)

1. Stop the bot if it is running.
2. Click **SAFE / BALANCED / AGGRO** in the control panel.
3. Start bot again.

The selected preset is saved in browser localStorage and restored after refresh.

## Notes

- Script behavior depends on Betfury DOM and can break after site updates.
- `parachute-strategy.json` is kept as legacy config reference for recovery behavior.
- `uriel-mode-v19.user.js` is kept for reference.
