import { describe, expect, it } from 'vitest'
import { forTopic, playable, TOPICS, VIDEO_ID, VIDEOS, videosAvailable } from './videosLogic'

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
  it('the 27 official videos (twelve first, seven blood pressure, cholesterol and handwashing added 2026-11-06, eight Filipino and Mayo Clinic videos added 2026-11-08) are in and playable, every length a positive whole number', () => {
    expect(VIDEOS).toHaveLength(27)
    expect(VIDEOS.every(playable)).toBe(true)
    expect(videosAvailable()).toBe(true)
    expect(VIDEOS.every((v) => Number.isInteger(v.minutes) && v.minutes! > 0)).toBe(true)
    expect(forTopic('Safety').length).toBe(12)
  })
  it('topics filter the list', () => {
    expect(TOPICS[0]).toBe('All')
    expect(forTopic('Diabetes').every((v) => v.topic === 'Diabetes')).toBe(true)
    expect(forTopic('All')).toHaveLength(VIDEOS.length)
  })
})
