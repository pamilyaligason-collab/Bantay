import { db } from '../../../db'
import facts from '../../../data/play/ph-facts.json'
import { dayKey, rng, seedOf, shuffle } from '../play/score'

/** Wikipedia "On this day" (REST feed). Text is CC BY-SA 4.0: every card shows the credit and a link. */
export const WIKI_CREDIT = 'From Wikipedia, text CC BY-SA 4.0.'
export const WIKI_LICENCE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/'
export interface OtdEvent { year: number; text: string; url: string | null }
interface Cache { day: string; items: OtdEvent[] }
const KEY = 'facts.otd'
const SHOW = 3

/** One Philippine fact for the day, from the bundled list (works offline). */
export const phFactIndex = (day: string): number => seedOf(day) % facts.facts.length
export const phFactOf = (day: string): string => facts.facts[phFactIndex(day)]!

type Raw = { year?: unknown; text?: unknown; pages?: { content_urls?: { desktop?: { page?: unknown } } }[] }
/** Three short events for the day, the same three all day (seeded by the day), oldest first. Keeps only the year, the text and a Wikipedia link. */
export function pick(raw: Raw[], day: string): OtdEvent[] {
  const ok = raw.flatMap((e) => {
    const url = e.pages?.[0]?.content_urls?.desktop?.page
    return typeof e.year === 'number' && typeof e.text === 'string' && e.text.length <= 200
      ? [{ year: e.year, text: e.text, url: typeof url === 'string' && /^https:\/\/(?:[a-z]+\.)?wikipedia\.org\//.test(url) ? url : null }]
      : []
  })
  return shuffle(ok, rng(seedOf(day))).slice(0, SHOW).sort((a, b) => a.year - b.year)
}

/** Today's events. Cached per day in kv: the second call on the same day makes 0 requests. Offline, yesterday's cards are returned (`stale`). null = nothing saved and no signal. */
export async function loadOnThisDay(now: Date = new Date(), f: typeof fetch = fetch): Promise<{ items: OtdEvent[]; stale: boolean } | null> {
  const day = dayKey(now)
  const old = ((await db.kv.get(KEY).catch(() => undefined))?.value as Cache | undefined) ?? null
  if (old && old.day === day && old.items.length) return { items: old.items, stale: false }
  try {
    const res = await f(`https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) throw new Error(String(res.status))
    const items = pick(((await res.json()) as { events?: Raw[] }).events ?? [], day)
    if (!items.length) throw new Error('empty')
    await db.kv.put({ key: KEY, value: { day, items } satisfies Cache }).catch(() => undefined)
    return { items, stale: false }
  } catch {
    return old?.items.length ? { items: old.items, stale: true } : null
  }
}
