/*
 * Adapted from React Bits CountUp (https://reactbits.dev), MIT + Commons Clause.
 * Changes: no framer-motion; GSAP loads lazily; reduced motion renders the final value.
 */
import { useEffect, useRef } from 'react'
import { countTo, formatCount } from './motion'
import { prefersReducedMotion } from './useReducedMotion'

type Props = { to: number | null | undefined; from?: number; decimals?: number; duration?: number; className?: string }

/** Unknown (null/NaN) renders an en dash, never 0. */
export function CountUp({ to, from = 0, decimals = 0, duration, className }: Props) {
  const ref = useRef<HTMLSpanElement>(null)
  const ok = typeof to === 'number' && Number.isFinite(to)
  const latest = useRef({ to, from, decimals, duration, ok })
  latest.current = { to, from, decimals, duration, ok }
  // first mount only: later value changes render straight through React, never a stale or restarted count
  useEffect(() => {
    const { to, from, decimals, duration, ok } = latest.current
    const el = ref.current
    if (!el || !ok || prefersReducedMotion() || typeof IntersectionObserver !== 'function') return
    let stop = () => {}
    const io = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return
      io.disconnect()
      stop = countTo(el, to as number, { from, decimals, duration })
    })
    io.observe(el)
    return () => { io.disconnect(); stop() }
  }, [])
  return <span ref={ref} className={className}>{ok ? formatCount(to as number, decimals) : '–'}</span>
}
