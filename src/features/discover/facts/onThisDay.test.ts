import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../../db'
import { loadOnThisDay, phFactOf, pick, WIKI_CREDIT } from './onThisDay'

const ev = (year: number, text: string, page: string | null = `https://en.wikipedia.org/wiki/E${year}`) => ({ year, text, pages: page ? [{ content_urls: { desktop: { page } } }] : [] })
const EVENTS = [ev(1881, 'Gunfight at the O.K. Corral.'), ev(1492, 'Columbus lands.'), ev(1999, 'A thing happens.'), ev(1650, 'Another thing.'), ev(1776, 'More.')]
const feed = (events = EVENTS) => vi.fn(async () => new Response(JSON.stringify({ events }), { status: 200 })) as unknown as typeof fetch
beforeEach(async () => { await db.kv.clear() })

describe('On this day', () => {
  it('first call fetches the REST feed for that month and day; a second call the same day makes 0 fetches', async () => {
    const f = feed()
    const day = new Date(2026, 9, 28, 9, 0)
    const a = await loadOnThisDay(day, f)
    expect(f).toHaveBeenCalledTimes(1)
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe('https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/10/28')
    expect(a!.items).toHaveLength(3); expect(a!.stale).toBe(false)
    const b = await loadOnThisDay(new Date(2026, 9, 28, 21, 30), f)
    expect(f).toHaveBeenCalledTimes(1) // still 1: 0 fetches for the second call
    expect(b!.items).toEqual(a!.items)
  })
  it('the next day fetches again; with no signal, yesterday\'s cards come back marked stale; with nothing saved it is null', async () => {
    const f = feed()
    await loadOnThisDay(new Date(2026, 9, 28), f)
    const down = vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch
    const r = await loadOnThisDay(new Date(2026, 9, 29), down)
    expect(down).toHaveBeenCalledTimes(1)
    expect(r!.stale).toBe(true); expect(r!.items).toHaveLength(3)
    await db.kv.clear()
    expect(await loadOnThisDay(new Date(2026, 9, 29), down)).toBeNull()
  })
  it('a 500 or an empty feed is treated as no signal and nothing bad is saved', async () => {
    const bad = vi.fn(async () => new Response('x', { status: 500 })) as unknown as typeof fetch
    expect(await loadOnThisDay(new Date(2026, 9, 28), bad)).toBeNull()
    expect(await loadOnThisDay(new Date(2026, 9, 28), feed([]))).toBeNull()
    expect(await db.kv.get('facts.otd')).toBeUndefined()
  })
  it('pick keeps 3, oldest first, drops long text and non-Wikipedia links, and is the same all day', () => {
    const long = ev(1000, 'x'.repeat(201))
    const off = ev(1200, 'Off site link.', 'https://evil.example/page')
    const r = pick([...EVENTS, long, off], '2026-10-28')
    expect(r).toHaveLength(3)
    expect(r.map((e) => e.year)).toEqual([...r.map((e) => e.year)].sort((a, b) => a - b))
    expect(r.some((e) => e.year === 1000)).toBe(false)
    expect(pick([off], '2026-10-28')[0]!.url).toBeNull()
    expect(pick([...EVENTS, long, off], '2026-10-28')).toEqual(r)
  })
  it('the credit line names CC BY-SA; a Philippine fact is always available offline', () => {
    expect(WIKI_CREDIT).toContain('CC BY-SA')
    expect(phFactOf('2026-10-28').length).toBeGreaterThan(10)
    expect(phFactOf('2026-10-28')).toBe(phFactOf('2026-10-28'))
  })
})

describe("Wikipedia link check", () => {
  it("keeps wikipedia.org and its subdomains, drops look-alike hosts", () => {
    const urls = (page: string) => pick([ev(1900, "x", page)], "2026-10-28")[0]!.url
    expect(urls("https://en.wikipedia.org/wiki/A")).toBe("https://en.wikipedia.org/wiki/A")
    expect(urls("https://wikipedia.org/wiki/A")).toBe("https://wikipedia.org/wiki/A")
    expect(urls("https://evilwikipedia.org/wiki/A")).toBeNull()
    expect(urls("https://en.wikipedia.org.evil.com/wiki/A")).toBeNull()
  })
})
