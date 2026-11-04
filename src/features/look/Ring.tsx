import { useEffect, useRef } from 'react'
import type { Hue } from './cardParts'
import { prefersReducedMotion } from './useReducedMotion'

/** Circumference and the filled length for a 0..1 value (NaN and out-of-range clamp). */
export function ringDash(value: number, size: number, stroke = 3) {
  const v = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
  const len = 2 * Math.PI * (size / 2 - stroke)
  return { v, len, fill: len * v }
}

/** Progress ring, 0..1 (C-10). The attribute always holds the final length; the draw-in (600 ms, from the old value) is a Web Animation on top, skipped under reduced motion.
 *  `label` makes it a named image; without it the value must be visible text beside it (ML-40). */
export function Ring({ value, size = 28, hue = 'green', label, stroke = 3 }: { value: number; size?: 20 | 28 | 40 | 64; hue?: Hue; label?: string; stroke?: number }) {
  const { v, len, fill } = ringDash(value, size, stroke)
  const r = size / 2 - stroke
  const arc = useRef<SVGCircleElement>(null)
  const was = useRef(0)
  useEffect(() => {
    const el = arc.current
    const from = was.current * len
    was.current = v
    if (!el || prefersReducedMotion() || typeof el.animate !== 'function' || from === fill) return
    el.animate([{ strokeDasharray: `${from} ${len}` }, { strokeDasharray: `${fill} ${len}` }], { duration: 600, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' })
  }, [v, len, fill])
  const a11y = label ? { role: 'img' as const, 'aria-label': label } : { 'aria-hidden': true as const }
  return (
    <svg className="rg" data-hue={hue} width={size} height={size} viewBox={`0 0 ${size} ${size}`} focusable="false" {...a11y}>
      <circle className="rg-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
      <circle ref={arc} className="rg-val" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${fill} ${len}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  )
}
