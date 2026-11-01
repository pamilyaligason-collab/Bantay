import { videoOfTheDay } from '../../today/videos'

/** The video of the day plus the next two in list order (wrapping), never the hero twice. */
export function featured<T>(now: Date, list: T[]): { hero: T | null; more: T[] } {
  if (!list.length) return { hero: null, more: [] }
  const hero = videoOfTheDay(now, list)
  const i = list.indexOf(hero)
  const more = Array.from({ length: Math.min(2, list.length - 1) }, (_, k) => list[(i + 1 + k) % list.length]!)
  return { hero, more }
}
