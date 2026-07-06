"""
Frank — BetFury Crypto Dice Strategy Simulator
===============================================

Implements four common bankroll-management strategies and evaluates them
with a Monte-Carlo simulation so you can see their risk/reward profile
before risking real funds.

Disclaimer
----------
Gambling always carries risk.  The house edge on BetFury dice is ~1 %.
No strategy eliminates this mathematical edge in the long run.
Use this tool for educational analysis only.
"""

import random
import statistics

# ---------------------------------------------------------------------------
# Configuration — edit these values to match your own setup
# ---------------------------------------------------------------------------
STARTING_BALANCE: float = 1_000  # starting bankroll (any currency unit)
BASE_BET: float = 1              # minimum / base bet size
WIN_CHANCE: float = 49.5         # % chance to win each roll (BetFury ≈ 49.5 %)
ROLLS: int = 1_000               # rolls per simulation run
SIMULATIONS: int = 10_000        # Monte-Carlo iterations per strategy

STOP_LOSS_PCT: float = 20.0      # quit if bankroll drops by this % from start
TAKE_PROFIT_PCT: float = 20.0    # quit if bankroll rises by this % from start
MAX_BET: float = STARTING_BALANCE * 0.10  # hard cap — never exceed 10 % of start


# ---------------------------------------------------------------------------
# Strategy implementations
# Each function is a *generator* that yields the bet size for the next roll
# given whether the previous roll was a win.  The caller passes in the result
# of each roll so the strategy can update its internal state.
# ---------------------------------------------------------------------------

def flat_strategy(base_bet: float = BASE_BET):
    """Always bet the same fixed amount."""
    won = None
    while True:
        won = yield base_bet


def martingale_strategy(base_bet: float = BASE_BET):
    """
    Double the bet after every loss; reset to base_bet after a win.
    Classic high-variance strategy — works well in short runs but risks
    hitting the table limit (or wallet limit) after a long losing streak.
    """
    bet = base_bet
    won = None
    while True:
        won = yield min(bet, MAX_BET)
        if won:
            bet = base_bet
        else:
            bet = min(bet * 2, MAX_BET)


def anti_martingale_strategy(base_bet: float = BASE_BET):
    """
    Double the bet after every win; reset to base_bet after a loss.
    Lets winning streaks compound while limiting losses to the base bet.
    """
    bet = base_bet
    won = None
    while True:
            won = yield min(bet, MAX_BET)
            if won:
                bet = min(bet * 2, MAX_BET)
            else:
                bet = base_bet


def fibonacci_strategy(base_bet: float = BASE_BET):
    """
    Move one step *forward* in the Fibonacci sequence on a loss,
    two steps *backward* on a win.  More conservative than Martingale
    during losing streaks.
    """
    sequence = [base_bet]
    index = 0
    won = None
    while True:
        bet = sequence[index]
        won = yield min(bet, MAX_BET)
        if won:
            index = max(0, index - 2)
        else:
            index += 1
            # Extend the sequence if needed
            if index >= len(sequence):
                next_val = sequence[-1] + sequence[-2] if len(sequence) >= 2 else sequence[-1]
                sequence.append(next_val)


# ---------------------------------------------------------------------------
# Simulator
# ---------------------------------------------------------------------------

def simulate(strategy_gen, balance: float = STARTING_BALANCE,
             rolls: int = ROLLS, win_chance: float = WIN_CHANCE) -> dict:
    """
    Run a single simulation session for *rolls* rolls (or until bust / target).

    Returns a dict with:
        final_balance, peak_balance, min_balance, busted, hit_target, rolls_played
    """
    stop_loss = STARTING_BALANCE * (1 - STOP_LOSS_PCT / 100)
    take_profit = STARTING_BALANCE * (1 + TAKE_PROFIT_PCT / 100)

    peak = balance
    trough = balance
    won = None

    # Prime the generator
    next(strategy_gen)

    for roll in range(rolls):
        # Ask the strategy for a bet size
        bet = strategy_gen.send(won)
        bet = max(0.0, min(bet, balance))   # can't bet more than we have

        # Simulate the roll
        won = random.random() * 100 < win_chance
        balance += bet if won else -bet

        peak = max(peak, balance)
        trough = min(trough, balance)

        if balance <= 0:
            return {
                "final_balance": 0,
                "peak_balance": peak,
                "min_balance": 0,
                "busted": True,
                "hit_target": False,
                "rolls_played": roll + 1,
            }

        if balance <= stop_loss:
            break

        if balance >= take_profit:
            return {
                "final_balance": balance,
                "peak_balance": peak,
                "min_balance": trough,
                "busted": False,
                "hit_target": True,
                "rolls_played": roll + 1,
            }

    return {
        "final_balance": balance,
        "peak_balance": peak,
        "min_balance": trough,
        "busted": False,
        "hit_target": balance >= take_profit,
        "rolls_played": rolls,
    }


def monte_carlo(strategy_factory, n: int = SIMULATIONS) -> dict:
    """Run *n* simulations and aggregate results."""
    finals = []
    busts = 0
    hits = 0
    rolls_list = []
    peaks = []
    drawdowns = []

    for _ in range(n):
        gen = strategy_factory()
        result = simulate(gen)
        finals.append(result["final_balance"])
        peaks.append(result["peak_balance"])
        drawdowns.append(STARTING_BALANCE - result["min_balance"])
        rolls_list.append(result["rolls_played"])
        if result["busted"]:
            busts += 1
        if result["hit_target"]:
            hits += 1

    return {
        "mean_final":      statistics.mean(finals),
        "median_final":    statistics.median(finals),
        "bust_rate":       busts / n * 100,
        "target_hit_rate": hits / n * 100,
        "mean_peak":       statistics.mean(peaks),
        "mean_max_dd":     statistics.mean(drawdowns),
        "mean_rolls":      statistics.mean(rolls_list),
    }


# ---------------------------------------------------------------------------
# Entry-point
# ---------------------------------------------------------------------------

STRATEGIES = {
    "Flat":          flat_strategy,
    "Martingale":    martingale_strategy,
    "Anti-Martingale": anti_martingale_strategy,
    "Fibonacci":     fibonacci_strategy,
}


def main():
    print(
        "\n╔══════════════════════════════════════════════════════════════╗\n"
        "║        Frank — BetFury Dice Strategy Simulator              ║\n"
        "╚══════════════════════════════════════════════════════════════╝\n"
        f"  Starting balance : {STARTING_BALANCE:,.2f}\n"
        f"  Base bet         : {BASE_BET:,.2f}\n"
        f"  Win chance       : {WIN_CHANCE} %\n"
        f"  Rolls / session  : {ROLLS}\n"
        f"  Simulations      : {SIMULATIONS:,}\n"
        f"  Stop-loss        : -{STOP_LOSS_PCT} %  "
        f"({STARTING_BALANCE * (1 - STOP_LOSS_PCT/100):,.2f})\n"
        f"  Take-profit      : +{TAKE_PROFIT_PCT} %  "
        f"({STARTING_BALANCE * (1 + TAKE_PROFIT_PCT/100):,.2f})\n"
    )

    header = (
        f"{'Strategy':<20} {'Mean Final':>12} {'Median':>10} "
        f"{'Bust %':>8} {'Target %':>10} {'Mean DD':>10}"
    )
    print(header)
    print("─" * len(header))

    for name, factory in STRATEGIES.items():
        r = monte_carlo(factory)
        print(
            f"{name:<20} {r['mean_final']:>12,.2f} {r['median_final']:>10,.2f} "
            f"{r['bust_rate']:>7.1f}% {r['target_hit_rate']:>9.1f}% "
            f"{r['mean_max_dd']:>10,.2f}"
        )

    print(
        "\n⭐  Recommendation: Flat betting loses the least on average.\n"
        "   Set a stop-loss AND take-profit before you start, and stick to them.\n"
        "\n⚠️  Remember: the house always has an edge. Play responsibly.\n"
    )


if __name__ == "__main__":
    main()
