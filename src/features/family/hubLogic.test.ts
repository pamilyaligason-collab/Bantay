import { describe, expect, it } from 'vitest'
import { featured, HUB, SLOTS, usable, type HubCategory } from './hubLogic'

describe('learning hub', () => {
  it('has the four categories with the requested sources', () => {
    expect(HUB.map((c) => c.id)).toEqual(['stress', 'sleep', 'mind', 'move-eat'])
    const all = HUB.flatMap((c) => c.items)
    expect(all.map((i) => i.url ?? i.videoId)).toEqual(expect.arrayContaining([
      'https://www.nimh.nih.gov/health/publications/so-stressed-out-fact-sheet', 'https://medlineplus.gov/healthysleep.html',
      'AQimPkd7g5I', 'HKK-58RZlMA', 'ExEXOfe81Nc', 'b-uX6N4RZjg', 'https://www.who.int/news-room/fact-sheets/detail/healthy-diet'
    ]))
    expect(all.every(usable)).toBe(true)
  })
  it('shows one card per category, with mixed sizes', () => {
    const c = featured(new Date(2026, 9, 21))
    expect(c).toHaveLength(4)
    expect(new Set(c.map((x) => x.category.id)).size).toBe(4)
    expect(c.map((x) => x.size)).toEqual(SLOTS)
  })
  it('keeps the same picks all day and changes them on following days', () => {
    const key = (d: Date) => featured(d).map((x) => x.item.id).join()
    expect(key(new Date(2026, 9, 21, 7))).toBe(key(new Date(2026, 9, 21, 22)))
    const days = new Set(Array.from({ length: 6 }, (_, i) => featured(new Date(2026, 9, 21 + i)).map((x) => `${x.category.id}:${x.item.id}`).join()))
    expect(days.size).toBeGreaterThan(3)
  })
  it('cycles a category through all its items (mental health has 3 videos)', () => {
    const seen = new Set(Array.from({ length: 6 }, (_, i) => featured(new Date(2026, 9, 21 + i)).find((x) => x.category.id === 'mind')!.item.id))
    expect(seen.size).toBe(3)
  })
  it('drops unusable items (bad video id, non-https link) and empty categories', () => {
    const cats: HubCategory[] = [
      { id: 'a', label: 'A', icon: 'brain', items: [{ id: '1', kind: 'video', title: 't', blurb: 'b', credit: 'c', videoId: 'short' }] },
      { id: 'b', label: 'B', icon: 'moon', items: [{ id: '2', kind: 'link', title: 't', blurb: 'b', credit: 'c', url: 'http://example.com' }, { id: '3', kind: 'link', title: 't', blurb: 'b', credit: 'c', url: 'https://example.com' }] }
    ]
    expect(featured(new Date(2026, 9, 21), cats).map((x) => x.item.id)).toEqual(['3'])
    expect(featured(new Date(2026, 9, 21), [])).toEqual([])
  })
})
