# Frank — Betfury Dice Bot

This repo now ships your **Uriel Mode V19 (Ultra Refresh)** userscript with extra hardening for selector drift, mobile reliability, and runaway bet protection.

## Main Script

- [`uriel-mode-v19.user.js`](./uriel-mode-v19.user.js)

## Uriel V19 Strategy Profile

- **Bet ratio:** `0.000125` (0.01 on 80 balance)
- **Chance:** `32.67%`
- **After loss:** multiply bet by `1.5`
- **Direction switch:** every `3` consecutive losses
- **Win trigger:** after `2` wins → auto seed change + page refresh + autorun

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

## Notes

- Script behavior depends on Betfury DOM and can break after site updates.
- `parachute-strategy.json` is kept as legacy config reference.
