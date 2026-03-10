import { useState, useEffect, useRef, useCallback } from 'react'
import NeuronViz from './components/NeuronViz'
import PriceChart from './components/PriceChart'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws'

const ACTION_COLOR = { BUY: '#00e65a', SELL: '#e63232', HOLD: '#ffd700' }
const ACTION_BG    = { BUY: '#001f0f', SELL: '#1f0000', HOLD: '#1a1500' }

function StatBox({ label, value, color, sub }) {
  return (
    <div style={{
      background: '#111122', borderRadius: 8, padding: '10px 14px',
      border: '1px solid #222244', minWidth: 100,
    }}>
      <div style={{ color: '#6060a0', fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ color: color || '#e0e0f0', fontSize: 20, fontWeight: 'bold' }}>
        {value}
      </div>
      {sub && <div style={{ color: '#505070', fontSize: 10, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function TradeRow({ trade }) {
  const positive = trade.pnl >= 0
  return (
    <div style={{
      display: 'flex', gap: 12, fontSize: 11, padding: '4px 0',
      borderBottom: '1px solid #1a1a2e', color: positive ? '#00e65a' : '#e63232',
    }}>
      <span style={{ color: '#606080', width: 50 }}>#{trade.step}</span>
      <span>${trade.price?.toFixed(8)}</span>
      <span style={{ marginLeft: 'auto' }}>{positive ? '+' : ''}{trade.pnl?.toFixed(2)} USD</span>
      <span>({positive ? '+' : ''}{trade.ret_pct?.toFixed(1)}%)</span>
    </div>
  )
}

export default function App() {
  const [topology, setTopology]     = useState(null)
  const [tick, setTick]             = useState(null)
  const [connected, setConnected]   = useState(false)
  const [tokens, setTokens]         = useState([])
  const wsRef = useRef(null)

  const connect = useCallback(() => {
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen  = () => setConnected(true)
    ws.onclose = () => {
      setConnected(false)
      setTimeout(connect, 2000)
    }
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'init') {
        setTopology(msg.topology)
      } else if (msg.type === 'tick') {
        setTick(msg)
      }
    }
  }, [])

  useEffect(() => { connect() }, [connect])

  const trader  = tick?.trader  || {}
  const snn     = tick?.snn     || {}
  const action  = tick?.action  || 'HOLD'
  const conf    = tick?.conf    || 0
  const price   = tick?.price   || 0
  const isSim   = tick?.is_sim

  return (
    <div style={{ minHeight: '100vh', background: '#05050f', padding: '16px', color: '#e0e0f0' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <div>
          <h1 style={{
            fontSize: 32, fontWeight: 900, letterSpacing: 4,
            background: 'linear-gradient(90deg, #00d4ff, #a855f7)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            textShadow: 'none', filter: 'drop-shadow(0 0 12px #00d4ff88)',
          }}>
            NEURONPUMP
          </h1>
          <div style={{ fontSize: 10, color: '#304060', letterSpacing: 2, marginTop: 2 }}>
            200-NEURON SNN · STDP LEARNING · SOLANA MEMECOINS
          </div>
        </div>

        <div style={{ marginLeft: 32, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: 11, color: '#406080', letterSpacing: 1 }}>CONTRACT ADDRESS</div>
          <div style={{ fontSize: 15, color: '#607090', letterSpacing: 1, fontWeight: 'bold' }}>TBA</div>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <a
            href="https://x.com/NeuronPump"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 6, textDecoration: 'none',
              background: '#0f0f1a', border: '1px solid #222244',
              color: '#e0e0f0', fontSize: 12, fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.734-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
            @NeuronPump
          </a>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: connected ? '#00e65a' : '#e63232',
            boxShadow: connected ? '0 0 6px #00e65a' : 'none',
          }} />
        </div>
      </div>

      {/* Action banner */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 20,
        background: ACTION_BG[action] || '#111',
        border: `1px solid ${ACTION_COLOR[action] || '#333'}`,
        borderRadius: 10, padding: '12px 20px', marginBottom: 16,
      }}>
        <div style={{ fontSize: 28, fontWeight: 'bold', color: ACTION_COLOR[action], minWidth: 80 }}>
          {action}
        </div>
        <div>
          <div style={{ color: '#808090', fontSize: 13 }}>
            {(conf * 100).toFixed(0)}% confidence · step {tick?.step || 0}
          </div>
          {tick?.token?.ticker && tick.token.ticker !== 'SIM' && (
            <div style={{ fontSize: 11, color: '#00d4ff', marginTop: 2 }}>
              🚀 {tick.token.ticker} · {tick.token.name}
            </div>
          )}
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 'bold', color: '#00d4ff' }}>
            {price.toFixed(2)} SOL mcap
          </div>
          <div style={{ fontSize: 11, color: '#505070' }}>
            liq: {tick?.token?.liquidity?.toFixed(2) || '–'} SOL · vol: {tick?.token?.volume?.toFixed(2) || '–'} SOL
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <StatBox
          label="Equity"
          value={`$${(trader.equity || 10000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          color={trader.pnl_pct >= 0 ? '#00e65a' : '#e63232'}
          sub={`Start $10,000`}
        />
        <StatBox
          label="P&L"
          value={`${trader.pnl >= 0 ? '+' : ''}$${(trader.pnl || 0).toFixed(2)}`}
          color={trader.pnl >= 0 ? '#00e65a' : '#e63232'}
          sub={`${trader.pnl_pct >= 0 ? '+' : ''}${trader.pnl_pct || 0}%`}
        />
        <StatBox
          label="Win Rate"
          value={`${trader.win_rate || 0}%`}
          color={trader.win_rate >= 50 ? '#00e65a' : '#e63232'}
          sub={`${trader.wins || 0}W / ${trader.losses || 0}L`}
        />
        <StatBox
          label="Trades"
          value={trader.trades || 0}
          color="#e0e0f0"
        />
        <StatBox
          label="Sharpe"
          value={trader.sharpe || 0}
          color={trader.sharpe > 0 ? '#00e65a' : '#e63232'}
        />
        <StatBox
          label="Max DD"
          value={`${trader.max_drawdown || 0}%`}
          color="#ff8c00"
        />
        <StatBox
          label="SNN Reward"
          value={snn.reward > 0 ? `+${snn.reward}` : snn.reward || 0}
          color={snn.reward > 0 ? '#00e65a' : snn.reward < 0 ? '#e63232' : '#808090'}
          sub={`W_ih: ${snn.w_ih_mean || 0}`}
        />
        <StatBox
          label="Position"
          value={trader.has_position ? 'OPEN' : 'NONE'}
          color={trader.has_position ? '#ffd700' : '#505070'}
          sub={trader.has_position && trader.entry_price
            ? `Entry: $${trader.entry_price?.toFixed(8)}`
            : ''}
        />
      </div>

      {/* Main grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16 }}>

        {/* Left: neuron viz + price chart */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{
            background: '#08080f', borderRadius: 12,
            border: '1px solid #1a1a4a',
            boxShadow: '0 0 30px #0d0d3a, inset 0 0 30px #05050f',
            padding: 8, height: 440,
          }}>
            <div style={{ fontSize: 11, color: '#405070', letterSpacing: 1, marginBottom: 4 }}>
              LIVE NEURON ACTIVITY · 200 LIF NEURONS
            </div>
            {topology
              ? <NeuronViz snn={snn} topology={topology} />
              : <div style={{ color: '#333', padding: 40, textAlign: 'center' }}>Connecting…</div>
            }
          </div>

          <div style={{
            background: '#0d0d1a', borderRadius: 10, border: '1px solid #1a1a3a',
            padding: 8, height: 180,
          }}>
            <div style={{ fontSize: 11, color: '#405070', letterSpacing: 1, marginBottom: 4 }}>
              MARKET CAP CHART · AXIOM LIVE LAUNCHES (colour = last action)
            </div>
            <PriceChart history={tick?.price_history} currentPrice={price} />
          </div>
        </div>

        {/* Right: equity curve + trade history */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Equity mini chart */}
          <div style={{
            background: '#0d0d1a', borderRadius: 10, border: '1px solid #1a1a3a',
            padding: 12,
          }}>
            <div style={{ fontSize: 11, color: '#405070', letterSpacing: 1, marginBottom: 8 }}>
              EQUITY CURVE
            </div>
            <EquityMini curve={trader.equity_curve} initial={10000} />
          </div>

          {/* Trade history */}
          <div style={{
            background: '#0d0d1a', borderRadius: 10, border: '1px solid #1a1a3a',
            padding: 12, flex: 1, overflow: 'hidden',
          }}>
            <div style={{ fontSize: 11, color: '#405070', letterSpacing: 1, marginBottom: 8 }}>
              RECENT TRADES
            </div>
            {(trader.recent_trades || []).length === 0
              ? <div style={{ color: '#303050', fontSize: 12, paddingTop: 20, textAlign: 'center' }}>
                  No trades yet — neurons learning…
                </div>
              : [...(trader.recent_trades || [])].reverse().map((t, i) =>
                  <TradeRow key={i} trade={t} />
                )
            }
          </div>

          {/* SNN info */}
          <div style={{
            background: '#0d0d1a', borderRadius: 10, border: '1px solid #1a1a3a',
            padding: 12,
          }}>
            <div style={{ fontSize: 11, color: '#405070', letterSpacing: 1, marginBottom: 8 }}>
              NEURAL NETWORK
            </div>
            <div style={{ fontSize: 11, lineHeight: 1.8, color: '#808090' }}>
              <div><span style={{ color: '#5060a0' }}>Architecture</span>  60 input + 100 hidden + 40 output</div>
              <div><span style={{ color: '#5060a0' }}>Plasticity  </span>  Reward-modulated STDP</div>
              <div><span style={{ color: '#5060a0' }}>Sim time    </span>  {snn.sim_t ? (snn.sim_t / 1000).toFixed(1) : 0} s</div>
              <div><span style={{ color: '#5060a0' }}>Mean W_ih   </span>  {snn.w_ih_mean || 0}</div>
              <div><span style={{ color: '#5060a0' }}>Reward      </span>  <span style={{ color: snn.reward > 0 ? '#00e65a' : '#e63232' }}>{snn.reward || 0}</span></div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20, textAlign: 'center', fontSize: 10, color: '#303050', letterSpacing: 1 }}>
        NEURONPUMP · PAPER TRADING ONLY · NOT FINANCIAL ADVICE
      </div>
    </div>
  )
}

function EquityMini({ curve, initial }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !curve || curve.length < 2) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width, H = canvas.height
    ctx.fillStyle = '#080810'
    ctx.fillRect(0, 0, W, H)
    const lo = Math.min(...curve), hi = Math.max(...curve)
    const span = Math.max(hi - lo, 1)
    const pad = 10

    // Baseline
    if (lo <= initial && initial <= hi) {
      const by = H - pad - ((initial - lo) / span) * (H - pad * 2)
      ctx.strokeStyle = '#333355'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath(); ctx.moveTo(0, by); ctx.lineTo(W, by); ctx.stroke()
      ctx.setLineDash([])
    }

    for (let i = 1; i < curve.length; i++) {
      const x1 = ((i-1) / curve.length) * W
      const x2 = (i     / curve.length) * W
      const y1 = H - pad - ((curve[i-1] - lo) / span) * (H - pad * 2)
      const y2 = H - pad - ((curve[i]   - lo) / span) * (H - pad * 2)
      ctx.strokeStyle = curve[i] >= initial ? '#00e65a' : '#e63232'
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    }
  }, [curve, initial])

  return (
    <canvas
      ref={canvasRef}
      width={320}
      height={100}
      style={{ width: '100%', height: 100, display: 'block', borderRadius: 6 }}
    />
  )
}
