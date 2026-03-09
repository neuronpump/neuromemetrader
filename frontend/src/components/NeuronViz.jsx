import { useEffect, useRef, useMemo } from 'react'

const COLORS = {
  input:  [50,  120, 255],
  hidden: [170, 50,  230],
  output: [0,   230, 90],
  spike:  [255, 215, 0],
  bg:     '#0a0a14',
}

function buildLayout(topology) {
  const { n_input, n_hidden, n_output } = topology
  const total = n_input + n_hidden + n_output
  const pos = []

  const cols = [
    { start: 0,               end: n_input,             cx: 0.15 },
    { start: n_input,         end: n_input + n_hidden,  cx: 0.50 },
    { start: n_input+n_hidden, end: total,               cx: 0.85 },
  ]

  for (const { start, end, cx } of cols) {
    const n     = end - start
    const ncols = Math.max(1, Math.ceil(Math.sqrt(n * 0.6)))
    const nrows = Math.ceil(n / ncols)
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / ncols)
      const c = i % ncols
      pos.push({
        x: cx + (c - ncols / 2) * 0.04,
        y: 0.12 + (r / Math.max(nrows - 1, 1)) * 0.78,
      })
    }
  }
  return pos
}

export default function NeuronViz({ snn, topology }) {
  const canvasRef = useRef(null)
  const flashRef  = useRef(null)
  const posRef    = useRef(null)

  const total = topology ? topology.n_input + topology.n_hidden + topology.n_output : 200

  useMemo(() => {
    if (topology) {
      posRef.current   = buildLayout(topology)
      flashRef.current = new Float32Array(total)
    }
  }, [topology])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !snn || !posRef.current) return
    const ctx = canvas.getContext('2d')
    const W   = canvas.width
    const H   = canvas.height

    const flash = flashRef.current
    const pos   = posRef.current
    const { n_input, n_hidden } = topology

    // Decay flash
    for (let i = 0; i < flash.length; i++) flash[i] *= 0.80

    // Set new spikes
    const spikes = snn.spikes || []
    for (let i = 0; i < spikes.length; i++) {
      if (spikes[i]) flash[i] = 1.0
    }

    ctx.fillStyle = COLORS.bg
    ctx.fillRect(0, 0, W, H)

    // Draw neurons
    const fr = snn.firing_rate || []
    for (let i = 0; i < total; i++) {
      const p  = pos[i]
      const x  = p.x * W
      const y  = p.y * H
      const fl = flash[i]
      const f  = fr[i] || 0

      let base
      if (i < n_input)               base = COLORS.input
      else if (i < n_input + n_hidden) base = COLORS.hidden
      else                             base = COLORS.output

      const r = Math.round(base[0] * (1 - fl) + 255 * fl)
      const g = Math.round(base[1] * (1 - fl) + 215 * fl)
      const b = Math.round(base[2] * (1 - fl) + 0   * fl)
      const radius = Math.max(3, 3 + f * 18)

      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fillStyle = `rgb(${Math.min(255,r)},${Math.min(255,g)},${Math.min(255,b)})`
      ctx.fill()

      if (fl > 0.5) {
        ctx.beginPath()
        ctx.arc(x, y, radius + 3, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(255,215,0,${fl * 0.8})`
        ctx.lineWidth   = 1.5
        ctx.stroke()
      }
    }

    // Labels
    ctx.font      = 'bold 11px Courier New'
    ctx.fillStyle = `rgb(${COLORS.input.join(',')})`
    ctx.fillText('INPUT', pos[0].x * W - 20, 14)
    ctx.fillStyle = `rgb(${COLORS.hidden.join(',')})`
    ctx.fillText('HIDDEN', pos[n_input].x * W - 24, 14)
    ctx.fillStyle = `rgb(${COLORS.output.join(',')})`
    ctx.fillText('OUTPUT', pos[n_input + n_hidden].x * W - 24, 14)

  }, [snn, topology])

  return (
    <canvas
      ref={canvasRef}
      width={700}
      height={420}
      style={{ width: '100%', height: '100%', display: 'block', borderRadius: 8 }}
    />
  )
}
