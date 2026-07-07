# Frank — Betfury Dice Bot

This repo now ships your **Uriel Mode V19 (Ultra Refresh)** userscript with extra hardening for selector drift, mobile reliability, and runaway bet protection.

## Main Script

- [`uriel-mode-v19.user.js`](./uriel-mode-v19.user.js)

## Uriel V19 Strategy Profile

- **Default preset:** `BALANCED`
- Presets are now selectable in the bot UI:
  - **SAFE** → lower ratio, gentler progression, slower pace
  - **BALANCED** → your current V19 baseline behavior
  - **AGGRESSIVE** → higher ratio and progression for faster swings

### Preset Values

| Preset | Bet Ratio | Chance | Loss Increase | Direction Switch | Seed Refresh |
|---|---:|---:|---:|---:|---:|
| SAFE | `0.00008` | `40.0%` | `1.35x` | every `4` losses | every `3` wins |
| BALANCED | `0.000125` | `32.67%` | `1.5x` | every `3` losses | every `2` wins |
| AGGRESSIVE | `0.0002` | `28.0%` | `1.65x` | every `2` losses | every `2` wins |

## Hardening Added

- Max bet clamp (`3%` of current balance)
- Hard stop on deep loss streak (`18`)
- Better button/input selectors for UI updates
- Seed counter UI sync + reload cycle cap
- Manual stop without forced page reload
- If balance is too low to satisfy both site min-bet and safety cap, bot stops instead of forcing a bad bet

## Install

1. Install Tampermonkey (or Violentmonkey) in your browser.
2. Create a new userscript.
3. Paste contents of `uriel-mode-v19.user.js`.
4. Save and open Betfury dice page:
   - `https://betfury.io/casino/games/dice`
5. Wait for the overlay panel and press **START BOT**.

## Switching Presets

1. Stop the bot if it is running.
2. Choose **SAFE / BALANCED / AGGRESSIVE** from the preset dropdown.
3. Press **APPLY**.
4. Start bot again.

The selected preset is saved in browser localStorage and restored after refresh.

## Notes

- Script behavior depends on Betfury DOM and can break after site updates.
- `parachute-strategy.json` is kept as legacy config reference.
