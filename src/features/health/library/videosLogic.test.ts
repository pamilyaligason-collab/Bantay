import { describe, expect, it } from 'vitest'
import { forSub, forTopic, playable, SUBS, TOPICS, VIDEO_ID, VIDEOS, videosAvailable } from './videosLogic'

describe('videos playlist', () => {
  it('every entry is either a flagged placeholder or a real 11-character id, and ids are unique', () => {
    for (const v of VIDEOS) expect(v.placeholder || VIDEO_ID.test(v.id)).toBe(true)
    expect(new Set(VIDEOS.map((v) => v.id)).size).toBe(VIDEOS.length)
  })
  it('a placeholder or malformed id is never playable', () => {
    const real = { ...VIDEOS[0]!, id: 'dQw4w9WgXcQ', placeholder: false }
    expect(playable(real)).toBe(true)
    expect(playable({ ...real, placeholder: true })).toBe(false)
    expect(playable({ ...real, id: 'short' })).toBe(false)
  })
  it('the 45 official videos (twelve first, seven blood pressure, cholesterol and handwashing added 2026-11-06, eight Filipino and Mayo Clinic videos added 2026-11-08, eighteen health videos added in S25) are in and playable, every length a positive whole number', () => {
    expect(VIDEOS).toHaveLength(45)
    expect(VIDEOS.every(playable)).toBe(true)
    expect(videosAvailable()).toBe(true)
    expect(VIDEOS.every((v) => Number.isInteger(v.minutes) && v.minutes! > 0)).toBe(true)
    expect(forTopic('Safety').length).toBe(13) // 12 of the first 27 plus the CPR clip; the other 17 S25 clips are topic Health
  })
  it('topics filter the list', () => {
    expect(TOPICS[0]).toBe('All')
    expect(forTopic('Diabetes').every((v) => v.topic === 'Diabetes')).toBe(true)
    expect(forTopic('All')).toHaveLength(VIDEOS.length)
  })
  it('every video has a sub chip or null, and every chip has at least one video (counted by hand: heart-bp 17, diabetes 5, infections 4, firstaid 5, mind-sleep 5, food 2, kids 2, five Move clips null)', () => {
    const subs = SUBS.map((s) => s.sub)
    expect(VIDEOS.every((v) => v.sub === null || subs.includes(v.sub))).toBe(true)
    expect(SUBS.map((s) => forSub(s.sub).length)).toEqual([17, 5, 4, 5, 5, 2, 2])
    expect(VIDEOS.filter((v) => v.sub === null).every((v) => v.topic === 'Move')).toBe(true)
    expect(forSub(null)).toHaveLength(40)
  })
  it('a chip lists Philippine sources first and keeps the file order inside each group', () => {
    const heart = forSub('heart-bp')
    const firstOther = heart.findIndex((v) => !v.ph)
    expect(heart.slice(0, firstOther).every((v) => v.ph)).toBe(true)
    expect(heart.slice(firstOther).some((v) => v.ph)).toBe(false)
    expect(heart[0]!.source).toMatch(/Willie Ong|Gary Sy|Philippines/)
  })
  it('no title promises a cure or a miracle, and the look-alike channels are not sources', () => {
    expect(VIDEOS.filter((v) => /glutathione|miracle|cure|lunas|gamot/i.test(v.title))).toEqual([])
    expect(new Set(VIDEOS.filter((v) => /Willie/.test(v.source)).map((v) => v.source))).toEqual(new Set(['Doc Willie Ong']))
  })
})
