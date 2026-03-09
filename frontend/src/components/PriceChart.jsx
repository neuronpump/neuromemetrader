import { useRef, useEffect } from 'react'

export default function PriceChart({ history, currentPrice }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !history || history.length < 2) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width
    const H = canvas.height

    ctx.fillStyle = '#0d0d1a'
    ctx.fillRect(0, 0, W, H)

    const prices = history.map(h => h.price)
    const lo     = Math.min(...prices)
    const hi     = Math.max(...prices)
    const span   = hi - lo || 1e-10
    const pad    = 24

    for (let i = 1; i < prices.length; i++) {
      const x1 = ((i - 1) / prices.length) * (W - 2)
      const x2 = (i       / prices.length) * (W - 2)
      const y1 = H - pad - ((prices[i-1] - lo) / span) * (H - pad * 2)
      const y2 = H - pad - ((prices[i]   - lo) / span) * (H - pad * 2)

      // Colour by action at that point
      const act = history[i]?.action
      ctx.strokeStyle = act === 'BUY' ? '#00e65a' : act === 'SELL' ? '#e63232' : '#5078ff'
      ctx.lineWidth   = 2
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    }

    // Current price label
    ctx.font      = '11px Courier New'
    ctx.fillStyle = '#ffffff'
    ctx.fillText(`$${currentPrice?.toFixed(8) || '–'}`, 6, H - 6)
  }, [history, currentPrice])

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={140}
      style={{ width: '100%', height: '100%', display: 'block', borderRadius: 6 }}
    />
  )
}
