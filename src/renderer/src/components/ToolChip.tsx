import { useStore } from '../store'

// Small pill that shows what tool CVA is using ("Searching the web…").
export default function ToolChip() {
  const activity = useStore((s) => s.toolActivity)
  if (!activity) return null
  return (
    <div className="toolchip">
      <span className="toolchip__spinner" />
      {activity}
    </div>
  )
}
