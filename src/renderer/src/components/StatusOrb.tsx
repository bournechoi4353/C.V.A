import { useEffect, useRef } from 'react'
import { useStore, type Status } from '../store'
import { getLevel } from '../level'

// RGB per state — the orb's whole palette shifts with what CVA is doing.
const COLORS: Record<Status, [number, number, number]> = {
  idle: [56, 225, 255], // cyan (calm)
  listening: [255, 184, 77], // amber
  thinking: [56, 225, 255], // cyan (active pulse)
  speaking: [125, 255, 176], // green
}

const SIZE = 300

// A canvas "arc reactor": glowing core that grows with amplitude, a reactive
// waveform ring, and rotating arcs. Reads the live level each frame (set by the
// mic when listening / by TTS when speaking); synthesizes a pulse when thinking.
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

    let raf = 0
    let t = 0
    let smooth = 0

    const draw = () => {
      t += 0.016
      const st = statusRef.current
      const [r, g, b] = COLORS[st]
      const active = st !== 'idle'

      // Target amplitude: real audio level, or a synthetic pulse while thinking,
      // or a gentle idle breath.
      let target = getLevel()
      if (st === 'thinking') target = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(t * 5))
      // Idle: gentle breath, but react to live mic level (e.g. while wake-listening).
      else if (st === 'idle') target = Math.max(getLevel(), 0.12 + 0.06 * Math.sin(t * 1.5))
      smooth += (target - smooth) * 0.2

      ctx.clearRect(0, 0, SIZE, SIZE)

      // outer glow
      const coreR = 34 + smooth * 34
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.2)
      glow.addColorStop(0, `rgba(${r},${g},${b},0.9)`)
      glow.addColorStop(0.5, `rgba(${r},${g},${b},0.35)`)
      glow.addColorStop(1, `rgba(${r},${g},${b},0)`)
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(cx, cy, coreR * 2.2, 0, Math.PI * 2)
      ctx.fill()

      // solid core
      ctx.fillStyle = `rgba(${r},${g},${b},0.92)`
      ctx.beginPath()
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      ctx.beginPath()
      ctx.arc(cx - coreR * 0.25, cy - coreR * 0.28, coreR * 0.45, 0, Math.PI * 2)
      ctx.fill()

      // reactive waveform ring
      const baseR = 92
      const pts = 120
      ctx.beginPath()
      for (let i = 0; i <= pts; i++) {
        const a = (i / pts) * Math.PI * 2
        const wob = (Math.sin(a * 6 + t * 3) * 4 + Math.sin(a * 11 - t * 2) * 3) * (active ? 1 : 0.3)
        const rr = baseR + smooth * 42 * (0.55 + 0.45 * Math.sin(a * 8 + t * 4)) + wob
        const x = cx + Math.cos(a) * rr
        const y = cy + Math.sin(a) * rr
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.strokeStyle = `rgba(${r},${g},${b},0.65)`
      ctx.lineWidth = 2
      ctx.stroke()

      // rotating outer arcs
      for (let k = 0; k < 3; k++) {
        const rr = 116 + k * 12
        const dir = k % 2 ? -1 : 1
        const start = t * dir * (0.35 + k * 0.15)
        ctx.strokeStyle = `rgba(${r},${g},${b},${0.3 - k * 0.06})`
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(cx, cy, rr, start, start + Math.PI * (0.5 - k * 0.08))
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(cx, cy, rr, start + Math.PI, start + Math.PI + Math.PI * 0.35)
        ctx.stroke()
      }

      raf = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(raf)
  }, [])

  return <canvas ref={canvasRef} className="orb-canvas" style={{ width: SIZE, height: SIZE }} />
}
