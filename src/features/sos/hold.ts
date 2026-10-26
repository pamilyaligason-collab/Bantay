import { useCallback, useEffect, useRef, useState } from 'react'

export const HOLD_MS = 3000

/** Press-and-hold. `holding` drives the progress ring; `onDone` fires once after `ms` of unbroken press.
 *  Releasing, leaving the button or an interrupted touch cancels. `left` = whole seconds still to hold (3, 2, 1) while holding. */
export function useHold(onDone: () => void, ms = HOLD_MS) {
  const [holding, setHolding] = useState(false)
  const [left, setLeft] = useState(Math.ceil(ms / 1000))
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tick = useRef<ReturnType<typeof setInterval> | null>(null)
  const done = useRef(onDone)
  done.current = onDone
  const stopTick = () => { if (tick.current) clearInterval(tick.current); tick.current = null }
  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    stopTick()
    setHolding(false)
  }, [])
  const start = useCallback(() => {
    if (timer.current) return
    const t0 = Date.now()
    setHolding(true)
    setLeft(Math.ceil(ms / 1000))
    tick.current = setInterval(() => setLeft(Math.max(1, Math.ceil((ms - (Date.now() - t0)) / 1000))), 200)
    timer.current = setTimeout(() => { timer.current = null; stopTick(); setHolding(false); done.current() }, ms)
  }, [ms])
  useEffect(() => cancel, [cancel])
  return { holding, left, start, cancel }
}
