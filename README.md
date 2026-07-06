# Frank — BetFury Crypto Dice Strategy

A Python toolkit for simulating and analysing common bankroll-management strategies on BetFury's provably-fair dice game.

> ⚠️ **Disclaimer:** Gambling always carries risk. The house edge on BetFury dice is ~1 %. No strategy eliminates this mathematical edge over the long run. Use these tools for educational analysis only. Never bet more than you can afford to lose.

---

## Strategies

| Strategy | Description |
|---|---|
| `flat` | Bet the same fixed amount every roll. |
| `martingale` | Double the bet after every loss; reset to base bet after a win. |
| `anti_martingale` | Double the bet after every win; reset to base bet after a loss. |
| `fibonacci` | Follow the Fibonacci sequence on losses; step back two on a win. |

## Quick-start

```bash
python strategy.py
```

The simulator runs each strategy for 1 000 rolls (configurable) and prints a summary table showing final balance, peak balance, max drawdown, and number of bust-outs.

## Configuration

Edit the constants at the top of `strategy.py`:

```python
STARTING_BALANCE = 1000   # starting bankroll (any currency unit)
BASE_BET         = 1      # minimum / base bet size
WIN_CHANCE       = 49.5   # percentage chance to win each roll (BetFury default ≈ 49.5 %)
ROLLS            = 1000   # number of rolls to simulate per run
SIMULATIONS      = 10_000 # Monte-Carlo iterations per strategy
```

## The "Perfect" Strategy

There is no guaranteed winning strategy against a negative-expectation game. The closest to "perfect" is:

1. **Use flat betting** — it loses the slowest on average.
2. **Set a strict stop-loss** (e.g., lose no more than 20 % of starting bankroll).
3. **Set a take-profit target** (e.g., quit when up 20 %).
4. **Keep bets small** relative to bankroll (< 1 % per roll recommended).

The simulator confirms this with Monte-Carlo analysis across 10 000 runs.
