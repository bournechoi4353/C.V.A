import { useStore } from '../store'

// Transient notification (e.g. a timer firing).
export default function Toast() {
  const toast = useStore((s) => s.toast)
  if (!toast) return null
  return <div className="toast">{toast}</div>
}
