# Frank — Betfury Dice Bot

Automated dice strategies for [Betfury.com](https://betfury.com).

---

## 🪂 The Parachute Strategy

**Core concept:** When winning → stay conservative and bank gains. When losing → automatically switch to high win-chance survival mode to tread water. Reset and repeat forever.

### Initial Setup (before starting autobet)

| Setting | Value |
|---|---|
| Bet Amount | Minimum possible |
| Win Chance | 49% |
| Direction | Roll Under |

### Bankroll Rules

- Fund your session with at least **50× your base bet**
- **Hard stop:** if your balance drops below **20× base bet**, stop for the day

---

### Conditions — Enter in This Exact Order (top-down matters)

| # | ON | DO |
|---|---|---|
| 1 | Every **1** Win | **Reset bet amount** |
| 2 | Every **1** Loss | **Increase bet amount by 40%** |
| 3 | Every **4** Losses | **Set win chance → 72%** |
| 4 | Every **4** Wins | **Reset win chance** |
| 5 | Every **4** Wins | **Reset bet amount** |
| 6 | Every **15** Losses | **Stop autobet** |

---

### How It Works

1. **Condition 1** fires first on every win — immediately kills any inflated bet from a losing streak, locking in the small recovery.
2. **Condition 2** is a soft martingale — 40% increases instead of 100%, so your bankroll survives much longer during streaks.
3. **Condition 3** is the parachute — after 4 straight losses, win chance jumps to 72%. You now win ~3 of every 4 bets (small payouts) instead of bleeding fast.
4. **Conditions 4 & 5** fire together after 4 wins in survival mode — fully resets both win chance and bet amount back to base. Clean slate.
5. **Condition 6** is the hard floor — if losses go 15 deep with no recovery at all, the bot stops itself so you don't wake up broke.

### The Key Insight

> At 72% win chance you win 3 of 4 bets. This isn't recovery — it's **stalling** until the bet resets, then starting fresh. You trade big wins for survival.

The full strategy config is in [`parachute-strategy.json`](./parachute-strategy.json).
