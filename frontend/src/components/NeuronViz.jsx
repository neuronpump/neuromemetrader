import { useEffect, useRef } from 'react'

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
    { start: 0,                  end: n_input,             cx: 0.15 },
    { start: n_input,            end: n_input + n_hidden,  cx: 0.50 },
    { start: n_input + n_hidden, end: total,               cx: 0.85 },
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

class Particle {
  constructor(x, y, color) {
    this.x = x; this.y = y
    this.vx = (Math.random() - 0.5) * 4
    this.vy = (Math.random() - 0.5) * 4
    this.life = 1.0
    this.color = color
    this.size = Math.random() * 3 + 1
  }
  update() { this.x += this.vx; this.y += this.vy; this.vy += 0.08; this.life -= 0.035 }
  draw(ctx) {
    ctx.save()
    ctx.globalAlpha = Math.max(0, this.life)
    ctx.shadowBlur = 8; ctx.shadowColor = this.color
    ctx.fillStyle = this.color
    ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }
}

class Pulse {
  constructor(x1, y1, x2, y2, color) {
    this.x1=x1; this.y1=y1; this.x2=x2; this.y2=y2; this.t=0; this.color=color
  }
  update() { this.t += 0.04 }
  done()   { return this.t >= 1 }
  draw(ctx) {
    const x = this.x1 + (this.x2 - this.x1) * this.t
    const y = this.y1 + (this.y2 - this.y1) * this.t
    ctx.save()
    ctx.globalAlpha = 1 - this.t
    ctx.shadowBlur = 12; ctx.shadowColor = this.color
    ctx.fillStyle = this.color
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }
}

export default function NeuronViz({ snn, topology, action }) {
  const canvasRef = useRef(null)
  const dataRef   = useRef({ snn: null, action: null })

  // Keep latest data in ref so animation loop always has fresh values
  useEffect(() => {
    dataRef.current.snn    = snn
    dataRef.current.action = action
  }, [snn, action])

  // Animation loop — starts once topology is known and canvas is mounted
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !topology) return

    const W = canvas.width
    const H = canvas.height
    const { n_input, n_hidden, n_output } = topology
    const total = n_input + n_hidden + n_output

    const pos   = buildLayout(topology, W, H)
    const flash = new Float32Array(total)

    // Pre-build synapse pairs
    const synIH = Array.from({ length: 30 }, () => [
      Math.floor(Math.random() * n_input),
      n_input + Math.floor(Math.random() * n_hidden),
    ])
    const synHO = Array.from({ length: 20 }, () => [
      n_input + Math.floor(Math.random() * n_hidden),
      n_input + n_hidden + Math.floor(Math.random() * n_output),
    ])

    const ctx       = canvas.getContext('2d')
    let particles   = []
    let pulses      = []
    let lastAction  = null
    let animId      = null

    function render() {
      animId = requestAnimationFrame(render)

      const { snn, action } = dataRef.current

      // Decay flash
      for (let i = 0; i < flash.length; i++) flash[i] *= 0.78

      // Apply spikes
      if (snn?.spikes) {
        for (let i = 0; i < snn.spikes.length; i++) {
          if (snn.spikes[i]) {
            flash[i] = 1.0
            if (i >= n_input && i < n_input + n_hidden && Math.random() < 0.12) {
              const outIdx = n_input + n_hidden + Math.floor(Math.random() * n_output)
              pulses.push(new Pulse(
                pos[i].x, pos[i].y, pos[outIdx].x, pos[outIdx].y,
                `rgb(${COLORS.hidden.join(',')})`
              ))
            }
          }
        }
      }

      // Particles on BUY/SELL
      if (action !== lastAction && (action === 'BUY' || action === 'SELL')) {
        const color = action === 'BUY' ? '#00e65a' : '#e63232'
        const cx    = W * (action === 'BUY' ? 0.85 : 0.85)
        const cy    = H / 2
        for (let i = 0; i < 50; i++) particles.push(new Particle(cx, cy, color))
      }
      lastAction = action

      // Clear
      ctx.fillStyle = '#08080f'
      ctx.fillRect(0, 0, W, H)

      const fr = snn?.firing_rate || []

      // Synapse lines IH
      for (const [pre, post] of synIH) {
        const f = (fr[pre] || 0) + (flash[pre] || 0) * 0.5
        if (f < 0.01) continue
        ctx.save()
        ctx.globalAlpha = Math.min(0.45, f * 0.7)
        ctx.strokeStyle = `rgb(${COLORS.input.join(',')})`
        ctx.lineWidth   = 0.7
        ctx.shadowBlur  = f > 0.3 ? 5 : 0
        ctx.shadowColor = `rgb(${COLORS.input.join(',')})`
        ctx.beginPath(); ctx.moveTo(pos[pre].x, pos[pre].y); ctx.lineTo(pos[post].x, pos[post].y); ctx.stroke()
        ctx.restore()
      }

      // Synapse lines HO
      for (const [pre, post] of synHO) {
        const f = (fr[pre] || 0) + (flash[pre] || 0) * 0.5
        if (f < 0.01) continue
        ctx.save()
        ctx.globalAlpha = Math.min(0.45, f * 0.7)
        ctx.strokeStyle = `rgb(${COLORS.hidden.join(',')})`
        ctx.lineWidth   = 0.7
        ctx.shadowBlur  = f > 0.3 ? 5 : 0
        ctx.shadowColor = `rgb(${COLORS.hidden.join(',')})`
        ctx.beginPath(); ctx.moveTo(pos[pre].x, pos[pre].y); ctx.lineTo(pos[post].x, pos[post].y); ctx.stroke()
        ctx.restore()
      }

      // Pulses
      pulses = pulses.filter(p => !p.done())
      for (const p of pulses) { p.update(); p.draw(ctx) }

      // Neurons
      for (let i = 0; i < total; i++) {
        const p  = pos[i]
        const fl = flash[i] || 0
        const f  = fr[i]    || 0

        let base = i < n_input ? COLORS.input : i < n_input + n_hidden ? COLORS.hidden : COLORS.output

        const r = Math.min(255, Math.round(base[0] * (1 - fl) + 255 * fl))
        const g = Math.min(255, Math.round(base[1] * (1 - fl) + 215 * fl))
        const b = Math.min(255, Math.round(base[2] * (1 - fl) +   0 * fl))
        const radius = Math.max(2.5, 2.5 + f * 16)

        ctx.save()
        ctx.shadowBlur  = fl > 0.3 ? 16 : f > 0.05 ? 6 : 2
        ctx.shadowColor = `rgb(${r},${g},${b})`
        ctx.fillStyle   = `rgb(${r},${g},${b})`
        ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.fill()

        if (fl > 0.5) {
          ctx.shadowBlur  = 22
          ctx.shadowColor = '#ffd700'
          ctx.strokeStyle = `rgba(255,215,0,${fl * 0.9})`
          ctx.lineWidth   = 1.5
          ctx.beginPath(); ctx.arc(p.x, p.y, radius + 4, 0, Math.PI * 2); ctx.stroke()
        }
        ctx.restore()
      }

      // Particles
      particles = particles.filter(p => p.life > 0)
      for (const p of particles) { p.update(); p.draw(ctx) }

      // Labels
      ctx.font = 'bold 11px "Share Tech Mono", monospace'
      ctx.shadowBlur = 0
      ctx.globalAlpha = 0.6
      ctx.fillStyle = `rgb(${COLORS.input.join(',')})`;  ctx.fillText('INPUT',  30, 14)
      ctx.fillStyle = `rgb(${COLORS.hidden.join(',')})`;  ctx.fillText('HIDDEN', pos[n_input].x - 24, 14)
      ctx.fillStyle = `rgb(${COLORS.output.join(',')})`;  ctx.fillText('OUTPUT', pos[n_input + n_hidden].x - 24, 14)
      ctx.globalAlpha = 1
    }

    render()
    return () => cancelAnimationFrame(animId)
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
