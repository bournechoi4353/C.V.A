import { useStore } from '../store'

// CSS-driven orb. Each status gets its own animation/glow via the modifier class.
// In Phase 2/3 this will react to live mic/output audio amplitude.
export default function StatusOrb() {
  const status = useStore((s) => s.status)

  return (
    <div className={`orb orb--${status}`}>
      <div className="orb__ring orb__ring--outer" />
      <div className="orb__ring orb__ring--inner" />
      <div className="orb__core" />
    </div>
  )
}
