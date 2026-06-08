import { useEffect, useState } from 'react'

export default function ClockWidget() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const time = now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const date = now.toLocaleDateString([], {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })

  return (
    <div className="clock">
      <div className="clock__time">{time}</div>
      <div className="clock__date">{date}</div>
    </div>
  )
}
