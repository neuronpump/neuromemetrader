"""
NeuroMemeTrader — FastAPI backend
WebSocket streams live SNN state + Axiom Trade token data to the frontend.
"""

import asyncio
import json
from typing import Set

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from snn import SpikingNeuralNetwork
from trader import PaperTrader
from price_feed import PriceFeed

app = FastAPI(title="NeuroMemeTrader")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Global state ──────────────────────────────────────────────────────────────
snn    = SpikingNeuralNetwork()
trader = PaperTrader()
feed   = PriceFeed()

clients: Set[WebSocket] = set()
_current_action = "HOLD"
_current_conf   = 0.33
_step           = 0
_spike_probs    = None
_price_history  = []

SIM_STEPS_PER_TICK = 5
TRADE_EVERY_STEPS  = 10


async def broadcast(msg: dict):
    dead = set()
    for ws in clients:
        try:
            await ws.send_text(json.dumps(msg))
        except Exception:
            dead.add(ws)
    clients.difference_update(dead)


async def trading_loop():
    global _step, _spike_probs, _current_action, _current_conf

    while True:
        # SNN simulation steps
        for _ in range(SIM_STEPS_PER_TICK):
            snn.step(spike_probs=_spike_probs)
        _step += SIM_STEPS_PER_TICK

        # Trade decision every N steps
        if _step % TRADE_EVERY_STEPS == 0:
            features     = feed.get_features()
            _spike_probs = snn.encode_input(features)
            _current_action, _current_conf = snn.decode_output()
            token_info = feed.current_token_info()
            reward = trader.execute(
                _current_action, feed.price, _current_conf,
                token_name=token_info.get('ticker', ''),
                market_cap=token_info.get('market_cap', 0.0),
            )
            snn.set_reward(reward)

            if feed.price > 0:
                _price_history.append({
                    "price":  feed.price,
                    "t":      _step,
                    "action": _current_action,
                })
                if len(_price_history) > 300:
                    _price_history.pop(0)

        # Broadcast to all connected clients
        if clients:
            token_info = feed.current_token_info()
            payload = {
                "type":          "tick",
                "step":          _step,
                "is_sim":        feed._use_sim,
                "price":         feed.price,
                "action":        _current_action,
                "conf":          round(_current_conf, 3),
                "token":         token_info,
                "snn":           snn.get_state_snapshot(),
                "trader":        trader.get_state(feed.price),
                "price_history": _price_history[-100:],
            }
            await broadcast(payload)

        await asyncio.sleep(0.05)   # ~20 ticks/s


@app.on_event("startup")
async def startup():
    await feed.start()
    asyncio.create_task(trading_loop())


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    clients.add(ws)

    await ws.send_text(json.dumps({
        "type":     "init",
        "topology": snn.topology,
    }))

    try:
        while True:
            await ws.receive_text()   # keep alive
    except WebSocketDisconnect:
        clients.discard(ws)


@app.get("/health")
def health():
    return {
        "ok":     True,
        "step":   _step,
        "price":  feed.price,
        "is_sim": feed._use_sim,
        "token":  feed.current_token_info(),
    }
