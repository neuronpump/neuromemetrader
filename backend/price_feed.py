"""
Live Solana memecoin feed via Axiom Trade WebSocket.
Streams new token launches in real-time; SNN decides whether to snipe.
Falls back to simulation if auth fails.
"""

import os
import asyncio
import numpy as np
from collections import deque
from dataclasses import dataclass, field
from typing import Optional

# Load .env for local dev (Railway uses real env vars, so this is a no-op there)
def _load_env():
    for path in [
        os.path.join(os.path.dirname(__file__), '..', '.env'),
        os.path.join(os.path.dirname(__file__), '.env'),
    ]:
        if os.path.exists(path):
            with open(path) as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        k, v = line.split('=', 1)
                        os.environ.setdefault(k.strip(), v.strip())
            break

_load_env()

AXIOM_EMAIL    = os.environ.get('AXIOM_EMAIL', '')
AXIOM_PASSWORD = os.environ.get('AXIOM_PASSWORD', '')


@dataclass
class TokenEvent:
    name:        str
    ticker:      str
    address:     str
    market_cap:  float   # in SOL
    liquidity:   float   # in SOL
    volume:      float   # in SOL
    protocol:    str
    timestamp:   float = field(default_factory=lambda: __import__('time').time())

    @property
    def price_proxy(self) -> float:
        """Use market cap as a price proxy for the SNN."""
        return max(self.market_cap, 1e-6)


class PriceFeed:
    """
    Connects to Axiom Trade WebSocket and streams new token launches.
    The 'current token' is updated each time a new launch is received.
    """

    def __init__(self):
        self.current: Optional[TokenEvent] = None
        self.history: deque = deque(maxlen=500)
        self._use_sim = False
        self._running = False
        self._client  = None

        # Simulation fallback state
        self._sim_price     = 50.0   # SOL market cap
        self._sim_regime    = 'normal'
        self._sim_regime_dur = 0
        self._sim_sentiment = 0.5
        self._sim_step_n    = 0

        # Expose same interface as before
        self.symbol = 'AXIOM'

    @property
    def price(self) -> float:
        if self.current:
            return self.current.price_proxy
        return self._sim_price

    @property
    def volume_24h(self) -> float:
        if self.current:
            return self.current.volume
        return 0.0

    async def start(self):
        """Authenticate and start WebSocket in background."""
        if AXIOM_EMAIL and AXIOM_PASSWORD:
            try:
                from axiomtradeapi import AxiomTradeClient, AxiomAuth
                auth   = AxiomAuth()
                tokens = await auth.login(AXIOM_EMAIL, AXIOM_PASSWORD)
                self._client = AxiomTradeClient(
                    auth_token=tokens['auth_token'],
                    refresh_token=tokens['refresh_token'],
                )
                self._use_sim = False
                asyncio.create_task(self._listen())
                print('[PriceFeed] Axiom Trade connected — streaming live launches')
                return
            except Exception as e:
                print(f'[PriceFeed] Axiom auth failed: {e} — using simulation')

        self._use_sim = True
        asyncio.create_task(self._sim_loop())
        print('[PriceFeed] Running in simulation mode')

    async def _listen(self):
        """Stream new token launches from Axiom WebSocket."""
        try:
            await self._client.subscribe_new_tokens(callback=self._on_tokens)
        except Exception as e:
            print(f'[PriceFeed] WebSocket error: {e} — falling back to sim')
            self._use_sim = True
            asyncio.create_task(self._sim_loop())

    async def _on_tokens(self, tokens):
        for raw in tokens:
            evt = TokenEvent(
                name       = raw.get('tokenName',    'UNKNOWN'),
                ticker     = raw.get('tokenTicker',  '???'),
                address    = raw.get('tokenAddress', ''),
                market_cap = float(raw.get('marketCapSol',  0) or 0),
                liquidity  = float(raw.get('liquiditySol',  0) or 0),
                volume     = float(raw.get('volumeSol',     0) or 0),
                protocol   = raw.get('protocol',     'unknown'),
            )
            # Filter: must have at least 1 SOL liquidity
            if evt.liquidity >= 1.0:
                self.current = evt
                self.history.append({
                    'price':     evt.price_proxy,
                    'volume':    evt.volume,
                    'liquidity': evt.liquidity,
                    'sentiment': min(1.0, evt.liquidity / 20.0),  # proxy for sentiment
                    'name':      evt.ticker,
                })

    async def _sim_loop(self):
        """Geometric Brownian Motion fallback — fires a new simulated 'token' every tick."""
        while True:
            self._sim_step()
            await asyncio.sleep(2.0)

    def _sim_step(self):
        if self._sim_regime == 'normal':
            if np.random.random() < 0.003:
                self._sim_regime     = 'pump'
                self._sim_regime_dur = np.random.randint(10, 50)
            elif np.random.random() < 0.004:
                self._sim_regime     = 'dump'
                self._sim_regime_dur = np.random.randint(5, 30)
        else:
            self._sim_regime_dur -= 1
            if self._sim_regime_dur <= 0:
                self._sim_regime = 'normal'

        if self._sim_regime == 'pump':
            drift, vol = np.random.uniform(0.006, 0.030), 0.04
            self._sim_sentiment = min(1.0, self._sim_sentiment + 0.05)
        elif self._sim_regime == 'dump':
            drift, vol = np.random.uniform(-0.045, -0.010), 0.06
            self._sim_sentiment = max(0.0, self._sim_sentiment - 0.07)
        else:
            drift = np.random.normal(0.0001, 0.001)
            vol   = 0.020
            self._sim_sentiment = float(np.clip(
                self._sim_sentiment + np.random.normal(0, 0.025), 0, 1))

        ret = drift + vol * np.random.randn()
        self._sim_price = max(1e-10, self._sim_price * (1.0 + ret))

        vm = {'normal': 1.0, 'pump': 3.0, 'dump': 2.0}[self._sim_regime]
        volume = abs(np.random.normal(50 * vm, 10 * vm))
        liq    = abs(np.random.normal(10 * vm, 3 * vm))

        self.history.append({
            'price':     self._sim_price,
            'volume':    volume,
            'liquidity': liq,
            'sentiment': self._sim_sentiment,
            'name':      f'SIM{self._sim_step_n}',
        })
        self._sim_step_n += 1

    # Fetch is now a no-op (WebSocket is push-based); kept for interface compat
    async def fetch(self):
        return not self._use_sim

    def get_features(self) -> np.ndarray:
        """Return 10 normalised features in [-1, 1] for SNN input."""
        h = list(self.history)
        if len(h) < 21:
            return np.zeros(10, dtype=np.float32)

        prices = np.array([x['price']     for x in h], dtype=np.float64)
        vols   = np.array([x['volume']    for x in h], dtype=np.float64)
        liqs   = np.array([x['liquidity'] for x in h], dtype=np.float64)

        p, p1, p5, p20 = prices[-1], prices[-2], prices[-6], prices[-21]
        ret1  = (p - p1)  / (p1  + 1e-12)
        ret5  = (p - p5)  / (p5  + 1e-12)
        ret20 = (p - p20) / (p20 + 1e-12)

        rs    = np.diff(prices[-15:]) / (prices[-15:-1] + 1e-12)
        gains = rs[rs > 0].mean() if (rs > 0).any() else 0.0
        loss  = abs(rs[rs < 0].mean()) if (rs < 0).any() else 1e-6
        rsi   = (100.0 - 100.0 / (1.0 + gains / loss) - 50.0) / 50.0

        rvol    = np.clip(vols[-1] / (np.mean(vols[-20:]) + 1e-6), 0, 5) / 5 * 2 - 1
        mom     = np.tanh(ret5 * 10)
        rv      = np.std(np.diff(prices[-11:]) / (prices[-11:-1] + 1e-12)) if len(prices) > 11 else 0.02
        realvol = np.tanh(rv * 50)
        sent    = h[-1].get('sentiment', 0.5) * 2 - 1

        # Liquidity score (high liq = safer snipe)
        liq_score = np.tanh(liqs[-1] / 10.0 - 1.0)

        if len(prices) >= 26:
            ema12 = self._ema(prices[-26:], 12)[-1]
            ema26 = self._ema(prices[-26:], 26)[-1]
            macd  = np.tanh((ema12 - ema26) / (ema26 + 1e-12) * 100)
        else:
            macd = 0.0

        p50  = prices[-50:].mean() if len(prices) >= 50 else prices.mean()
        plvl = np.tanh((p - p50) / (p50 + 1e-12) * 10)

        feats = np.array([
            np.tanh(ret1  * 20),
            np.tanh(ret5  * 10),
            np.tanh(ret20 *  5),
            rsi, rvol, mom, realvol, sent, liq_score, plvl,
        ], dtype=np.float32)
        return np.clip(feats, -1.0, 1.0)

    @staticmethod
    def _ema(prices, span):
        a = 2.0 / (span + 1)
        out = np.empty_like(prices)
        out[0] = prices[0]
        for i in range(1, len(prices)):
            out[i] = a * prices[i] + (1 - a) * out[i - 1]
        return out

    def current_token_info(self) -> dict:
        if self.current and not self._use_sim:
            return {
                'name':      self.current.name,
                'ticker':    self.current.ticker,
                'address':   self.current.address,
                'market_cap': round(self.current.market_cap, 2),
                'liquidity': round(self.current.liquidity, 2),
                'volume':    round(self.current.volume, 2),
                'protocol':  self.current.protocol,
            }
        return {'name': 'SIMULATED', 'ticker': 'SIM', 'address': '', 'market_cap': round(self._sim_price, 2), 'liquidity': 0, 'volume': 0, 'protocol': 'sim'}
