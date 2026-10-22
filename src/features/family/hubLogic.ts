import data from './hub.json'
import { videoOfTheDay } from '../today/videos'
import { VIDEO_ID } from '../health/library/videosLogic'
import type { IconName } from '../shell/Icon'

/** Learning hub rotation (session 8). One card per category; the item inside a category and the card order change each morning (same pick all day, like videoOfTheDay). */
export interface HubItem { id: string; kind: 'video' | 'link'; title: string; blurb: string; credit: string; videoId?: string; url?: string; read?: string }
export interface HubCategory { id: string; label: string; icon: IconName; items: HubItem[] }
export const HUB = data.categories as HubCategory[]
export type Size = 'feat' | 'sm' | 'wide'
export const SLOTS: Size[] = ['feat', 'sm', 'sm', 'wide'] // mixed sizes, not an equal grid

const dayNumber = (d: Date) => Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 86_400_000)
/** Only https links and videos with a real id are shown. */
export const usable = (i: HubItem) => (i.kind === 'video' ? VIDEO_ID.test(i.videoId ?? '') : /^https:\/\//.test(i.url ?? ''))

export interface HubCard { size: Size; category: HubCategory; item: HubItem }
export function featured(now: Date, cats: HubCategory[] = HUB): HubCard[] {
  const live = cats.map((c) => ({ ...c, items: c.items.filter(usable) })).filter((c) => c.items.length > 0)
  if (!live.length) return []
  const start = dayNumber(now) % live.length
  const picks = live.map((_, n) => {
    const category = live[(start + n) % live.length]!
    return { category, item: videoOfTheDay(now, category.items) }
  })
  const v = picks.findIndex((p) => p.item.kind === 'video')
  if (v > 0) picks.unshift(picks.splice(v, 1)[0]!) // a video leads the featured slot
  return picks.map((p, n) => ({ size: SLOTS[n] ?? 'wide', ...p }))
}
