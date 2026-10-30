import { useEffect, useRef } from 'react'
import { loadGsap } from './gsap'
import { useReducedMotion } from './useReducedMotion'

/** Check mark that draws itself (C-10): the ring then the tick, stroke-dashoffset over 600 ms (no DrawSVG plugin). `onDone` fires once when drawn,
 *  at once under reduced motion (the tick is simply there). Success is this OR Jack, never both (D-103 rule 8). */
export function CheckDraw({ size = 56, onDone }: { size?: number; onDone?: () => void }) {
  const reduced = useReducedMotion()
  const ring = useRef<SVGCircleElement>(null)
  const tick = useRef<SVGPathElement>(null)
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => {
    const fire = () => done.current?.()
    const r = ring.current, t = tick.current
    if (reduced || !r || !t || typeof r.getTotalLength !== 'function') { fire(); return }
    const [lr, lt] = [r.getTotalLength(), t.getTotalLength()]
    r.style.strokeDasharray = `${lr}`; r.style.strokeDashoffset = `${lr}`
    t.style.strokeDasharray = `${lt}`; t.style.strokeDashoffset = `${lt}`
    let dead = false
    let tl: { kill: () => void } | undefined
    loadGsap().then((g) => {
      if (dead) return
      tl = g.timeline({ onComplete: fire })
        .to(r, { strokeDashoffset: 0, duration: 0.35, ease: 'power2.out' })
        .to(t, { strokeDashoffset: 0, duration: 0.25, ease: 'power2.out' }, '-=0.05')
    }).catch(() => { r.style.strokeDashoffset = '0'; t.style.strokeDashoffset = '0'; fire() })
    return () => { dead = true; tl?.kill(); r.style.strokeDashoffset = '0'; t.style.strokeDashoffset = '0' }
  }, [reduced])
  return (
    <svg className="cd" width={size} height={size} viewBox="0 0 56 56" aria-hidden="true" focusable="false">
      <circle ref={ring} cx="28" cy="28" r="26" fill="none" stroke="var(--green2)" strokeWidth="3" />
      <path d="M16 29l8 8 16-17" ref={tick} fill="none" stroke="var(--green2)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
