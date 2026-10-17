import { useEffect, useRef, useState } from 'react'

export type SwipeDir = 'left' | 'right' | null

/** Horizontal swipe if far enough and clearly more sideways than vertical. */
export function swipeDir(dx: number, dy: number, threshold = 56): SwipeDir {
  if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.5) return null
  return dx < 0 ? 'left' : 'right'
}

export interface SwipeOpts { onLeft?: () => void; onRight?: () => void; edge?: number }

/** Pointer-event swipe. `edge` limits the start to that many px from the left edge (back-swipe). Attach `ref` to the area. */
export function useSwipe<T extends HTMLElement = HTMLElement>(opts: SwipeOpts) {
  const ref = useRef<T>(null)
  const o = useRef(opts)
  o.current = opts
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let start: { x: number; y: number } | null = null
    const down = (e: PointerEvent) => {
      const edge = o.current.edge
      const skip = (e.target as Element).closest?.('[data-no-swipe], input, textarea, canvas, select')
      start = skip || (edge !== undefined && e.clientX - el.getBoundingClientRect().left > edge) ? null : { x: e.clientX, y: e.clientY }
    }
    const up = (e: PointerEvent) => {
      if (!start) return
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

/** Back-swipe for detail screens: swipe right starting at the left edge. */
export const useBackSwipe = <T extends HTMLElement = HTMLElement>(onBack: () => void) => useSwipe<T>({ onRight: onBack, edge: 28 })

export const PULL_THRESHOLD = 64
/** Rubber-band distance for a raw drag. */
export const damp = (dy: number) => Math.min(dy * 0.5, PULL_THRESHOLD * 1.5)

/** Pull-to-refresh. Attach `ref` to the scroll container; render <PullIndicator pull refreshing /> inside it. */
export function usePullToRefresh<T extends HTMLElement = HTMLElement>(onRefresh: () => unknown, enabled = true) {
  const ref = useRef<T>(null)
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const cb = useRef(onRefresh)
  cb.current = onRefresh
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    let y0: number | null = null
    let p = 0
    const ts = (e: TouchEvent) => { y0 = el.scrollTop <= 0 ? e.touches[0].clientY : null }
    const tm = (e: TouchEvent) => {
      if (y0 === null) return
      p = e.touches[0].clientY > y0 ? damp(e.touches[0].clientY - y0) : 0
      setPull(p)
    }
    const te = async () => {
      const fire = y0 !== null && p >= PULL_THRESHOLD
      y0 = null; p = 0; setPull(0)
      if (!fire) return
      setRefreshing(true)
      try { await cb.current() } finally { setRefreshing(false) }
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
  return { ref, pull, refreshing }
}

export function PullIndicator({ pull, refreshing }: { pull: number; refreshing: boolean }) {
  return (
    <div className="ptr" style={{ height: refreshing ? 36 : pull }} role="status" aria-live="polite">
      {refreshing ? 'Refreshing' : pull >= PULL_THRESHOLD ? 'Release to refresh' : pull > 0 ? 'Pull to refresh' : ''}
    </div>
  )
}
