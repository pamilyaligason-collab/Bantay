import { useEffect, useRef, useState, type RefObject } from 'react'

export type SwipeDir = 'left' | 'right' | null

/** Horizontal swipe if far enough and clearly more sideways than vertical. */
export function swipeDir(dx: number, dy: number, threshold = 56): SwipeDir {
  if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.5) return null
  return dx < 0 ? 'left' : 'right'
}

/** Starts this close to either screen edge belong to the OS (back / home gestures), so tab swipes ignore them. */
export const OS_EDGE = 24
const NO_SWIPE = '.u-over, [data-no-swipe], .hscroll, input, textarea, canvas, select'

export interface SwipeOpts {
  onLeft?: () => void
  onRight?: () => void
  /** Back-swipe mode: the start must be in the strip just inside the OS edge (OS_EDGE to OS_EDGE + edge px). */
  edge?: number
}

/** Touch-only swipe on pointer events. Attach `ref` to the area. Mouse, pen and multi-touch never swipe. */
export function useSwipe<T extends HTMLElement = HTMLElement>(opts: SwipeOpts) {
  const ref = useRef<T>(null)
  const o = useRef(opts)
  o.current = opts
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let start: { id: number; x: number; y: number } | null = null
    const down = (e: PointerEvent) => {
      start = null
      if (e.pointerType !== 'touch' || !e.isPrimary) return
      if ((e.target as Element).closest?.(NO_SWIPE)) return
      const r = el.getBoundingClientRect()
      const x = e.clientX - r.left
      const edge = o.current.edge
      if (x < OS_EDGE || x > r.width - OS_EDGE) return
      if (edge !== undefined && x > OS_EDGE + edge) return
      start = { id: e.pointerId, x: e.clientX, y: e.clientY }
    }
    const up = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return
      const d = swipeDir(e.clientX - start.x, e.clientY - start.y)
      start = null
      if (d === 'left') o.current.onLeft?.()
      else if (d === 'right') o.current.onRight?.()
    }
    const cancel = () => { start = null }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', cancel)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', cancel)
    }
  }, [])
  return ref
}

/** Back-swipe for detail screens: swipe right starting just inside the left OS edge. */
export const useBackSwipe = <T extends HTMLElement = HTMLElement>(onBack: () => void) => useSwipe<T>({ onRight: onBack, edge: 32 })

export const PULL_THRESHOLD = 64
/** Rubber-band distance for a raw drag. */
export const damp = (dy: number) => Math.min(dy * 0.5, PULL_THRESHOLD * 1.5)

const IND_H = 36
const place = (n: HTMLElement | null, px: number, animate: boolean) => {
  if (!n) return
  n.dataset.on = String(animate)
  n.style.opacity = px > 0 ? '1' : '0'
  n.style.transform = `translate3d(0, ${px - IND_H}px, 0)`
}

/**
 * Pull-to-refresh. Attach `ref` to the scroll container (position: relative) and render
 * <PullIndicator indicator={indicator} refreshing={refreshing} armed={armed} /> inside it.
 * The indicator follows the finger through a ref + transform; React state changes only on threshold cross and release.
 */
export function usePullToRefresh<T extends HTMLElement = HTMLElement>(onRefresh: () => unknown, enabled = true) {
  const ref = useRef<T>(null)
  const indicator = useRef<HTMLDivElement>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [armed, setArmed] = useState(false)
  const cb = useRef(onRefresh)
  cb.current = onRefresh
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    let y0: number | null = null
    let p = 0
    let isArmed = false
    let busy = false
    const reset = () => { y0 = null; p = 0; if (isArmed) { isArmed = false; setArmed(false) } }
    const ts = (e: TouchEvent) => { y0 = el.scrollTop <= 0 && !busy && e.touches.length === 1 ? e.touches[0].clientY : null }
    const tm = (e: TouchEvent) => {
      if (y0 === null) return
      if (el.scrollTop > 0) { reset(); place(indicator.current, 0, true); return }
      p = e.touches[0].clientY > y0 ? damp(e.touches[0].clientY - y0) : 0
      place(indicator.current, p, false)
      const a = p >= PULL_THRESHOLD
      if (a !== isArmed) { isArmed = a; setArmed(a) }
    }
    const te = async () => {
      const fire = y0 !== null && p >= PULL_THRESHOLD
      reset()
      if (!fire) { place(indicator.current, 0, true); return }
      busy = true
      setRefreshing(true)
      place(indicator.current, IND_H, true)
      try { await cb.current() } finally {
        busy = false
        setRefreshing(false)
        place(indicator.current, 0, true)
      }
    }
    el.addEventListener('touchstart', ts, { passive: true })
    el.addEventListener('touchmove', tm, { passive: true })
    el.addEventListener('touchend', te)
    el.addEventListener('touchcancel', te)
    return () => {
      el.removeEventListener('touchstart', ts)
      el.removeEventListener('touchmove', tm)
      el.removeEventListener('touchend', te)
      el.removeEventListener('touchcancel', te)
    }
  }, [enabled])
  return { ref, indicator, refreshing, armed }
}

export function PullIndicator({ indicator, refreshing, armed }: { indicator: RefObject<HTMLDivElement | null>; refreshing: boolean; armed: boolean }) {
  return (
    <div className="ptr" ref={indicator} role="status" aria-live={refreshing ? 'polite' : 'off'}>
      {refreshing ? 'Refreshing' : armed ? 'Release to refresh' : 'Pull to refresh'}
    </div>
  )
}
