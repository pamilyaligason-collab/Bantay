import { describe, expect, it } from 'vitest'
import { videoOfTheDay } from '../../today/videos'
import { featured } from './featured'

const list = ['a', 'b', 'c', 'd', 'e']
const d = new Date(2026, 9, 31, 10, 0)

describe('featured', () => {
  it('hero is the video of the day, more are the next two in list order', () => {
    const f = featured(d, list)
    expect(f.hero).toBe(videoOfTheDay(d, list))
    const i = list.indexOf(f.hero!)
    expect(f.more).toEqual([list[(i + 1) % 5], list[(i + 2) % 5]])
  })
  it('wraps past the end and never repeats the hero', () => {
    for (let day = 1; day <= 10; day++) {
      const f = featured(new Date(2026, 0, day), list)
      expect(f.more.length).toBe(2)
      expect(f.more).not.toContain(f.hero)
    }
  })
  it('a short list gives fewer; an empty list gives null', () => {
    expect(featured(d, ['x'])).toEqual({ hero: 'x', more: [] })
    expect(featured(d, ['x', 'y']).more.length).toBe(1)
    expect(featured(d, [])).toEqual({ hero: null, more: [] })
  })
})
