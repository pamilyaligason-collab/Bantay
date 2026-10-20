import { useEffect, type RefObject } from 'react'
import { db } from '../../db'
import { track } from '../admin/events'

export type SeenCard = 'card_seen_my_week' | 'card_seen_family_line'
const dayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`

/** Records `name` once per day, the first time the element is in view. `on` false (nothing drawn yet) waits. No IntersectionObserver (tests, old webviews): nothing is sent. */
export function useSeenDaily(ref: RefObject<Element | null>, name: SeenCard, on: boolean): void {
  useEffect(() => {
    const el = ref.current
    if (!on || !el || typeof IntersectionObserver === 'undefined') return
    const key = `seen.${name}`
    let live = true
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      io.disconnect()
      void (async () => {
        try {
          if ((await db.kv.get(key))?.value === dayKey()) return
          const day = dayKey()
          if (live && (await track('action', name))) await db.kv.put({ key, value: day }) // only a queued event counts as seen: signed out or blocked tracking tries again later
        } catch { /* storage blocked: skip rather than send on every visit */ }
      })()
    }, { threshold: 0.5 })
    io.observe(el)
    return () => { live = false; io.disconnect() }
  }, [ref, name, on])
}
