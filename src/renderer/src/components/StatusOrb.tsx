import { useEffect, useRef } from 'react'
import { useStore, type Status } from '../store'
import { getLevel } from '../level'

// RGB per state — desaturated, instrument-panel hues (match styles.css vars).
const COLORS: Record<Status, [number, number, number]> = {
  idle: [140, 136, 126], // neutral warm gray
  listening: [217, 164, 65], // amber
  thinking: [217, 119, 87], // terracotta
  speaking: [127, 181, 130], // sage green
}

const SIZE = 300

// A radial instrument gauge: a ring of fine ticks whose lengths ripple with the live
// audio level (mic while listening / TTS while speaking), a hairline inner circle, a
// small solid core, and one slow rotating arc. Precision over bloom — no glow blobs.
export default function StatusOrb() {
  const status = useStore((s) => s.status)
  const statusRef = useRef<Status>(status)
  statusRef.current = status
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = SIZE * dpr
    canvas.height = SIZE * dpr
    ctx.scale(dpr, dpr)
    const cx = SIZE / 2
    const cy = SIZE / 2

    const TICKS = 72
    const R_INNER = 64 // hairline circle
    const R_TICK = 84 // tick ring base radius
    const TICK_MAX = 44 // max reactive tick length

    let raf = 0
    let t = 0
    let smooth = 0
    // Per-tick smoothed energy so the ring ripples instead of jittering.
    const tickEnergy = new Float32Array(TICKS)

    const draw = () => {
      t += 0.016
      const st = statusRef.current
      const [r, g, b] = COLORS[st]
      const active = st !== 'idle'

      let target = getLevel()
      if (st === 'thinking') target = 0.3 + 0.3 * (0.5 + 0.5 * Math.sin(t * 5))
      else if (st === 'idle') target = Math.max(getLevel(), 0.07 + 0.04 * Math.sin(t * 1.4))
      smooth += (target - smooth) * 0.2

      ctx.clearRect(0, 0, SIZE, SIZE)

      // tick ring — each tick's length ripples around the circle with the level
      for (let i = 0; i < TICKS; i++) {
        const a = (i / TICKS) * Math.PI * 2 - Math.PI / 2
        const wave =
          0.5 +
          0.3 * Math.sin(a * 5 + t * (active ? 3.2 : 1.1)) +
          0.2 * Math.sin(a * 9 - t * (active ? 2.1 : 0.7))
        const targetLen = 3 + smooth * TICK_MAX * Math.max(0, wave)
        tickEnergy[i] += (targetLen - tickEnergy[i]) * 0.3
        const len = tickEnergy[i]

        const x0 = cx + Math.cos(a) * R_TICK
        const y0 = cy + Math.sin(a) * R_TICK
        const x1 = cx + Math.cos(a) * (R_TICK + len)
        const y1 = cy + Math.sin(a) * (R_TICK + len)
        const alpha = 0.22 + Math.min(0.6, (len / TICK_MAX) * 0.85)
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.lineTo(x1, y1)
        ctx.stroke()
      }

      // hairline inner circle
      ctx.strokeStyle = `rgba(${r},${g},${b},0.28)`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(cx, cy, R_INNER, 0, Math.PI * 2)
      ctx.stroke()

      // solid core — small, breathes with the level
      const coreR = 9 + smooth * 14
      ctx.fillStyle = `rgba(${r},${g},${b},0.95)`
      ctx.beginPath()
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2)
      ctx.fill()

      // one slow rotating arc + a short counter-arc, just outside the ticks
      ctx.strokeStyle = `rgba(${r},${g},${b},0.4)`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(cx, cy, 142, t * 0.3, t * 0.3 + Math.PI * 0.38)
      ctx.stroke()
      ctx.strokeStyle = `rgba(${r},${g},${b},0.22)`
      ctx.beginPath()
      ctx.arc(cx, cy, 147, -t * 0.18, -t * 0.18 + Math.PI * 0.16)
      ctx.stroke()

      raf = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(raf)
  }, [])

  return <canvas ref={canvasRef} className="orb-canvas" style={{ width: SIZE, height: SIZE }} />
}
