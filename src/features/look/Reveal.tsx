/* Pattern from React Bits AnimatedContent: reveal once on scroll into view. WAAPI, no deps. */
import { useEffect, useRef, type ReactNode } from 'react'
import { prefersReducedMotion } from './useReducedMotion'

export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || prefersReducedMotion() || typeof IntersectionObserver !== 'function' || typeof el.animate !== 'function') return
    const io = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return
      io.disconnect()
      el.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
        { duration: 240, delay, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'backwards' })
    }, { threshold: 0.15 })
    io.observe(el)
    return () => io.disconnect()
  }, [delay])
  return <div ref={ref} className={className}>{children}</div>
}
