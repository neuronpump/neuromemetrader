"""
200-Neuron Spiking Neural Network with Reward-Modulated STDP.
Extracted from neuromemetrader.py and adapted for web backend use.
"""

import numpy as np
from collections import deque
from typing import List, Optional

# Network topology
N_INPUT  = 60
N_HIDDEN = 100
N_OUTPUT = 40
N_TOTAL  = N_INPUT + N_HIDDEN + N_OUTPUT

# LIF neuron parameters
V_REST   = -70.0
V_THRESH = -55.0
V_RESET  = -80.0
TAU_M    = 20.0
TAU_REF  = 2.0
DT       = 1.0

# STDP parameters
TAU_PRE  = 20.0
TAU_POST = 20.0
A_PLUS   = 0.010
A_MINUS  = 0.012
W_MAX    = 1.0
W_MIN    = 0.0

# Reward
REWARD_DECAY   = 0.95
ETA_REWARD     = 0.08
BASELINE_ALPHA = 0.01


class SpikingNeuralNetwork:
    def __init__(self):
        N = N_TOTAL
        self.V       = np.full(N, V_REST, dtype=np.float32)
        self.refrac  = np.zeros(N, dtype=np.float32)
        self.spikes  = np.zeros(N, dtype=bool)
        self.spike_history: List[deque] = [deque(maxlen=200) for _ in range(N)]

        rng = np.random.default_rng(0)
        self.W_ih = rng.uniform(0.10, 0.50, (N_HIDDEN, N_INPUT)).astype(np.float32)
        mask = rng.random((N_HIDDEN, N_HIDDEN)) < 0.10
        self.W_hh = (rng.uniform(0.0, 0.30, (N_HIDDEN, N_HIDDEN)) * mask).astype(np.float32)
        np.fill_diagonal(self.W_hh, 0.0)
        self.W_ho = rng.uniform(0.05, 0.30, (N_OUTPUT, N_HIDDEN)).astype(np.float32)

        self.x_pre  = np.zeros(N, dtype=np.float32)
        self.x_post = np.zeros(N, dtype=np.float32)
        self.reward   = 0.0
        self.baseline = 0.0
        self.firing_rate = np.zeros(N, dtype=np.float32)
        self._fr_decay   = 0.990
        self.noise_std   = 2.0
        self.sim_t       = 0.0

    def encode_input(self, features: np.ndarray) -> np.ndarray:
        probs   = np.zeros(N_INPUT, dtype=np.float32)
        centers = np.linspace(-1.0, 1.0, 6)
        sigma   = 0.5
        for i, f in enumerate(features[:10]):
            tuning = np.exp(-((f - centers) ** 2) / (2 * sigma ** 2))
            probs[i*6:(i+1)*6] = tuning * 0.80
        return probs

    def step(self, spike_probs: Optional[np.ndarray] = None):
        rng = np.random

        inp_spikes = (rng.random(N_INPUT) < spike_probs) if spike_probs is not None else np.zeros(N_INPUT, dtype=bool)
        self.spikes[:N_INPUT] = inp_spikes
        self.V[:N_INPUT]      = np.where(inp_spikes, V_THRESH + 5.0, V_REST)

        in_f = inp_spikes.astype(np.float32)
        h_sl = slice(N_INPUT, N_INPUT + N_HIDDEN)
        o_sl = slice(N_INPUT + N_HIDDEN, N_TOTAL)
        prev_h = self.spikes[h_sl].astype(np.float32)

        I_h  = (self.W_ih @ in_f) * 30.0
        I_h += (self.W_hh @ prev_h) * 15.0
        I_h += rng.randn(N_HIDDEN).astype(np.float32) * self.noise_std

        ref_h = self.refrac[h_sl] > 0
        dV_h  = (-(self.V[h_sl] - V_REST) + I_h) / TAU_M * DT
        self.V[h_sl]      = np.where(ref_h, V_RESET, self.V[h_sl] + dV_h)
        self.refrac[h_sl] = np.maximum(0.0, self.refrac[h_sl] - DT)
        fired_h = (self.V[h_sl] >= V_THRESH) & ~ref_h
        self.V[h_sl]      = np.where(fired_h, V_RESET, self.V[h_sl])
        self.refrac[h_sl] = np.where(fired_h, TAU_REF, self.refrac[h_sl])
        self.spikes[h_sl] = fired_h

        I_o  = (self.W_ho @ prev_h) * 25.0
        I_o += rng.randn(N_OUTPUT).astype(np.float32) * self.noise_std

        ref_o = self.refrac[o_sl] > 0
        dV_o  = (-(self.V[o_sl] - V_REST) + I_o) / TAU_M * DT
        self.V[o_sl]      = np.where(ref_o, V_RESET, self.V[o_sl] + dV_o)
        self.refrac[o_sl] = np.maximum(0.0, self.refrac[o_sl] - DT)
        fired_o = (self.V[o_sl] >= V_THRESH) & ~ref_o
        self.V[o_sl]      = np.where(fired_o, V_RESET, self.V[o_sl])
        self.refrac[o_sl] = np.where(fired_o, TAU_REF, self.refrac[o_sl])
        self.spikes[o_sl] = fired_o

        sp = self.spikes.astype(np.float32)
        self.x_pre  += (-self.x_pre  / TAU_PRE  * DT + sp)
        self.x_post += (-self.x_post / TAU_POST * DT + sp)
        self._stdp_update()

        self.firing_rate = self._fr_decay * self.firing_rate + (1.0 - self._fr_decay) * sp
        for i in np.where(self.spikes)[0]:
            self.spike_history[i].append(self.sim_t)
        self.sim_t += DT

    def _stdp_update(self):
        r_tilde = self.reward - self.baseline
        self.baseline = (1 - BASELINE_ALPHA) * self.baseline + BASELINE_ALPHA * abs(self.reward)
        self.reward  *= REWARD_DECAY
        if abs(r_tilde) < 1e-6:
            return

        h_sp = self.spikes[N_INPUT:N_INPUT+N_HIDDEN].astype(np.float32)
        o_sp = self.spikes[N_INPUT+N_HIDDEN:].astype(np.float32)
        i_sp = self.spikes[:N_INPUT].astype(np.float32)

        xpre_i  = self.x_pre[:N_INPUT]
        xpre_h  = self.x_pre[N_INPUT:N_INPUT+N_HIDDEN]
        xpost_h = self.x_post[N_INPUT:N_INPUT+N_HIDDEN]
        xpost_o = self.x_post[N_INPUT+N_HIDDEN:]

        ltp = A_PLUS  * np.outer(h_sp, xpre_i)
        ltd = A_MINUS * np.outer(xpost_h, i_sp)
        self.W_ih = np.clip(self.W_ih + ETA_REWARD * r_tilde * (ltp - ltd), W_MIN, W_MAX)

        ltp = A_PLUS  * np.outer(h_sp, xpre_h)
        ltd = A_MINUS * np.outer(xpost_h, h_sp)
        dW  = ETA_REWARD * r_tilde * (ltp - ltd)
        np.fill_diagonal(dW, 0.0)
        self.W_hh = np.clip(self.W_hh + dW, W_MIN, W_MAX)

        ltp = A_PLUS  * np.outer(o_sp, xpre_h)
        ltd = A_MINUS * np.outer(xpost_o, h_sp)
        self.W_ho = np.clip(self.W_ho + ETA_REWARD * r_tilde * (ltp - ltd), W_MIN, W_MAX)

    def decode_output(self) -> tuple:
        o_fr  = self.firing_rate[N_INPUT+N_HIDDEN:]
        buy   = float(o_fr[0:13].mean())
        sell  = float(o_fr[13:27].mean())
        hold  = float(o_fr[27:40].mean())
        total = buy + sell + hold + 1e-9
        scores = {"BUY": buy, "SELL": sell, "HOLD": hold}
        action = max(scores, key=scores.get)
        conf   = scores[action] / total
        return action, conf

    def set_reward(self, r: float):
        self.reward = float(np.clip(r, -5.0, 5.0))

    def get_state_snapshot(self) -> dict:
        """Serialisable snapshot for WebSocket broadcast."""
        spikes = self.spikes.tolist()
        firing = self.firing_rate.tolist()
        # Neuron voltages normalised to [0,1]
        v_norm = ((self.V - V_RESET) / (V_THRESH - V_RESET)).clip(0, 1).tolist()
        return {
            "spikes":      spikes,
            "firing_rate": firing,
            "v_norm":      v_norm,
            "reward":      round(float(self.reward), 4),
            "sim_t":       round(self.sim_t, 1),
            "w_ih_mean":   round(float(self.W_ih.mean()), 4),
        }

    @property
    def topology(self) -> dict:
        return {"n_input": N_INPUT, "n_hidden": N_HIDDEN, "n_output": N_OUTPUT}
