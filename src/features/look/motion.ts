import { loadGsap } from './gsap'
import { prefersReducedMotion as reduced } from './useReducedMotion'

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'

/** Tab entrance via WAAPI. dir: +1 coming from the right, -1 from the left. No-op when reduced or unsupported. */
export function springIn(el: HTMLElement, dir: number) {
  if (reduced() || typeof el.animate !== 'function') return
  el.animate(
    [{ opacity: 0, transform: `translateX(${dir * 12}px)` }, { opacity: 1, transform: 'none' }],
    { duration: 220, easing: EASE_OUT }
  )
}

export const formatCount = (n: number, decimals = 0) =>
  n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

/** Count el's text from `from` to `to`. Reduced motion or any failure: final value at once. Returns a stop fn. */
export function countTo(el: HTMLElement, to: number, o: { from?: number; decimals?: number; duration?: number } = {}) {
  const set = (n: number) => { el.textContent = formatCount(n, o.decimals ?? 0) }
  if (!Number.isFinite(to)) return () => {}
  set(to)
  if (reduced()) return () => {}
  let stopped = false
  let tween: { kill: () => void } | undefined
  const from = Number.isFinite(o.from) ? (o.from as number) : 0
  set(from)
  loadGsap().then(g => {
    if (stopped) return
    const s = { v: from }
    tween = g.to(s, { v: to, duration: o.duration ?? 0.9, ease: 'power3.out', onUpdate: () => set(s.v), onComplete: () => set(to) })
  }).catch(() => set(to))
  return () => { stopped = true; tween?.kill(); set(to) }
}

const counted = new Set<string>()

/**
 * One call to adopt motion. [data-reveal] fades/slides in once (8px, 240ms, 40ms stagger);
 * [data-count="12.5"] counts up once per mount (data-decimals optional; data-count-key
 * remembers it across remounts). Reduced motion: complete no-op. Returns cleanup.
 * Counted text is rewritten by the script; keep it on elements React does not re-render.
 */
export function wireMotion(root: ParentNode | null): () => void {
  if (!root || reduced() || typeof IntersectionObserver !== 'function') return () => {}
  const stops: Array<() => void> = []
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue
      io.unobserve(e.target)
      const el = e.target as HTMLElement
      if ('reveal' in el.dataset) {
        el.style.opacity = '' // hidden since observe; the animation's backwards fill takes over in the same frame, so no flash
        const i = Number(el.dataset.revealIndex)
        el.animate?.(
          [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
          { duration: 240, delay: Math.min(Number.isFinite(i) ? i : 0, 8) * 40, easing: EASE_OUT, fill: 'backwards' }
        )
      }
      if (el.dataset.count) {
        const key = el.dataset.countKey
        if (key && counted.has(key)) continue
        if (key) counted.add(key)
        stops.push(countTo(el, Number(el.dataset.count), { decimals: Number(el.dataset.decimals) || 0 }))
      }
    }
  }, { threshold: 0.15 })
  root.querySelectorAll<HTMLElement>('[data-reveal],[data-count]').forEach((el, i) => {
    if ('reveal' in el.dataset) { el.dataset.revealIndex = String(i); el.style.opacity = '0' }
    io.observe(el)
  })
  // never leave a section hidden if we stop watching before it was seen
  return () => { io.disconnect(); stops.forEach(s => s()); root.querySelectorAll<HTMLElement>('[data-reveal]').forEach(el => { el.style.opacity = '' }) }
}
