"""
Paper trading engine for NeuroMemeTrader.
Tracks simulated balance against real memecoin prices.
"""

import numpy as np
from dataclasses import dataclass, field
from typing import Optional, List
from collections import deque

INITIAL_CASH   = 10_000.0
TRADE_SIZE_PCT = 0.10
SLIPPAGE       = 0.001


@dataclass
class Position:
    size:        float
    entry_price: float
    entry_step:  int


@dataclass
class Trade:
    action:      str
    price:       float
    pnl:         float
    ret_pct:     float
    step:        int


class PaperTrader:
    def __init__(self):
        self.cash          = INITIAL_CASH
        self.position: Optional[Position] = None
        self.realised_pnl  = 0.0
        self.trades: List[Trade] = []
        self.wins = self.losses = 0
        self.equity_curve: deque = deque([INITIAL_CASH], maxlen=600)
        self._step = 0

    def execute(self, action: str, price: float, confidence: float) -> float:
        reward = 0.0
        equity = self.total_equity(price)
        self._step += 1

        if action == "BUY" and self.position is None:
            size_usd = equity * TRADE_SIZE_PCT * max(0.3, confidence)
            cost     = size_usd * (1.0 + SLIPPAGE)
            if cost <= self.cash:
                tokens        = size_usd / price
                self.cash    -= cost
                self.position = Position(tokens, price, self._step)

        elif action == "SELL" and self.position is not None:
            proceeds   = self.position.size * price * (1.0 - SLIPPAGE)
            cost_basis = self.position.size * self.position.entry_price
            pnl        = proceeds - cost_basis
            self.cash += proceeds
            self.realised_pnl += pnl
            ret = pnl / (cost_basis + 1e-9)
            self.trades.append(Trade("SELL", price, pnl, ret * 100, self._step))
            if pnl >= 0:
                self.wins += 1
                reward     = min(5.0, ret * 50)
            else:
                self.losses += 1
                reward       = max(-5.0, ret * 50)
            self.position = None

        elif action == "HOLD":
            if self.position is not None:
                unreal = (price - self.position.entry_price) * self.position.size
                reward = float(np.sign(unreal)) * 0.01
            else:
                reward = -0.005

        self.equity_curve.append(self.total_equity(price))
        return reward

    def total_equity(self, price: float) -> float:
        base = self.cash
        if self.position:
            base += self.position.size * price
        return base

    def win_rate(self) -> float:
        total = self.wins + self.losses
        return self.wins / total if total > 0 else 0.0

    def sharpe(self) -> float:
        eq   = np.array(list(self.equity_curve), dtype=np.float64)
        if len(eq) < 3:
            return 0.0
        rets = np.diff(eq) / (eq[:-1] + 1e-9)
        std  = rets.std()
        return float(rets.mean() / (std + 1e-9) * np.sqrt(1000))

    def max_drawdown(self) -> float:
        eq   = np.array(list(self.equity_curve), dtype=np.float64)
        peak = np.maximum.accumulate(eq)
        dd   = (peak - eq) / (peak + 1e-9)
        return float(dd.max()) if len(dd) > 0 else 0.0

    def get_state(self, price: float) -> dict:
        equity = self.total_equity(price)
        return {
            "cash":           round(self.cash, 2),
            "equity":         round(equity, 2),
            "pnl":            round(self.realised_pnl, 2),
            "pnl_pct":        round((equity / INITIAL_CASH - 1) * 100, 2),
            "win_rate":       round(self.win_rate() * 100, 1),
            "trades":         self.wins + self.losses,
            "wins":           self.wins,
            "losses":         self.losses,
            "sharpe":         round(self.sharpe(), 2),
            "max_drawdown":   round(self.max_drawdown() * 100, 2),
            "has_position":   self.position is not None,
            "entry_price":    self.position.entry_price if self.position else None,
            "equity_curve":   list(self.equity_curve)[-100:],
            "recent_trades":  [
                {
                    "pnl":     round(t.pnl, 2),
                    "ret_pct": round(t.ret_pct, 2),
                    "price":   t.price,
                    "step":    t.step,
                }
                for t in self.trades[-10:]
            ],
        }
