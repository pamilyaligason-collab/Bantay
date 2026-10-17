import { useEffect, useState } from 'react'

export type SkyState = 'storm' | 'rain' | 'clear' | 'heat'

/** Animated weather backdrop. Pauses while the page is hidden; static under prefers-reduced-motion (CSS). */
export function Sky({ state = 'clear' }: { state?: SkyState }) {
  const [paused, setPaused] = useState(document.hidden)
  useEffect(() => {
    const on = () => setPaused(document.hidden)
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])
  return <div className="sky" data-state={state} data-paused={paused} aria-hidden="true" />
}
