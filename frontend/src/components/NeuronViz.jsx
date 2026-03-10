import { useEffect, useRef, useMemo } from 'react'

const COLORS = {
  input:  [50,  120, 255],
  hidden: [170, 50,  230],
  output: [0,   230, 90],
}

function buildLayout(topology, W, H) {
  const { n_input, n_hidden, n_output } = topology
  const total = n_input + n_hidden + n_output
  const pos = []

  const cols = [
    { start: 0,                end: n_input,             cx: 0.15 },
    { start: n_input,          end: n_input + n_hidden,  cx: 0.50 },
    { start: n_input + n_hidden, end: total,             cx: 0.85 },
  ]

  for (const { start, end, cx } of cols) {
    const n     = end - start
    const ncols = Math.max(1, Math.ceil(Math.sqrt(n * 0.6)))
    const nrows = Math.ceil(n / ncols)
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / ncols)
      const c = i % ncols
      pos.push({
        x: (cx + (c - ncols / 2) * 0.045) * W,
        y: (0.12 + (r / Math.max(nrows - 1, 1)) * 0.76) * H,
      })
    }
  }
  return pos
}

// Particles
class Particle {
  constructor(x, y, color) {
    this.x  = x
    this.y  = y
    this.vx = (Math.random() - 0.5) * 4
    this.vy = (Math.random() - 0.5) * 4
    this.life = 1.0
    this.color = color
    this.size  = Math.random() * 3 + 1
  }
  update() {
    this.x    += this.vx
    this.y    += this.vy
    this.vy   += 0.08
    this.life -= 0.035
  }
  draw(ctx) {
    ctx.save()
    ctx.globalAlpha = Math.max(0, this.life)
    ctx.shadowBlur  = 8
    ctx.shadowColor = this.color
    ctx.fillStyle   = this.color
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

// Signal pulses travelling along connections
class Pulse {
  constructor(x1, y1, x2, y2, color) {
    this.x1 = x1; this.y1 = y1
    this.x2 = x2; this.y2 = y2
    this.t  = 0
    this.color = color
  }
  update() { this.t += 0.04 }
  done()   { return this.t >= 1 }
  draw(ctx) {
    const x = this.x1 + (this.x2 - this.x1) * this.t
    const y = this.y1 + (this.y2 - this.y1) * this.t
    ctx.save()
    ctx.globalAlpha = 1 - this.t
    ctx.shadowBlur  = 12
    ctx.shadowColor = this.color
    ctx.fillStyle   = this.color
    ctx.beginPath()
    ctx.arc(x, y, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

export default function NeuronViz({ snn, topology, action }) {
  const canvasRef  = useRef(null)
  const stateRef   = useRef({
    flash:      null,
    pos:        null,
    particles:  [],
    pulses:     [],
    lastAction: null,
    animId:     null,
    lastSnn:    null,
    lastAction2: null,
  })

  // Build layout once
  useMemo(() => {
    if (!topology) return
    const canvas = canvasRef.current
    if (!canvas) return
    const W = canvas.width, H = canvas.height
    const total = topology.n_input + topology.n_hidden + topology.n_output
    stateRef.current.flash = new Float32Array(total)
    stateRef.current.pos   = buildLayout(topology, W, H)
  }, [topology])

  // Update latest snn data
  useEffect(() => {
    stateRef.current.lastSnn = snn
    stateRef.current.lastAction2 = action
  }, [snn, action])

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !topology) return
    const ctx = canvas.getContext('2d')
    const W   = canvas.width
    const H   = canvas.height
    const { n_input, n_hidden, n_output } = topology
    const total = n_input + n_hidden + n_output

    // Pre-build random synapse pairs to draw (subset)
    const synapsesIH = []
    for (let i = 0; i < 30; i++) {
      synapsesIH.push([
        Math.floor(Math.random() * n_input),
        n_input + Math.floor(Math.random() * n_hidden),
      ])
    }
    const synapsesHO = []
    for (let i = 0; i < 20; i++) {
      synapsesHO.push([
        n_input + Math.floor(Math.random() * n_hidden),
        n_input + n_hidden + Math.floor(Math.random() * n_output),
      ])
    }

    let frameCount = 0

    function render() {
      stateRef.current.animId = requestAnimationFrame(render)
      frameCount++

      const s     = stateRef.current
      const flash = s.flash
      const pos   = s.pos
      const snn   = s.lastSnn
      const act   = s.lastAction2

      if (!flash || !pos) return

      // Fade flash
      for (let i = 0; i < flash.length; i++) flash[i] *= 0.78

      // Apply new spikes
      if (snn?.spikes) {
        for (let i = 0; i < snn.spikes.length; i++) {
          if (snn.spikes[i]) {
            flash[i] = 1.0
            // Spawn pulses on spiking hidden neurons
            if (i >= n_input && i < n_input + n_hidden && Math.random() < 0.15) {
              const outIdx = n_input + n_hidden + Math.floor(Math.random() * n_output)
              s.pulses.push(new Pulse(
                pos[i].x, pos[i].y,
                pos[outIdx].x, pos[outIdx].y,
                `rgb(${COLORS.hidden.join(',')})`
              ))
            }
          }
        }
      }

      // Spawn particles on BUY/SELL
      if (act !== s.lastAction && (act === 'BUY' || act === 'SELL')) {
        const color = act === 'BUY' ? '#00e65a' : '#e63232'
        const cx    = act === 'BUY' ? pos[n_input + n_hidden].x : pos[n_input + n_hidden + n_output - 1].x
        const cy    = H / 2
        for (let i = 0; i < 40; i++) {
          s.particles.push(new Particle(cx, cy, color))
        }
      }
      s.lastAction = act

      // Clear
      ctx.fillStyle = '#08080f'
      ctx.fillRect(0, 0, W, H)

      // Draw synapse lines
      const fr = snn?.firing_rate || []

      // IH synapses
      for (const [pre, post] of synapsesIH) {
        const f = (fr[pre] || 0) + (flash[pre] || 0) * 0.5
        if (f < 0.005) continue
        ctx.save()
        ctx.globalAlpha = Math.min(0.5, f * 0.8)
        ctx.strokeStyle = `rgb(${COLORS.input.join(',')})`
        ctx.lineWidth   = 0.8
        ctx.shadowBlur  = f > 0.3 ? 6 : 0
        ctx.shadowColor = `rgb(${COLORS.input.join(',')})`
        ctx.beginPath()
        ctx.moveTo(pos[pre].x,  pos[pre].y)
        ctx.lineTo(pos[post].x, pos[post].y)
        ctx.stroke()
        ctx.restore()
      }

      // HO synapses
      for (const [pre, post] of synapsesHO) {
        const f = (fr[pre] || 0) + (flash[pre] || 0) * 0.5
        if (f < 0.005) continue
        ctx.save()
        ctx.globalAlpha = Math.min(0.5, f * 0.8)
        ctx.strokeStyle = `rgb(${COLORS.hidden.join(',')})`
        ctx.lineWidth   = 0.8
        ctx.shadowBlur  = f > 0.3 ? 6 : 0
        ctx.shadowColor = `rgb(${COLORS.hidden.join(',')})`
        ctx.beginPath()
        ctx.moveTo(pos[pre].x,  pos[pre].y)
        ctx.lineTo(pos[post].x, pos[post].y)
        ctx.stroke()
        ctx.restore()
      }

      // Draw pulses
      s.pulses = s.pulses.filter(p => !p.done())
      for (const p of s.pulses) { p.update(); p.draw(ctx) }

      // Draw neurons
      for (let i = 0; i < total; i++) {
        const p  = pos[i]
        const fl = flash[i] || 0
        const f  = fr[i]    || 0

        let base
        if (i < n_input)                base = COLORS.input
        else if (i < n_input + n_hidden) base = COLORS.hidden
        else                             base = COLORS.output

        const r = Math.min(255, Math.round(base[0] * (1 - fl) + 255 * fl))
        const g = Math.min(255, Math.round(base[1] * (1 - fl) + 215 * fl))
        const b = Math.min(255, Math.round(base[2] * (1 - fl) +   0 * fl))
        const radius = Math.max(2.5, 2.5 + f * 16)

        ctx.save()
        // Outer glow
        if (fl > 0.1 || f > 0.05) {
          ctx.shadowBlur  = fl > 0.5 ? 18 : 8
          ctx.shadowColor = `rgb(${r},${g},${b})`
        }
        ctx.beginPath()
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
        ctx.fillStyle = `rgb(${r},${g},${b})`
        ctx.fill()

        // Extra halo ring on spike
        if (fl > 0.5) {
          ctx.shadowBlur  = 20
          ctx.shadowColor = '#ffd700'
          ctx.strokeStyle = `rgba(255,215,0,${fl * 0.9})`
          ctx.lineWidth   = 1.5
          ctx.beginPath()
          ctx.arc(p.x, p.y, radius + 4, 0, Math.PI * 2)
          ctx.stroke()
        }
        ctx.restore()
      }

      // Draw particles
      s.particles = s.particles.filter(p => p.life > 0)
      for (const p of s.particles) { p.update(); p.draw(ctx) }

      // Layer labels
      ctx.font      = 'bold 11px Courier New'
      ctx.fillStyle = `rgba(${COLORS.input.join(',')},0.7)`
      ctx.fillText('INPUT',  pos[0].x - 20, 14)
      ctx.fillStyle = `rgba(${COLORS.hidden.join(',')},0.7)`
      ctx.fillText('HIDDEN', pos[n_input].x - 24, 14)
      ctx.fillStyle = `rgba(${COLORS.output.join(',')},0.7)`
      ctx.fillText('OUTPUT', pos[n_input + n_hidden].x - 24, 14)
    }

    render()
    return () => cancelAnimationFrame(stateRef.current.animId)
  }, [topology])

  return (
    <canvas
      ref={canvasRef}
      width={700}
      height={420}
      style={{ width: '100%', height: '100%', display: 'block', borderRadius: 8 }}
    />
  )
}
