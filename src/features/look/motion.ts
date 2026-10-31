import { useEffect, useState, useSyncExternalStore, type RefObject } from 'react'
import { loadGsap } from './gsap'
import { prefersReducedMotion as reduced } from './useReducedMotion'

// ---- S16 L9: one place that says whether decorative motion may run ----
let sosOpen = false
const sosSubs = new Set<() => void>()
/** SosScreen sets this on mount and clears it on unmount (all four mounts). While true no scene animates and no canvas mounts (D-91, M2-3). */
export const setSosScreenOpen = (open: boolean) => { if (open !== sosOpen) { sosOpen = open; sosSubs.forEach((f) => f()) } }
export const useSosScreenOpen = () => useSyncExternalStore((cb) => { sosSubs.add(cb); return () => { sosSubs.delete(cb) } }, () => sosOpen, () => false)

/** Decorative motion may run right now: reduced motion off, page visible, no SOS screen. */
export const motionOk = () => !reduced() && !(typeof document !== 'undefined' && document.hidden) && !sosOpen

const hashSub = (cb: () => void) => { addEventListener('hashchange', cb); return () => removeEventListener('hashchange', cb) }
/** true on `#safety*`: no scene animation and no canvas there. */
export const useSafetyHash = () => useSyncExternalStore(hashSub, () => location.hash.startsWith('#safety'), () => false)

/** true on Today (empty hash or #today); re-renders on hashchange so a canvas never keeps running after a move to Today. */
export const useTodayHash = () => useSyncExternalStore(hashSub, () => /^#?(today)?$/.test(location.hash), () => true)

const visSub = (cb: () => void) => { document.addEventListener('visibilitychange', cb); return () => document.removeEventListener('visibilitychange', cb) }
export const usePageVisible = () => useSyncExternalStore(visSub, () => !document.hidden, () => true)

/** true while the element is on screen; true when IntersectionObserver is missing (never pause by mistake). */
export function useOnScreen(ref: RefObject<Element | null>): boolean {
  const [on, setOn] = useState(true)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver !== 'function') return
    const io = new IntersectionObserver((es) => { const e = es[es.length - 1]; if (e) setOn(e.isIntersecting) })
    io.observe(el)
    return () => io.disconnect()
  }, [ref])
  return on
}

/** WebGL2 present and the phone is not low-end (hardwareConcurrency >= 4, deviceMemory >= 4 when known). Aurora gate (D-99). */
export function webgl2Capable(): boolean {
  if (typeof document === 'undefined') return false
  const nav = navigator as Navigator & { deviceMemory?: number }
  if ((nav.hardwareConcurrency ?? 0) < 4) return false
  if (nav.deviceMemory != null && nav.deviceMemory < 4) return false
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    gl?.getExtension('WEBGL_lose_context')?.loseContext() // release the throwaway context
    return !!gl
  } catch { return false }
}

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
