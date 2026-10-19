import { useCallback, useEffect, useRef, useState } from 'react'

export const HOLD_MS = 3000

/** Press-and-hold. `holding` drives the progress ring; `onDone` fires once after `ms` of unbroken press.
 *  Releasing, leaving the button or an interrupted touch cancels. */
export function useHold(onDone: () => void, ms = HOLD_MS) {
  const [holding, setHolding] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const done = useRef(onDone)
  done.current = onDone
  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setHolding(false)
  }, [])
  const start = useCallback(() => {
    if (timer.current) return
    setHolding(true)
    timer.current = setTimeout(() => { timer.current = null; setHolding(false); done.current() }, ms)
  }, [ms])
  useEffect(() => cancel, [cancel])
  return { holding, start, cancel }
}
